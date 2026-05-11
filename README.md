# PGA-DAMIS — Provincial Government of Aurora Dormitory Application & Management Information System

> A full-stack, identity-verified dormitory management platform for students and provincial government administrators.  
> Built with Node.js · Express · SQLite · Socket.io · Gemini AI · ISO/IEC 25010:2023

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Environment Variables](#environment-variables)
4. [Project Structure](#project-structure)
5. [Architecture](#architecture)
6. [Modules & Features](#modules--features)
7. [Database Schema](#database-schema)
8. [API Reference](#api-reference)
9. [Real-Time Events](#real-time-events)
10. [AI Subsystem](#ai-subsystem)
11. [Logging System](#logging-system)
12. [Security Model](#security-model)
13. [ISO/IEC 25010:2023 Compliance](#isoiec-250102023-compliance)
14. [Admin Scripts](#admin-scripts)
15. [Deployment via ngrok](#deployment-via-ngrok)

---

## Overview

PGA-DAMIS serves two audiences through two separate portals:

| Portal | URL | Users |
|---|---|---|
| **Resident Portal** | `http://localhost:3000/` | Students applying for or living in the dormitory |
| **Admin Panel** | `http://localhost:3000/admin.html` | Provincial government staff managing the dormitory |

The system covers the full resident lifecycle — from initial application and document submission through room assignment, monthly billing, and maintenance requests — with a community social feed for approved residents.

---

## Quick Start

```bash
# Install dependencies
npm install

# Development (auto-restarts on file change)
npm run dev

# Production
npm start
```

The server seeds admin accounts from `.env` automatically on every start (no-op if they already exist).

- Resident portal: `http://localhost:3000`
- Admin panel:     `http://localhost:3000/admin.html`

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your values. **Never commit `.env` to version control.**

### Core

| Variable | Description | Default |
|---|---|---|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | `development` or `production` | `development` |
| `APP_NAME` | Application name shown in emails | `PGA-DAMIS` |
| `APP_URL` | Base URL (used in email links) | `http://localhost:3000` |
| `SESSION_SECRET` | Express session signing secret | — |

### Email (Gmail SMTP via Nodemailer)

| Variable | Description |
|---|---|
| `EMAIL_USER` | Gmail address used to send system emails |
| `EMAIL_PASS` | Gmail App Password (16 chars, **not** your account password) |
| `USE_REAL_EMAIL` | `true` = Gmail SMTP · `false` = Ethereal fake inbox (dev) |

> Get an App Password at: **myaccount.google.com → Security → App passwords**

### Google OAuth 2.0

| Variable | Description |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_CALLBACK_URL` | Must match the redirect URI registered in Google Cloud (`/auth/google/callback`) |

### Cloudinary (Image & Document Storage)

| Variable | Description |
|---|---|
| `CLOUDINARY_CLOUD_NAME` | Cloud name from Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |

> Free tier: 25 credits/month — sufficient for development and small deployments.

### AI Moderation (Gemini + DeepSeek Fallback)

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Primary Gemini key (free tier) |
| `GEMINI_API_KEY_2` … `GEMINI_API_KEY_40` | Additional keys for pool rotation (up to 40 total) |
| `GITHUB_TOKEN` | GitHub PAT — used for DeepSeek-V3 fallback via GitHub Models |

> The system rotates across all configured Gemini keys automatically, giving up to 800 AI requests/day at zero cost.

### Admin Accounts (Auto-seeded on Startup)

| Variable | Description |
|---|---|
| `ADMIN_EMAIL` | Primary admin email |
| `ADMIN_PASSWORD` | Primary admin password |
| `ADMIN_FIRST_NAME` | Admin first name |
| `ADMIN_LAST_NAME` | Admin last name |
| `ADMIN2_EMAIL` | (Optional) Secondary admin email |
| `ADMIN2_PASSWORD` | Secondary admin password |
| `ADMIN2_FIRST_NAME` | Secondary admin first name |
| `ADMIN2_LAST_NAME` | Secondary admin last name |

### Test Users (Dev Only)

| Variable | Description |
|---|---|
| `TEST_USERS_ENABLED` | `true` to seed test users on startup |
| `TEST_USER_1` | `FirstName\|MiddleName\|LastName\|username\|email\|password` |
| `TEST_USER_2` | Same format |
| `TEST_USER_3` | Same format |

> Set `TEST_USERS_ENABLED=false` before any real-world deployment.

### Logger Tuning

| Variable | Description | Default |
|---|---|---|
| `SLOW_WARN_MS` | Threshold (ms) before a request is flagged as slow | `1500` |
| `NO_EMOJI` | Set to `1` to strip emoji from log output (useful when piping to files) | — |

---

## Project Structure

```
DAMIS/
├── server.js                   # Express app + Socket.io entry point
│
├── routes/
│   ├── auth.js                 # /api/auth/* — login, register, OTP, Google OAuth, support chat
│   ├── admin.js                # /api/admin/* — all admin operations (protected)
│   ├── posts.js                # /api/posts/* — social feed CRUD, reactions, comments
│   ├── users.js                # /api/users/* — profiles, friends, follows, maintenance requests
│   ├── messages.js             # /api/messages/* — direct messages, reactions, read receipts
│   ├── notifications.js        # /api/notifications/* — create, fetch, mark read
│   └── ai.js                   # /api/ai/* — AI writing tools + /api/admin/settings
│
├── utils/
│   ├── db.js                   # Full SQLite schema + all database helper functions
│   ├── logger.js               # Structured terminal logger (v5) — color-coded, domain-badged
│   ├── geminiPool.js           # 40-key Gemini pool with RPD rotation and DeepSeek fallback
│   ├── emailService.js         # Nodemailer wrappers: OTP, approval, billing, bed-assignment
│   ├── seedAdmin.js            # Auto-seeds admin accounts from .env on startup
│   ├── seedTestUsers.js        # Auto-seeds test residents from .env (dev only)
│   └── passport-setup.js       # Passport.js: local strategy + Google OAuth 2.0
│
├── middleware/
│   ├── auth.js                 # requireAuth, requireAdmin middleware
│   └── upload.js               # Multer configuration + Cloudinary stream upload
│
└── public/
    ├── index.html              # Resident Portal — login + 5-step registration wizard
    ├── feed.html               # Resident social feed (post-approval only)
    ├── messages.html           # Direct messaging + AI reply suggestions
    ├── profile.html            # User profile page
    ├── notifications.html      # Notifications centre
    ├── search.html             # User and post search
    ├── admin.html              # Admin Panel SPA (~4,600 lines)
    ├── css/
    │   ├── app.css             # Main app styles (dark mode included)
    │   └── auth.css            # Registration/login styles
    └── js/
        ├── auth.js             # Registration wizard, OTP flow, Google OAuth, support chat
        └── api.js              # Shared utilities: toast, dark mode, avatar helpers, nav
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                       CLIENT (Browser)                        │
│  Vanilla JS · Tailwind CSS · Font Awesome · Chart.js         │
│  XLSX.js · jsPDF · dayjs · Socket.io client · PWA SW        │
└──────────────────────┬───────────────────────────────────────┘
                       │  HTTP / WebSocket
┌──────────────────────▼───────────────────────────────────────┐
│                 SERVER (Node.js / Express)                     │
│                                                               │
│  Passport.js (local + Google OAuth) · express-session        │
│  Helmet · CORS · express-rate-limit · Morgan                  │
│  Multer (uploads) · sharp (face-crop) · Socket.io            │
└──────┬────────────────────────┬──────────────────────────────┘
       │                        │
┌──────▼──────┐   ┌─────────────▼─────────────────────────────┐
│  SQLite DB  │   │            External Services               │
│ (better-    │   │  • Cloudinary  — image & document hosting  │
│  sqlite3)   │   │  • Google OAuth 2.0                        │
└─────────────┘   │  • Gmail SMTP  — transactional emails      │
                  │  • Gemini AI   — moderation + tools        │
                  │  • DeepSeek-V3 — AI fallback (GitHub Models│
                  └───────────────────────────────────────────┘
```

**Technology rationale:**
- **SQLite** — zero infrastructure; a single file database is appropriate for a provincial government office with no dedicated DB server.
- **Vanilla JS** — no build toolchain required; pages load fast on slow connections and are straightforward to maintain.
- **Cloudinary** — free-tier CDN storage for uploaded images and PDFs keeps the server stateless.
- **Gemini (free) + DeepSeek (fallback)** — AI moderation and writing assistance at zero marginal cost via a 40-key rotation pool (800 requests/day).

---

## Modules & Features

### 1. Resident Registration (5-Step Wizard)

| Step | What happens |
|---|---|
| **1 — Account** | Enter email + password (or continue with Google) |
| **2 — Email OTP** | 6-digit OTP sent to email; verified before proceeding |
| **3 — Application** | Personal info: name, date of birth, sex (Male/Female), civil status, permanent + present address |
| **4 — Profile** | School info (name, course, year level), family info (father/mother), monthly income bracket |
| **5 — Documents** | Upload School ID (front), Certificate of Residency, Certificate of Low Income, Certificate of Enrollment; selfie for face verification |

After submission the account sits in `pending` status. The student cannot log in until an admin approves the application.

**Validation rules enforced:**
- Philippine mobile format (10 digits, starts with 9)
- Email verified via OTP before any data is accepted
- All 4 documents required for a complete application
- Age calculated from date of birth and displayed to admin on the review card
- Duplicate phone/email blocked at both application and database level
- Avatar face-crop applied automatically using AI face-center coordinates (via `sharp`)

---

### 2. Admin Panel

A single-page application with ten management sections.

#### Dashboard
- Live stats: total residents, pending applications, occupied beds, open maintenance requests
- Province/school breakdown charts (Chart.js)
- Recent registrations and activity
- AI API pool health (Gemini usage bar)

#### Applications (Registrations)
- Review pending applications with full inline document viewer
- Approve (with optional room assignment) or reject with written reason
- Rejected applications archived and restorable
- Real-time socket notification when a new application arrives

#### Resident Management
- Full user list with search
- ID verification review
- Ban / unban residents
- View per-resident report count and reputation score
- Delete account (soft-archived to `deleted_users`, restorable)
- **Export to Excel** (Female / Male / All sheets) or **PDF** (Female / Male pages)
  - Columns: `#`, Name, Course, Year Level, Room No., Bed No., Date Joined

#### Room Management
- Add / edit / delete rooms (room number, gender restriction, capacity)
- Assign residents to specific beds; gender-locked rooms only show eligible residents
- Remove assignments
- Occupancy export to Excel or PDF
- Auto-creates a billing record for the current month on every bed assignment

#### Billing
- Configurable monthly dormitory fee (set once, applies to all)
- Per-resident bill status: Unpaid / Paid / Waived
- Mark paid, waive, or undo payment
- Manual or auto-generated billing for all occupied beds
- Individual or bulk payment reminder via email + in-app notification
- **Auto-remind scheduler** — runs every 6 hours during the last 5 days of each month; notifies all residents with unpaid bills automatically
- Export billing data to Excel or PDF

#### Utility Bills
- Log monthly electricity and water bills (amount + units consumed)
- 12-month trend chart per utility type

#### Maintenance Requests
- Residents submit tickets with category, title, description, priority, and location
- Admin filters by status: Open / In Progress / Resolved / Closed
- Admin updates status and adds notes; resident notified via Socket.io in real time
- Export all requests to Excel or PDF

#### Post Queue & Content Moderation
- AI-pre-screened posts awaiting manual review
- Per-post or bulk AI review via Gemini
- Approve or reject individual posts
- **Auto-moderation toggle** — when enabled, every new post is reviewed by Gemini automatically; approved posts go live instantly, rejected posts trigger a resident notification
- Full post list with search and filter

#### ID Verification
- Review re-submitted identity verification requests
- Approve or reject with reason; AI-assisted review available

#### Audit & AI Logs
- Full admin action history with timestamps (Audit Log)
- Every AI moderation decision stored with confidence score, reason, and model used (AI Log)

---

### 3. Resident Portal (Post-Approval)

Once approved, residents access:

- **Social Feed** — post text and images; react with emoji; comment and reply. AI writing tools in the composer: Caption Generator, Text Rewriter, Hashtag Suggestions.
- **Direct Messages** — real-time DMs with image sharing, emoji reactions, seen ticks, and AI reply suggestions.
- **Notifications** — real-time + persistent for all social actions, billing events, and maintenance updates.
- **Profile** — edit bio, avatar, cover photo; view posts, friends, and followers.
- **Search** — find users and posts.
- **Dormitory Info** — view assigned room and bed.
- **Maintenance Requests** — submit and track repair requests.
- **Billing** — view monthly bill status and add comments to individual bills.

---

### 4. Community Features

| Feature | Description |
|---|---|
| Friend system | Add / accept / decline / unfriend with real-time notifications |
| Follow system | Follow without friending (separate relationship) |
| Reactions | Emoji reactions on posts, comments, and messages |
| Reputation | Up/down votes per user; shown in admin panel |
| User reports | Report users; admin reviews from the dashboard |
| Support chat | AI-powered help widget on the login page (Gemini) |
| Password reset | OTP-based forgot-password flow |

---

## Database Schema

| Table | Purpose |
|---|---|
| `users` | All accounts — residents and admins; includes full registration profile, document URLs, address, school, family info |
| `dorm_rooms` | Room registry: room number, gender restriction, capacity |
| `bed_assignments` | Links a resident to a specific room and bed |
| `dorm_billing` | Monthly bill per resident: amount, status (unpaid/paid/waived), timestamps |
| `utility_bills` | Dorm-wide monthly electricity and water bills |
| `maintenance_requests` | Resident-submitted maintenance tickets with priority and status lifecycle |
| `posts` | Social feed posts: content, image, moderation status |
| `comments` | Nested comments on posts |
| `reactions` | Typed emoji reactions on posts, comments, and messages |
| `messages` | Direct messages between two users |
| `message_reactions` | Emoji reactions on individual messages |
| `friendships` | Mutual friendships (pending → accepted) |
| `follows` | One-way follows |
| `follow_requests` | Follow requests (pending / accepted / declined) |
| `notifications` | Per-user notifications with type and read status |
| `otp_store` | Active OTP codes with expiry |
| `reset_store` | Active password-reset OTP codes |
| `login_attempts` | Brute-force tracking per IP/email |
| `id_verification_requests` | ID re-verification submissions |
| `admin_logs` | Full audit trail of every admin action |
| `ai_moderation_log` | Gemini/DeepSeek moderation decisions with confidence scores |
| `app_settings` | Key-value config store (auto-mod toggle, billing rate, etc.) |
| `reputation_votes` | Up/down votes cast on users |
| `user_reports` | Resident-reported abuse reports |
| `rejected_registrations` | Archived rejected applications (restorable) |
| `deleted_users` | Soft-deleted user records |

---

## API Reference

### Auth — `/api/auth/`

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/send-otp` | Send OTP to email |
| `POST` | `/resend-otp` | Resend OTP |
| `POST` | `/verify-otp` | Verify OTP code |
| `POST` | `/complete-registration` | Submit full registration + document upload |
| `POST` | `/login` | Email + password login |
| `GET` | `/logout` | End session |
| `GET` | `/me` | Current session user |
| `GET/POST` | `/auth/google` | Google OAuth initiation |
| `GET` | `/auth/google/callback` | Google OAuth callback |
| `POST` | `/forgot-password` | Send password-reset OTP |
| `POST` | `/verify-reset-otp` | Verify reset OTP |
| `POST` | `/reset-password` | Set new password |
| `GET` | `/check-username` | Username availability check |
| `GET` | `/check-phone` | Phone availability check |
| `POST` | `/support-chat` | AI-powered support chat |
| `GET` | `/support-status` | Support chat availability |
| `GET` | `/support-admin` | Support admin user info |
| `POST` | `/contact-admin` | Direct contact form to admin |

### Admin — `/api/admin/`

**Applications**

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/accounts/pending` | List pending applications |
| `PUT` | `/accounts/:id/approve` | Approve an application |
| `PUT` | `/accounts/:id/reject` | Reject with reason |
| `GET` | `/accounts/rejected` | List rejected applications |
| `PUT` | `/accounts/rejected/:id/restore` | Restore a rejected application |

**Users**

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/users` | All approved users (includes room/bed assignment) |
| `GET` | `/users/:id` | Single user detail |
| `GET` | `/users/:id/reputation` | User reputation score |
| `PUT` | `/users/:id/verify` | Mark ID as verified |
| `PUT` | `/users/:id/ban` | Ban user |
| `PUT` | `/users/:id/unban` | Unban user |
| `PUT` | `/users/:id/role` | Change user role |
| `DELETE` | `/users/:id` | Delete user (soft archive) |
| `GET` | `/users/deleted` | Deleted users archive |
| `PUT` | `/users/deleted/:id/restore` | Restore deleted user |
| `GET` | `/users/reports` | All user reports |
| `GET` | `/users/report-counts` | Report count per user |
| `PUT` | `/reports/:id/status` | Update report status |

**Dormitory**

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/dormitory/rooms` | All rooms with current occupants |
| `POST` | `/dormitory/rooms` | Add a room |
| `PUT` | `/dormitory/rooms/:id` | Edit room |
| `DELETE` | `/dormitory/rooms/:id` | Delete room |
| `GET` | `/dormitory/users` | Residents eligible for assignment |
| `POST` | `/dormitory/assign` | Assign resident to bed |
| `DELETE` | `/dormitory/unassign/:userId` | Remove bed assignment |
| `GET` | `/dormitory/billing` | Monthly billing list |
| `POST` | `/dormitory/billing/generate` | Generate bills for all occupied beds |
| `PUT` | `/dormitory/billing/:id/pay` | Mark bill as paid |
| `PUT` | `/dormitory/billing/:id/unpay` | Undo payment |
| `PUT` | `/dormitory/billing/:id/waive` | Waive a bill |
| `POST` | `/dormitory/billing/:id/remind` | Send reminder for one bill |
| `POST` | `/dormitory/billing/remind-all` | Send reminders to all unpaid bills |
| `GET/PUT` | `/dormitory/billing/rate` | Get / set monthly billing rate |

**Exports**

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/export/rooms` | Room occupancy data (client-side export) |
| `GET` | `/export/billing` | Billing data (client-side export) |
| `GET` | `/export/maintenance` | Maintenance data (client-side export) |

**Maintenance, Posts, Utility Bills, Verification, Logs**

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/maintenance/requests` | All maintenance requests |
| `PUT` | `/maintenance/requests/:id` | Update request status / add note |
| `GET` | `/maintenance/stats` | Request counts by status |
| `GET` | `/utility/bills` | Monthly utility bills |
| `GET` | `/utility/trend` | 12-month trend data |
| `GET` | `/posts/pending` | Pending post queue |
| `GET` | `/posts/all` | All posts |
| `PUT` | `/posts/:id/approve` | Approve a post |
| `PUT` | `/posts/:id/reject` | Reject a post |
| `POST` | `/posts/:id/ai-review` | AI review a single post |
| `POST` | `/posts/ai-bulk-review` | AI review all pending posts |
| `GET` | `/verifications/pending` | Pending ID verifications |
| `PUT` | `/verifications/:id/approve` | Approve verification |
| `PUT` | `/verifications/:id/reject` | Reject verification |
| `POST` | `/verifications/:id/ai-review` | AI review a verification |
| `GET` | `/logs` | Audit log |
| `GET` | `/ai-moderation-log` | AI decision log |
| `GET` | `/ai-status` | Gemini pool health |
| `GET` | `/stats` | Dashboard statistics |
| `GET/PUT` | `/settings` | App settings (auto-mod toggle, etc.) |

---

## Real-Time Events (Socket.io)

| Event | Direction | Triggered by |
|---|---|---|
| `new-notification` | Server → user | Any notifiable action (approval, billing, DM, etc.) |
| `receive-dm` | Server → user | New direct message received |
| `user-typing` | Server → conversation partner | User starts typing |
| `user-stopped-typing` | Server → conversation partner | User stops typing |
| `bed_assigned` | Server → user | Admin assigns a room/bed |
| `bed_unassigned` | Server → user | Admin removes bed assignment |
| `billing_updated` | Server → user | Bill status changes |
| `post_approved` | Server → user | Admin or auto-mod approves a post |
| `post_rejected` | Server → user | Admin or auto-mod rejects a post |
| `user-online` | Server → all | User connects |
| `user-offline` | Server → all | User disconnects |

---

## AI Subsystem

```
Request
    │
    ▼
Gemini Pool  (up to 40 keys · 800 req/day total)
    │  (429 RPD on all keys)
    ▼
DeepSeek-V3-0324  via GitHub Models
    │  (GITHUB_TOKEN missing or DeepSeek error)
    ▼
Graceful fallback response
```

| Feature | Route | Where used |
|---|---|---|
| Post auto-moderation | Internal (on `POST /api/posts`) | Admin-configurable toggle |
| Bulk post review | `POST /api/admin/posts/ai-bulk-review` | Admin post queue |
| Single post review | `POST /api/admin/posts/:id/ai-review` | Admin post queue |
| ID verification review | `POST /api/admin/verifications/:id/ai-review` | Admin verification panel |
| Caption generator | `POST /api/ai/generate-caption` | Feed composer |
| Text rewriter | `POST /api/ai/rewrite` | Feed composer |
| Hashtag suggestions | `POST /api/ai/hashtags` | Feed composer |
| Reply suggestions | `POST /api/ai/reply-suggestions` | Messages |
| Support chat | `POST /api/auth/support-chat` | Login page widget |

**Key rotation:** keys rotate automatically on RPD 429 errors. The pool resets at midnight UTC.

---

## Logging System

`utils/logger.js` v5 — structured, color-coded, domain-badged terminal output.

### Log Levels

| Badge | Color | Used for |
|---|---|---|
| `OK` | Green | Successful startup events |
| `INFO` | Blue | General request logging |
| `WARN` | Yellow | Slow requests, suspicious activity |
| `ERROR` | Red | 5xx errors, upload failures |
| `DEV` | Gray | Dev-only debug output (suppressed in production) |

### Domain Badges

| Badge | Used for |
|---|---|
| `AUTH` | Login, logout, OTP events |
| `REG` | New resident registrations |
| `UPLOAD` | Cloudinary upload progress and results |
| `ADMIN` | Approval, ban, delete, and other admin actions |
| `DORM` | Room assignment, billing, bed events |
| `BILLING` | Auto-billing scheduler and payment reminders |
| `SOCKET` | WebSocket connection and room events |
| `EMAIL` | Outgoing email confirmations |
| `AI` | Gemini / DeepSeek call outcomes |

### Features

- **Philippine Time (PHT)** timestamps on every line
- **HTTP method coloring** — GET (green), POST (cyan), PUT (yellow), DELETE (red)
- **Route group tags** — `[admin]` / `[auth]` / `[api]` inline on each request line
- **Sensitive field scrubbing** — passwords, OTPs, and tokens automatically redacted in body dumps
- **Slow-request detection** — `SLOW` at >1,500 ms, `VERY SLOW` at >3,000 ms (override via `SLOW_WARN_MS`)
- **Static asset silencing** — 200/304 hits for `.css`, `.js`, `.ico`, etc. suppressed in logs
- **304 suppression in production** — Not Modified responses hidden outside dev mode
- `log.diff(label, before, after)` — shows field-level changes for any record update
- `log.dump(label, obj)` — aligned key-value output for registration and upload details
- `log.timing(label, breakdown)` — inline bar chart for multi-step flow timings
- `NO_EMOJI=1` env var strips all emoji for clean pipe / file output

---

## Security Model

| Layer | Implementation |
|---|---|
| **Passwords** | bcrypt (cost factor 12) |
| **Sessions** | Server-side via `express-session`; only a session ID stored in the browser cookie |
| **OTP** | 6-digit code, 10-minute expiry, max 5 attempts |
| **Login brute-force** | 15-minute lockout after repeated failures (`login_attempts` table) |
| **Rate limiting** | `express-rate-limit` on all auth endpoints and general API |
| **HTTP headers** | Helmet.js (HSTS, X-Frame-Options, CSP, referrer policy, etc.) |
| **File uploads** | MIME type + size validation via Multer before any Cloudinary upload |
| **Input escaping** | `escHtml()` on all user-controlled strings rendered in the admin panel |
| **Admin gate** | Every `/api/admin/*` route requires `role = 'admin'` verified server-side |
| **Account gate** | Only `account_status = 'approved'` residents can access the feed and portal features |
| **Duplicate prevention** | Unique constraints on email, username, and phone at the database level |
| **OAuth** | Google OAuth 2.0 via Passport.js; no passwords stored for Google accounts |
| **AI content moderation** | Optional auto-moderation flag reviewed on every new post |

---

## ISO/IEC 25010:2023 Compliance

| Characteristic | Implementation |
|---|---|
| **Functional Suitability** | Complete dormitory lifecycle: application → approval → room assignment → billing → maintenance. Social feed and community tools for resident engagement. |
| **Performance Efficiency** | 40-key Gemini pool (800 req/day free), indexed SQLite queries, browser-side export (no server-side PDF rendering), lazy pagination on feed and post lists. Slow-request detection via structured logger. |
| **Compatibility** | Cross-browser vanilla JS. PWA manifest + service worker for offline shell. Responsive Tailwind CSS layout. |
| **Usability** | Dark mode throughout. 5-step guided registration wizard with inline validation. AI writing tools in the feed composer. Admin bulk operations for efficiency. Automatic avatar face-crop on upload. |
| **Reliability** | Socket.io automatic reconnection. Graceful AI fallback chain (Gemini → DeepSeek → static message). Auto-seeded admin accounts prevent admin lockout. Soft-delete and archive patterns prevent irreversible data loss. |
| **Security** | bcrypt, OTP, brute-force lockout, Helmet, rate limiting, MIME validation, HTML escaping, server-side role gates, configurable AI content moderation. |
| **Maintainability** | Modular route files by domain. Single-source schema and helpers in `db.js`. Structured logger with domain-specific badges. Environment-driven configuration with no hard-coded secrets. Admin CLI scripts for account management. |
| **Portability** | Node.js + SQLite — runs on any machine without a dedicated database server. No cloud vendor lock-in for core logic. Docker-compatible file structure. |

---

## Admin Scripts

```bash
# Create or update the admin account interactively
npm run create-admin

# Promote an existing resident account to admin
npm run promote-admin

# Reset admin password
npm run reset-admin

# Show current admin account status
npm run admin-status
```

---

## Deployment via ngrok

For demos or remote access without a public server:

```bash
# Terminal 1 — run the app
npm run dev

# Terminal 2 — expose it publicly
ngrok http 3000
```

ngrok provides a public HTTPS URL tunneling to your local server. Both the resident portal and admin panel are reachable at that URL.

**What stays local:** the SQLite database file and all application code.  
**What is external:** uploaded images/documents (Cloudinary), outgoing email (Gmail SMTP), and AI calls (Gemini/DeepSeek).

> Keep both terminals running during demos. The tunnel drops if the machine sleeps or nodemon restarts.

---

## License

PGA-DAMIS · © 2026 Provincial Government of Aurora · Web Systems & Technologies
