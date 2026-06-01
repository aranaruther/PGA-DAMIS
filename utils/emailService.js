/**
 * utils/emailService.js
 *
 * WATERFALL DRIVER SYSTEM — drivers are tried in priority order.
 * If a driver fails with a permanent account-level error it is marked
 * as degraded and skipped for the rest of the process lifetime.
 * The console driver is always the final fallback: OTPs are ALWAYS visible
 * in Railway logs even when every cloud provider is unavailable.
 *
 * Driver priority: SENDGRID → BREVO → RESEND → SMTP → CONSOLE
 *
 * Setup (Railway env vars):
 *   SENDGRID → SENDGRID_API_KEY + SENDGRID_FROM  ← PRIMARY
 *              ✅ 100 emails/day free forever. No IP restrictions. No domain needed.
 *              Sign up  → https://signup.sendgrid.com
 *              Verify   → Settings → Sender Authentication → Single Sender Verification
 *              API key  → Settings → API Keys → Create API Key (Mail Send permission only)
 *   BREVO    → BREVO_API_KEY + BREVO_FROM
 *              ⚠ Disable IP restriction: https://app.brevo.com/security/authorised_ips
 *   RESEND   → RESEND_API_KEY  (requires a verified domain, not just an email)
 *   SMTP     → USE_REAL_EMAIL=true + EMAIL_USER + EMAIL_PASS
 *              ⚠ Railway blocks SMTP ports 465/587
 *   CONSOLE  → automatic fallback when no provider is configured or all fail
 *
 * Permanent failure detection (driver is skipped for remainder of uptime):
 *   HTTP 401, "temporarily blocked", "account suspended", "sender not verified",
 *   "domain not verified", "unrecognized IP"
 */

'use strict';

const nodemailer = require('nodemailer');

// ─────────────────────────────────────────────────────────────────────────────
// Waterfall driver chain
// ─────────────────────────────────────────────────────────────────────────────

/** Ordered list of drivers available in this process (console always last). */
const DRIVER_CHAIN = (() => {
  const chain = [];
  if (process.env.SENDGRID_API_KEY)             chain.push('sendgrid');
  if (process.env.BREVO_API_KEY)                chain.push('brevo');
  if (process.env.RESEND_API_KEY)               chain.push('resend');
  if (process.env.USE_REAL_EMAIL === 'true')    chain.push('smtp');
  chain.push('console'); // always present
  return chain;
})();

/**
 * Per-driver health. 'ok' → try normally. 'failed' → skip (permanent error).
 * Resets only on process restart. This prevents hammering a blocked provider.
 */
const _driverHealth = Object.fromEntries(DRIVER_CHAIN.map(d => [d, 'ok']));

/** The primary (first non-console) driver — used for startup log & getDriver(). */
const DRIVER = DRIVER_CHAIN[0]; // may be 'console' if nothing is configured

/**
 * Returns true for errors that mean the driver itself is permanently broken
 * for this process (account blocked, credentials invalid, IP banned, etc.).
 * These are distinct from transient network errors; we skip the driver permanently.
 */
function _isPermanentDriverError(msg = '') {
  const m = msg.toLowerCase();
  return (
    m.includes('401') ||
    m.includes('temporarily blocked') ||
    m.includes('account has been') ||
    m.includes('account suspended') ||
    m.includes('unrecognized ip') ||
    m.includes('unauthorized') ||
    m.includes('sender not verified') ||
    m.includes('domain not verified') ||
    m.includes('invalid api key') ||
    m.includes('authentication failed')
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lazy-loaded Resend client
// ─────────────────────────────────────────────────────────────────────────────
let _resend = null;
function getResend() {
  if (!_resend) {
    try {
      const { Resend } = require('resend');
      _resend = new Resend(process.env.RESEND_API_KEY);
    } catch {
      throw new Error('resend package not installed — run: npm install resend');
    }
  }
  return _resend;
}

// ─────────────────────────────────────────────────────────────────────────────
// SMTP transporter (Gmail)
// ─────────────────────────────────────────────────────────────────────────────
let smtpTransporter = null;

async function initSMTP() {
  smtpTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  // Railway blocks outbound SMTP (port 587) — skip the live verify in
  // production to avoid a noisy timeout in the startup log.
  // SendGrid handles all production email anyway.
  if (process.env.NODE_ENV === 'production') {
    console.log('   ℹ  Gmail SMTP configured (verify skipped in production — Railway blocks port 587)');
    return;
  }

  try {
    await smtpTransporter.verify();
    console.log('✅ Gmail SMTP connected —', process.env.EMAIL_USER);
  } catch (err) {
    console.error('❌ Gmail SMTP failed:', err.message);
    console.warn('   Make sure EMAIL_PASS is a Gmail App Password (16 chars, no spaces).');
    console.warn('   ⚠  Railway blocks SMTP — use SENDGRID_API_KEY instead.');
    smtpTransporter = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function generateOTP() {
  const { randomInt } = require('crypto');
  return String(randomInt(100000, 999999));
}

function APP_NAME()  { return process.env.APP_NAME || 'PGA-DAMIS'; }
function APP_URL()   { return process.env.APP_URL  || 'http://localhost:3000'; }

function FROM_EMAIL() {
  return (
    process.env.SENDGRID_FROM  ||
    process.env.BREVO_FROM     ||
    process.env.RESEND_FROM    ||
    process.env.EMAIL_USER     ||
    'noreply@pgadamis.gov.ph'
  );
}

function FROM_ADDRESS() {
  return `"${APP_NAME()}" <${FROM_EMAIL()}>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Boot — runs once on module load
// ─────────────────────────────────────────────────────────────────────────────
(async () => {
  const from = FROM_EMAIL();
  const labels = { sendgrid: 'SendGrid API', brevo: 'Brevo API', resend: 'Resend API', smtp: 'Gmail SMTP', console: 'Console (fallback)' };

  if (DRIVER_CHAIN[0] === 'console') {
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  📧  Email driver : CONSOLE (development mode)             ║');
    console.log('║  Emails are NOT delivered. OTPs will appear here.          ║');
    console.log('║  → Railway: set SENDGRID_API_KEY + SENDGRID_FROM           ║');
    console.log('║  → Gmail/VPS: set USE_REAL_EMAIL=true                      ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');
    return;
  }

  const chainStr = DRIVER_CHAIN.map(d => labels[d] || d).join(' → ');
  console.log(`✅ Email driver : ${labels[DRIVER_CHAIN[0]]} — from=${from}`);
  console.log(`   Chain        : ${chainStr}`);

  if (DRIVER_CHAIN.includes('smtp')) await initSMTP();
  if (DRIVER_CHAIN.includes('sendgrid')) {
    console.log('   ✅ SendGrid: no IP restrictions, 100 emails/day free forever');
  }
  if (DRIVER_CHAIN.includes('brevo')) {
    console.warn('   ⚠  Brevo: if IP errors appear, disable restrictions at');
    console.warn('      https://app.brevo.com/security/authorised_ips');
  }
})().catch(console.error);

// ─────────────────────────────────────────────────────────────────────────────
// Per-driver send implementations
// ─────────────────────────────────────────────────────────────────────────────

async function _sendSendGrid({ to, subject, html, text }) {
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from:             { email: FROM_EMAIL(), name: APP_NAME() },
      subject,
      content: [
        { type: 'text/plain', value: text },
        { type: 'text/html',  value: html },
      ],
    }),
  });
  // SendGrid returns 202 Accepted on success with an empty body
  if (!res.ok) {
    let detail = '';
    try {
      const data = await res.json();
      detail = data?.errors?.map(e => e.message).join(', ') || JSON.stringify(data);
    } catch { detail = res.statusText; }
    throw new Error(`SendGrid ${res.status}: ${detail}`);
  }
  // Extract message ID from response header (X-Message-Id)
  return res.headers.get('X-Message-Id') || undefined;
}

async function _sendBrevo({ to, subject, html, text }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'accept': 'application/json', 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: { name: APP_NAME(), email: FROM_EMAIL() },
      to: [{ email: to }],
      subject, htmlContent: html, textContent: text,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${data?.message || JSON.stringify(data)}`);
  return data?.messageId;
}

async function _sendResend({ to, subject, html, text }) {
  const resend = getResend();
  const { data, error } = await resend.emails.send({ from: FROM_ADDRESS(), to: [to], subject, html, text });
  if (error) throw new Error(`Resend: ${error.message || JSON.stringify(error)}`);
  return data?.id;
}

async function _sendSMTP({ to, subject, html, text }) {
  if (!smtpTransporter) throw new Error('SMTP transporter not available — check EMAIL_USER / EMAIL_PASS.');
  const info = await smtpTransporter.sendMail({ from: FROM_ADDRESS(), to, subject, html, text });
  return info.messageId;
}

function _sendConsole({ to, subject, text }) {
  const border = '═'.repeat(60);
  console.log('');
  console.log(`╔${border}╗`);
  console.log(`║  📬  [EMAIL→CONSOLE]  ${subject.slice(0, 37).padEnd(37)}  ║`);
  console.log(`║  To: ${to.padEnd(54)}║`);
  console.log(`╚${border}╝`);
  if (text) console.log(text.trim());
  console.log('');
}

const _DRIVER_FN = { sendgrid: _sendSendGrid, brevo: _sendBrevo, resend: _sendResend, smtp: _sendSMTP };

// ─────────────────────────────────────────────────────────────────────────────
// Core send — waterfall across the driver chain
// ─────────────────────────────────────────────────────────────────────────────
async function _send({ to, subject, html, text }) {
  for (const driver of DRIVER_CHAIN) {
    // ── Console fallback (always succeeds) ────────────────────────────────────
    if (driver === 'console') {
      _sendConsole({ to, subject, text });
      return { success: true, driver: 'console' };
    }

    // ── Skip drivers that failed permanently this process lifetime ─────────────
    if (_driverHealth[driver] === 'failed') continue;

    try {
      const msgId = await _DRIVER_FN[driver]({ to, subject, html, text });
      return { success: true, driver, messageId: msgId };
    } catch (err) {
      const permanent = _isPermanentDriverError(err.message);
      if (permanent) {
        _driverHealth[driver] = 'failed';
        console.error(`⚠️  [emailService] ${driver} permanently degraded: ${err.message}`);
        console.warn(`   → Falling through to next driver in chain.`);
      } else {
        // Transient error — log and try next driver this time (don't mark as failed)
        console.error(`⚠️  [emailService] ${driver} transient error: ${err.message}`);
        console.warn(`   → Trying next driver.`);
      }
      // Continue to next driver in chain
    }
  }

  // Should never reach here because console is always last
  return { success: false, driver: 'none' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Template helpers — keeps individual send functions DRY
// ─────────────────────────────────────────────────────────────────────────────
function emailWrapper(headerGradient, headerEmoji, headerTitle, headerSub, bodyHtml) {
  const appName = APP_NAME();
  const url     = APP_URL();
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding:40px 20px;">
    <table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
      <tr>
        <td style="background:${headerGradient};padding:32px;text-align:center;">
          <div style="font-size:26px;font-weight:800;color:#fff;">${headerEmoji} ${headerTitle}</div>
          ${headerSub ? `<div style="color:rgba(255,255,255,.7);font-size:13px;margin-top:4px;">${headerSub}</div>` : ''}
        </td>
      </tr>
      <tr><td style="padding:36px 40px;">${bodyHtml}</td></tr>
      <tr>
        <td style="background:#f8fafc;padding:16px 40px;border-top:1px solid #e2e8f0;text-align:center;">
          <p style="color:#cbd5e1;font-size:12px;margin:0;">
            &copy; 2026 ${appName} &middot; Provincial Government of Aurora<br/>
            <a href="${url}" style="color:#93c5fd;text-decoration:none;">${url}</a>
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

const greeting = (firstName) =>
  `<p style="color:#475569;font-size:15px;margin:0 0 16px;">Hi <strong style="color:#1e293b;">${firstName}</strong>,</p>`;

const para = (text) =>
  `<p style="color:#475569;font-size:15px;margin:0 0 28px;line-height:1.6;">${text}</p>`;

const btn = (href, label, bg = '#1d4ed8') =>
  `<a href="${href}" style="display:inline-block;margin-top:8px;padding:12px 28px;background:${bg};color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">${label}</a>`;

const warningBox = (msg) =>
  `<div style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:8px;padding:12px 16px;margin-bottom:24px;">
    <p style="color:#92400e;font-size:13px;margin:0;">&#9888;&#65039; ${msg}</p>
  </div>`;

const otpBlock = (otp, bg = '#eff6ff', border = '#bfdbfe', color = '#1d4ed8') =>
  `<div style="text-align:center;margin:0 0 28px;">
    <div style="display:inline-block;background:${bg};border:2px solid ${border};border-radius:16px;padding:20px 40px;">
      <div style="font-size:42px;font-weight:800;color:${color};letter-spacing:14px;font-family:monospace;">${otp}</div>
    </div>
    <p style="color:#94a3b8;font-size:12px;margin:10px 0 0;">&#9200; Expires in <strong>10 minutes</strong></p>
  </div>`;

// ─────────────────────────────────────────────────────────────────────────────
// Public send functions
// ─────────────────────────────────────────────────────────────────────────────
async function sendOTPEmail(toEmail, otp, firstName = 'there') {
  const appName = APP_NAME();
  const body = emailWrapper(
    'linear-gradient(135deg,#1e3a8a,#2563eb)', '&#128309;', 'Email Verification', appName,
    greeting(firstName) +
    para(`Your <strong>${appName}</strong> verification code is below. Enter it on the registration page to verify your email address.`) +
    otpBlock(otp) +
    warningBox(`<strong>Never share this code.</strong> ${appName} staff will never ask for your OTP.`) +
    `<p style="color:#94a3b8;font-size:13px;margin:0;">If you didn't request this, ignore this email.</p>`
  );
  const text = `${appName} Verification\n\nHi ${firstName},\n\nYour verification code: ${otp}\n\nExpires in 10 minutes. Never share this code.\n\nIf you didn't request this, ignore this email.`;
  try {
    const result = await _send({ to: toEmail, subject: `${otp} — Your ${appName} verification code`, html: body, text });
    if (result.driver !== 'console') {
      const ts = new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      console.log(`  ✉  OTP sent [${result.driver}] → ${toEmail} | code=${otp} | ${ts}${result.messageId ? ` | id=${result.messageId}` : ''}`);
    }
    return result;
  } catch (err) {
    console.error(`❌ [emailService] sendOTPEmail → ${toEmail} | driver=${DRIVER_CHAIN[0]} | ${err.message}`);
    return { success: false };
  }
}

async function sendPasswordResetEmail(toEmail, otp, firstName = 'there') {
  const appName = APP_NAME();
  const body = emailWrapper(
    'linear-gradient(135deg,#7c3aed,#4f46e5)', '&#128273;', 'Password Reset', appName,
    greeting(firstName) +
    para(`Use this code to reset your <strong>${appName}</strong> password.`) +
    otpBlock(otp, '#f5f3ff', '#c4b5fd', '#4f46e5') +
    `<p style="color:#475569;font-size:13px;margin:0;">If you didn't request a password reset, ignore this email. Your account is safe.</p>`
  );
  const text = `${appName} Password Reset\n\nHi ${firstName},\n\nYour reset code: ${otp}\n\nExpires in 10 minutes.\n\nIf you didn't request this, ignore this email.`;
  try {
    const result = await _send({ to: toEmail, subject: `${otp} — Your ${appName} password reset code`, html: body, text });
    if (result.driver !== 'console') console.log(`  🔑 Password reset sent [${result.driver}] → ${toEmail}`);
    return result;
  } catch (err) {
    console.error(`❌ [emailService] sendPasswordResetEmail → ${toEmail} | driver=${DRIVER_CHAIN[0]} | ${err.message}`);
    return { success: false };
  }
}

async function sendWelcomeEmail(toEmail, firstName) {
  const appName = APP_NAME();
  const body = emailWrapper(
    'linear-gradient(135deg,#1e3a8a,#2563eb)', '&#127881;', `Welcome to ${appName}!`, null,
    greeting(firstName) +
    `<p style="color:#475569;font-size:15px;line-height:1.7;margin:0;">
      Your email is verified &#127882;<br/><br/>
      Your government ID is under review — we'll notify you within <strong>24 hours</strong> once approved.<br/><br/>
      Thank you for joining ${appName}!
    </p>`
  );
  const text = `Welcome to ${appName}!\n\nHi ${firstName}, your email is verified.\n\nYour government ID is under review — we'll notify you within 24 hours once approved.\n\nThank you!`;
  try {
    const result = await _send({ to: toEmail, subject: `Welcome to ${appName}! 🎉`, html: body, text });
    if (result.driver !== 'console') console.log(`  🎉 Welcome email sent [${result.driver}] → ${toEmail}`);
    return result;
  } catch (err) {
    console.error(`❌ [emailService] sendWelcomeEmail → ${toEmail} | driver=${DRIVER_CHAIN[0]} | ${err.message}`);
    return { success: false };
  }
}

async function sendAccountPendingEmail(toEmail, firstName) {
  const appName = APP_NAME();
  const body = emailWrapper(
    'linear-gradient(135deg,#92400e,#d97706)', '&#9203;', 'Account Under Review', appName,
    greeting(firstName) +
    `<p style="color:#475569;font-size:15px;line-height:1.7;margin:0;">
      Thank you for registering. Your account is currently under review by our administrators.<br/><br/>
      We'll send you an email once approved. This usually takes <strong>24 hours</strong>.
    </p>`
  );
  const text = `Account Under Review — ${appName}\n\nHi ${firstName},\n\nYour account is under review. We'll notify you within 24 hours once approved.`;
  try {
    const result = await _send({ to: toEmail, subject: `[${appName}] Your account is under review`, html: body, text });
    if (result.driver !== 'console') console.log(`  ⏳ Account pending email sent [${result.driver}] → ${toEmail}`);
    return result;
  } catch (err) {
    console.error(`❌ [emailService] sendAccountPendingEmail → ${toEmail} | driver=${DRIVER_CHAIN[0]} | ${err.message}`);
    return { success: false };
  }
}

async function sendAccountApprovedEmail(toEmail, firstName) {
  const appName = APP_NAME();
  const appUrl  = APP_URL();
  const body = emailWrapper(
    'linear-gradient(135deg,#14532d,#16a34a)', '&#9989;', 'Account Approved!', appName,
    greeting(firstName) +
    `<p style="color:#475569;font-size:15px;line-height:1.7;margin:0 0 16px;">
      Great news! Your <strong>${appName}</strong> account has been approved. You can now log in and access all features.
    </p>` +
    btn(appUrl, `Go to ${appName}`, '#16a34a')
  );
  const text = `Account Approved — ${appName}\n\nHi ${firstName},\n\nYour account has been approved! Log in at: ${appUrl}`;
  try {
    const result = await _send({ to: toEmail, subject: `[${appName}] Your account has been approved ✅`, html: body, text });
    if (result.driver !== 'console') console.log(`  ✅ Account approved email sent [${result.driver}] → ${toEmail}`);
    return result;
  } catch (err) {
    console.error(`❌ [emailService] sendAccountApprovedEmail → ${toEmail} | driver=${DRIVER_CHAIN[0]} | ${err.message}`);
    return { success: false };
  }
}

async function sendAccountRejectedEmail(toEmail, firstName, reason = '') {
  const appName = APP_NAME();
  const appUrl  = APP_URL();
  const reasonBlock = reason
    ? `<div style="background:#fef2f2;border-left:4px solid #ef4444;border-radius:8px;padding:12px 16px;margin:16px 0;">
         <p style="color:#991b1b;font-size:13px;margin:0;"><strong>Reason:</strong> ${reason}</p>
       </div>`
    : '';
  const body = emailWrapper(
    'linear-gradient(135deg,#7f1d1d,#dc2626)', '&#10060;', 'Account Not Approved', appName,
    greeting(firstName) +
    `<p style="color:#475569;font-size:15px;line-height:1.7;margin:0 0 8px;">
      Unfortunately, your <strong>${appName}</strong> account application was not approved at this time.
    </p>` +
    reasonBlock +
    `<p style="color:#475569;font-size:14px;line-height:1.7;margin:8px 0 16px;">
      You may re-apply with the correct documents. If you believe this is an error, please contact the dormitory office.
    </p>` +
    btn(appUrl, 'Contact Admin', '#dc2626')
  );
  const text = `Account Not Approved — ${appName}\n\nHi ${firstName},\n\nYour account application was not approved.${reason ? `\n\nReason: ${reason}` : ''}\n\nContact the dormitory office for assistance.`;
  try {
    const result = await _send({ to: toEmail, subject: `[${appName}] Account application update`, html: body, text });
    if (result.driver !== 'console') console.log(`  ❌ Account rejected email sent [${result.driver}] → ${toEmail}`);
    return result;
  } catch (err) {
    console.error(`❌ [emailService] sendAccountRejectedEmail → ${toEmail} | driver=${DRIVER_CHAIN[0]} | ${err.message}`);
    return { success: false };
  }
}

async function sendContactEmail(toEmail, senderName, senderEmail, subject, message) {
  const appName = APP_NAME();
  const body = emailWrapper(
    'linear-gradient(135deg,#1e3a8a,#2563eb)', '&#128233;', 'New Contact Form Message', appName,
    `<table style="width:100%;margin-bottom:20px;">
      <tr>
        <td style="color:#64748b;font-size:13px;padding:4px 0;width:80px;"><strong>From:</strong></td>
        <td style="color:#1e293b;font-size:14px;">${senderName} &lt;${senderEmail}&gt;</td>
      </tr>
      <tr>
        <td style="color:#64748b;font-size:13px;padding:4px 0;"><strong>Subject:</strong></td>
        <td style="color:#1e293b;font-size:14px;">${subject}</td>
      </tr>
    </table>
    <div style="background:#f8fafc;border-radius:10px;padding:20px;border:1px solid #e2e8f0;">
      <p style="color:#334155;font-size:14px;line-height:1.8;margin:0;white-space:pre-wrap;">${message}</p>
    </div>`
  );
  const text = `New contact form message\n\nFrom: ${senderName} <${senderEmail}>\nSubject: ${subject}\n\n${message}`;
  try {
    const result = await _send({ to: toEmail, subject: `[${appName} Contact] ${subject}`, html: body, text });
    if (result.driver !== 'console') console.log(`  📩 Contact email sent [${result.driver}] → ${toEmail}`);
    return result;
  } catch (err) {
    console.error(`❌ [emailService] sendContactEmail → ${toEmail} | driver=${DRIVER_CHAIN[0]} | ${err.message}`);
    return { success: false };
  }
}

async function sendDormReminderEmail(toEmail, firstName, month, amount) {
  const appName    = APP_NAME();
  const appUrl     = APP_URL();
  const monthLabel = (() => {
    try {
      const [y, m] = month.split('-');
      return new Date(Number(y), Number(m) - 1).toLocaleString('en-PH', { month: 'long', year: 'numeric' });
    } catch { return month; }
  })();
  const body = emailWrapper(
    'linear-gradient(135deg,#1e3a8a,#2563eb)', '&#127968;', 'Dormitory Payment Reminder', appName,
    greeting(firstName) +
    `<p style="color:#475569;font-size:15px;line-height:1.7;margin:0 0 8px;">
      This is a friendly reminder that your dormitory fee for <strong>${monthLabel}</strong> is due.
    </p>
    <div style="text-align:center;margin:24px 0;">
      <div style="display:inline-block;background:#eff6ff;border:2px solid #bfdbfe;border-radius:12px;padding:16px 32px;">
        <div style="font-size:12px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Amount Due</div>
        <div style="font-size:32px;font-weight:800;color:#1e3a8a;">&#8369;${Number(amount).toLocaleString()}</div>
      </div>
    </div>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0;">
      Please coordinate with the dormitory administrator to settle your payment. Thank you!
    </p>`
  );
  const text = `Dormitory Payment Reminder — ${appName}\n\nHi ${firstName},\n\nYour fee for ${monthLabel} is due.\nAmount Due: ₱${Number(amount).toLocaleString()}\n\nPlease contact the dormitory administrator.`;
  try {
    const result = await _send({ to: toEmail, subject: `[${appName}] Dormitory Payment Reminder — ${monthLabel}`, html: body, text });
    if (result.driver !== 'console') console.log(`  🏠 Dorm reminder sent [${result.driver}] → ${toEmail}`);
    return result;
  } catch (err) {
    console.error(`❌ [emailService] sendDormReminderEmail → ${toEmail} | driver=${DRIVER_CHAIN[0]} | ${err.message}`);
    return { success: false };
  }
}

async function sendBedAssignedEmail(toEmail, firstName, roomNumber, bedNumber) {
  const appName = APP_NAME();
  const appUrl  = APP_URL();
  const body = emailWrapper(
    'linear-gradient(135deg,#14532d,#16a34a)', '&#127968;', 'Bed Assignment', appName,
    greeting(firstName) +
    `<p style="color:#475569;font-size:15px;margin:0 0 16px;">You have been assigned a bed in the PGA dormitory:</p>
    <table style="margin:0 0 20px;width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:12px 16px;background:#f0fdf4;border-bottom:1px solid #dcfce7;border-radius:8px 8px 0 0;">
          <div style="font-size:12px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:.05em;">Room Number</div>
          <div style="font-size:28px;font-weight:800;color:#14532d;">Room ${roomNumber}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 16px;background:#f0fdf4;border-radius:0 0 8px 8px;">
          <div style="font-size:12px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:.05em;">Bed Number</div>
          <div style="font-size:28px;font-weight:800;color:#14532d;">Bed ${bedNumber}</div>
        </td>
      </tr>
    </table>
    <p style="color:#475569;font-size:14px;margin:0 0 16px;">Please coordinate with the dormitory administrator for move-in procedures. Welcome! &#127881;</p>` +
    btn(`${appUrl}/feed.html`, 'View My Profile', '#16a34a')
  );
  const text = `Bed Assignment — ${appName}\n\nHi ${firstName},\n\nYou have been assigned:\nRoom: ${roomNumber}\nBed:  ${bedNumber}\n\nContact the dormitory administrator for move-in procedures.`;
  try {
    const result = await _send({ to: toEmail, subject: `[${appName}] Bed Assignment — Room ${roomNumber}, Bed ${bedNumber}`, html: body, text });
    if (result.driver !== 'console') console.log(`  🏠 Bed assigned email sent [${result.driver}] → ${toEmail}`);
    return result;
  } catch (err) {
    console.error(`❌ [emailService] sendBedAssignedEmail → ${toEmail} | driver=${DRIVER_CHAIN[0]} | ${err.message}`);
    return { success: false };
  }
}

async function sendBedUnassignedEmail(toEmail, firstName, roomNumber, bedNumber) {
  const appName = APP_NAME();
  const appUrl  = APP_URL();
  const body = emailWrapper(
    'linear-gradient(135deg,#7c2d12,#ea580c)', '&#127968;', 'Bed Unassignment Notice', appName,
    greeting(firstName) +
    `<p style="color:#475569;font-size:15px;line-height:1.7;margin:0 0 16px;">
      Your bed assignment for <strong>Room ${roomNumber}, Bed ${bedNumber}</strong> has been removed by the dormitory administrator.
    </p>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 16px;">
      If you believe this is an error or would like to request reassignment, please contact the dormitory office.
    </p>` +
    btn(`${appUrl}/feed.html`, 'Contact Admin', '#ea580c')
  );
  const text = `Bed Unassignment Notice — ${appName}\n\nHi ${firstName},\n\nYour bed assignment for Room ${roomNumber}, Bed ${bedNumber} has been removed.\n\nContact the dormitory office if you believe this is an error.`;
  try {
    const result = await _send({ to: toEmail, subject: `[${appName}] Bed Unassignment Notice — Room ${roomNumber}, Bed ${bedNumber}`, html: body, text });
    if (result.driver !== 'console') console.log(`  🏠 Bed unassigned email sent [${result.driver}] → ${toEmail}`);
    return result;
  } catch (err) {
    console.error(`❌ [emailService] sendBedUnassignedEmail → ${toEmail} | driver=${DRIVER_CHAIN[0]} | ${err.message}`);
    return { success: false };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  generateOTP,
  sendOTPEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendAccountPendingEmail,
  sendAccountApprovedEmail,
  sendAccountRejectedEmail,
  sendContactEmail,
  sendDormReminderEmail,
  sendBedAssignedEmail,
  sendBedUnassignedEmail,
  /** Returns the active driver name — used by server.js startup log */
  getDriver: () => DRIVER,
};
