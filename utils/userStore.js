/**
 * ════════════════════════════════════════════════════
 *  utils/userStore.js
 *  A simple in-memory "database" for demo purposes.
 *
 *  In a real project, you would replace this with a
 *  proper database like:
 *    - MongoDB + Mongoose
 *    - MySQL + Sequelize
 *    - PostgreSQL + Prisma
 *
 *  ⚠️ All data is lost when the server restarts.
 *     This is fine for development/demo only.
 * ════════════════════════════════════════════════════
 */

// Array that stores all registered users
const users = [];

// Array that stores pending OTP codes
// Each entry: { email, otp, expiresAt, firstName }
const otpStore = [];

/**
 * Find a user by their email address.
 * @param {string} email
 * @returns {object|undefined}
 */
function findUserByEmail(email) {
  return users.find(u => u.email.toLowerCase() === email.toLowerCase());
}

/**
 * Find a user by their ID.
 */
function findUserById(id) {
  return users.find(u => u.id === id);
}

/**
 * Save a new OTP for an email address.
 * Removes any existing OTP for the same email first.
 */
function saveOTP(email, otp, firstName) {
  // Remove existing OTP for this email
  const idx = otpStore.findIndex(o => o.email.toLowerCase() === email.toLowerCase());
  if (idx !== -1) otpStore.splice(idx, 1);

  // Save new OTP with 10-minute expiry
  otpStore.push({
    email:     email.toLowerCase(),
    otp,
    firstName,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now
    attempts:  0,  // track wrong attempts to prevent brute force
  });
}

/**
 * Verify an OTP for an email address.
 * @returns {{ valid: boolean, reason?: string }}
 */
function verifyOTP(email, enteredOtp) {
  const record = otpStore.find(o => o.email === email.toLowerCase());

  if (!record) {
    return { valid: false, reason: 'No verification code found. Please request a new one.' };
  }

  if (new Date() > record.expiresAt) {
    // Remove expired OTP
    const idx = otpStore.indexOf(record);
    otpStore.splice(idx, 1);
    return { valid: false, reason: 'Your code has expired. Please request a new one.' };
  }

  // Limit to 5 wrong attempts (brute-force protection)
  if (record.attempts >= 5) {
    return { valid: false, reason: 'Too many wrong attempts. Please request a new code.' };
  }

  if (record.otp !== enteredOtp) {
    record.attempts++;
    return { valid: false, reason: `Incorrect code. ${5 - record.attempts} attempts remaining.` };
  }

  // Valid! Remove the OTP so it can't be reused
  const idx = otpStore.indexOf(record);
  otpStore.splice(idx, 1);
  return { valid: true };
}

/**
 * Remove expired OTPs (called periodically).
 */
function cleanupExpiredOTPs() {
  const now = new Date();
  for (let i = otpStore.length - 1; i >= 0; i--) {
    if (otpStore[i].expiresAt < now) otpStore.splice(i, 1);
  }
}

// Clean up expired OTPs every 5 minutes
setInterval(cleanupExpiredOTPs, 5 * 60 * 1000);


// ─────────────────────────────────────────
// Password Reset OTP store
// ─────────────────────────────────────────
const resetStore = [];

function saveResetOTP(email, otp) {
  const idx = resetStore.findIndex(r => r.email.toLowerCase() === email.toLowerCase());
  if (idx !== -1) resetStore.splice(idx, 1);
  resetStore.push({
    email:     email.toLowerCase(),
    otp,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    attempts:  0,
  });
}

function verifyResetOTP(email, enteredOtp) {
  const record = resetStore.find(r => r.email === email.toLowerCase());
  if (!record) return { valid: false, reason: 'No reset code found. Please request a new one.' };
  if (new Date() > record.expiresAt) {
    resetStore.splice(resetStore.indexOf(record), 1);
    return { valid: false, reason: 'Reset code has expired. Please request a new one.' };
  }
  if (record.attempts >= 5) return { valid: false, reason: 'Too many attempts. Please request a new code.' };
  if (record.otp !== enteredOtp) {
    record.attempts++;
    return { valid: false, reason: `Incorrect code. ${5 - record.attempts} attempts remaining.` };
  }
  // Mark as verified (don't delete yet — needed for the password update step)
  record.verified = true;
  return { valid: true };
}

function consumeResetOTP(email) {
  const idx = resetStore.findIndex(r => r.email === email.toLowerCase() && r.verified);
  if (idx !== -1) { resetStore.splice(idx, 1); return true; }
  return false;
}

/**
 * Find a user by phone number.
 * Normalizes both sides to 10-digit format (9XXXXXXXXX) before comparing,
 * so it works regardless of whether input is +63XXXXXXXXXX, 09XXXXXXXXX, or 9XXXXXXXXX.
 */
function findUserByPhone(phone) {
  function toTen(p) {
    const d = String(p).replace(/\D/g, '');
    if (d.length === 10) return d;              // 9XXXXXXXXX
    if (d.length === 11 && d[0] === '0') return d.slice(1);   // 09XXXXXXXXX
    if (d.length === 12 && d.startsWith('63')) return d.slice(2); // 639XXXXXXXXX
    return d; // fallback — return as-is
  }
  const target = toTen(phone);
  return users.find(u => u.phone && toTen(u.phone) === target);
}
// ─────────────────────────────────────────
// Login attempt tracking (per email, in-memory)
// ─────────────────────────────────────────
const loginAttempts = {}; // { email: { count, lockedUntil } }
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCK_MS      = 15 * 60 * 1000; // 15 minutes

function recordFailedLogin(email) {
  const key  = email.toLowerCase();
  const now  = Date.now();
  const rec  = loginAttempts[key] || { count: 0, lockedUntil: null };
  // If lock has expired, reset
  if (rec.lockedUntil && now > rec.lockedUntil) { rec.count = 0; rec.lockedUntil = null; }
  rec.count++;
  if (rec.count >= LOGIN_MAX_ATTEMPTS) rec.lockedUntil = now + LOGIN_LOCK_MS;
  loginAttempts[key] = rec;
}

function checkLoginLock(email) {
  const key = email.toLowerCase();
  const rec = loginAttempts[key];
  if (!rec) return { locked: false };
  const now = Date.now();
  if (rec.lockedUntil && now < rec.lockedUntil) {
    const minsLeft = Math.ceil((rec.lockedUntil - now) / 60000);
    return { locked: true, minsLeft };
  }
  // Lock expired
  if (rec.lockedUntil && now >= rec.lockedUntil) { rec.count = 0; rec.lockedUntil = null; }
  return { locked: false, attemptsLeft: Math.max(0, LOGIN_MAX_ATTEMPTS - rec.count) };
}

function clearLoginAttempts(email) {
  delete loginAttempts[email.toLowerCase()];
}

module.exports = { users, otpStore, resetStore, findUserByEmail, findUserById, findUserByUsername, findUserByPhone, saveOTP, verifyOTP, saveResetOTP, verifyResetOTP, consumeResetOTP, recordFailedLogin, checkLoginLock, clearLoginAttempts };

/**
 * Find a user by their username (case-insensitive).
 */
function findUserByUsername(username) {
  return users.find(u => u.username && u.username.toLowerCase() === username.toLowerCase());
}
