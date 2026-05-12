/**
 * utils/emailService.js
 *
 * FOUR DRIVERS — auto-detected from environment variables:
 *
 *  1. BREVO    (easiest for Railway — no domain needed, just verify sender email)
 *     Set BREVO_API_KEY in Railway variables.
 *     Free tier: 300 emails/day, no domain required.
 *     Sign up at https://brevo.com → SMTP & API → API Keys
 *     Then verify your sender: Senders & IP → Senders → Add a sender
 *     Set BREVO_FROM to your verified sender email (e.g. rutherfordc.arana@gmail.com)
 *
 *  2. RESEND   (requires a verified domain, not just an email)
 *     Set RESEND_API_KEY in Railway variables.
 *     Free tier: 3,000 emails/month. Requires domain at resend.com/domains.
 *
 *  3. SMTP     (Gmail — works on VPS/local, blocked on Railway)
 *     Set USE_REAL_EMAIL=true + EMAIL_USER + EMAIL_PASS (16-char App Password).
 *     ⚠ Railway blocks outbound SMTP ports 465/587.
 *
 *  4. CONSOLE  (development fallback — zero network calls)
 *     Active when none of the above are configured.
 *     OTPs print to the terminal. Safe on Railway, instant response.
 *
 * Priority:  BREVO_API_KEY  >  RESEND_API_KEY  >  USE_REAL_EMAIL=true  >  CONSOLE
 */

const nodemailer = require('nodemailer');

// ─────────────────────────────────────────────────────
// Driver detection
// ─────────────────────────────────────────────────────
const DRIVER = (() => {
  if (process.env.BREVO_API_KEY)            return 'brevo';
  if (process.env.RESEND_API_KEY)           return 'resend';
  if (process.env.USE_REAL_EMAIL === 'true') return 'smtp';
  return 'console';
})();

// Lazy-loaded Resend client (only imported when needed)
let _resend = null;
function getResend() {
  if (!_resend) {
    try {
      const { Resend } = require('resend');
      _resend = new Resend(process.env.RESEND_API_KEY);
    } catch {
      throw new Error('Resend package not installed. Run: npm install resend');
    }
  }
  return _resend;
}

// SMTP transporter (Gmail)
let smtpTransporter = null;

async function initSMTP() {
  smtpTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,   // 16-char App Password, NOT your Gmail password
    },
  });
  try {
    await smtpTransporter.verify();
    console.log('✅ Gmail SMTP connected —', process.env.EMAIL_USER);
  } catch (err) {
    console.error('❌ Gmail SMTP failed:', err.message);
    console.warn('   Tip: make sure EMAIL_PASS is a Gmail App Password (16 chars, no spaces)');
    console.warn('   ⚠  If running on Railway, SMTP is blocked — use RESEND_API_KEY instead.');
    smtpTransporter = null;
  }
}

// ─────────────────────────────────────────────────────
// Boot — called once on module load
// ─────────────────────────────────────────────────────
(async () => {
  switch (DRIVER) {
    case 'brevo':
      console.log(`✅ Email driver : Brevo API (HTTPS) — from=${process.env.BREVO_FROM || process.env.EMAIL_USER || '(set BREVO_FROM)'}`);
      break;

    case 'resend':
      console.log(`✅ Email driver : Resend (HTTPS API) — from=${process.env.RESEND_FROM || process.env.EMAIL_USER || 'noreply@pgadamis.gov.ph'}`);
      break;

    case 'smtp':
      await initSMTP();
      break;

    case 'console':
    default:
      console.log('');
      console.log('┌──────────────────────────────────────────────────────────┐');
      console.log('│  📧  Email driver : CONSOLE (development mode)           │');
      console.log('│  Emails are NOT delivered to real inboxes.               │');
      console.log('│  OTPs and links will appear here in the terminal.        │');
      console.log('│                                                           │');
      console.log('│  → For real email on Railway: set RESEND_API_KEY         │');
      console.log('│  → For Gmail on a VPS:        set USE_REAL_EMAIL=true    │');
      console.log('└──────────────────────────────────────────────────────────┘');
      console.log('');
      break;
  }
})().catch(console.error);

// ─────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────
function generateOTP() {
  const { randomInt } = require('crypto');
  return String(randomInt(100000, 999999));
}

const APP_NAME     = () => process.env.APP_NAME || 'PGA-DAMIS';
const APP_URL      = () => process.env.APP_URL  || 'http://localhost:3000';
const FROM_ADDRESS = () =>
  `"${APP_NAME()}" <${process.env.BREVO_FROM || process.env.RESEND_FROM || process.env.EMAIL_USER || 'noreply@pgadamis.gov.ph'}>`;

// Bare sender email (no display name) for API drivers
const FROM_EMAIL = () =>
  process.env.BREVO_FROM || process.env.RESEND_FROM || process.env.EMAIL_USER || 'noreply@pgadamis.gov.ph';

/**
 * Core send — routes to the active driver.
 * @param {{ to: string, subject: string, html: string, text: string }} opts
 * @returns {{ success: boolean, messageId?: string }}
 */
async function _send({ to, subject, html, text }) {
  switch (DRIVER) {

    case 'brevo': {
      // Brevo transactional email REST API — no npm package needed, uses native fetch
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method:  'POST',
        headers: {
          'accept':       'application/json',
          'api-key':      process.env.BREVO_API_KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender:      { name: APP_NAME(), email: FROM_EMAIL() },
          to:          [{ email: to }],
          subject,
          htmlContent: html,
          textContent: text,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || `Brevo error ${res.status}`);
      return { success: true, messageId: data?.messageId };
    }

    case 'resend': {
      const resend = getResend();
      const { data, error } = await resend.emails.send({
        from: FROM_ADDRESS(),
        to:   [to],
        subject,
        html,
        text,
      });
      if (error) throw new Error(error.message || JSON.stringify(error));
      return { success: true, messageId: data?.id };
    }

    case 'smtp': {
      if (!smtpTransporter) throw new Error('SMTP transporter unavailable — check EMAIL_USER / EMAIL_PASS');
      const info = await smtpTransporter.sendMail({ from: FROM_ADDRESS(), to, subject, html, text });
      return { success: true, messageId: info.messageId };
    }

    case 'console':
    default: {
      // Print clearly to terminal — no network calls, instant, works everywhere
      const border = '═'.repeat(58);
      console.log('');
      console.log(`╔${border}╗`);
      console.log(`║  📬  [DEV EMAIL]  ${subject.slice(0, 39).padEnd(39)}  ║`);
      console.log(`║  To:  ${to.padEnd(51)}║`);
      console.log(`╚${border}╝`);
      if (text) console.log(text.trim());
      console.log('');
      return { success: true };
    }
  }
}

// ─────────────────────────────────────────────────────
// sendOTPEmail
// ─────────────────────────────────────────────────────
async function sendOTPEmail(toEmail, otp, firstName = 'there') {
  const appName = APP_NAME();
  const appUrl  = APP_URL();

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding:40px 20px;">
    <table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
      <tr>
        <td style="background:linear-gradient(135deg,#1e3a8a,#2563eb);padding:32px;text-align:center;">
          <div style="font-size:26px;font-weight:800;color:#fff;letter-spacing:-0.5px;">🔵 ${appName}</div>
          <div style="color:rgba(255,255,255,.7);font-size:13px;margin-top:4px;">Email Verification</div>
        </td>
      </tr>
      <tr>
        <td style="padding:36px 40px;">
          <p style="color:#475569;font-size:15px;margin:0 0 16px;">Hi <strong style="color:#1e293b;">${firstName}</strong>,</p>
          <p style="color:#475569;font-size:15px;margin:0 0 28px;line-height:1.6;">
            Your <strong>${appName}</strong> verification code is below.<br/>
            Enter it on the registration page to verify your email address.
          </p>
          <div style="text-align:center;margin:0 0 28px;">
            <div style="display:inline-block;background:#eff6ff;border:2px solid #bfdbfe;border-radius:16px;padding:20px 40px;">
              <div style="font-size:42px;font-weight:800;color:#1d4ed8;letter-spacing:14px;font-family:monospace;">${otp}</div>
            </div>
            <p style="color:#94a3b8;font-size:12px;margin:10px 0 0;">⏰ Expires in <strong>10 minutes</strong></p>
          </div>
          <div style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:8px;padding:12px 16px;margin-bottom:24px;">
            <p style="color:#92400e;font-size:13px;margin:0;">
              ⚠️ <strong>Never share this code.</strong> ${appName} staff will never ask for your OTP.
            </p>
          </div>
          <p style="color:#94a3b8;font-size:13px;margin:0;">If you didn't request this, ignore this email.</p>
        </td>
      </tr>
      <tr>
        <td style="background:#f8fafc;padding:16px 40px;border-top:1px solid #e2e8f0;text-align:center;">
          <p style="color:#cbd5e1;font-size:12px;margin:0;">
            © 2026 ${appName} · Provincial Government of Aurora<br/>
            <a href="${appUrl}" style="color:#93c5fd;text-decoration:none;">${appUrl}</a>
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text = `${appName} Verification\n\nHi ${firstName},\n\nYour verification code: ${otp}\n\nExpires in 10 minutes. Never share this code.\n\nIf you didn't request this, ignore this email.\n\n© 2026 ${appName}`;

  try {
    const result = await _send({ to: toEmail, subject: `${otp} — Your ${appName} verification code`, html, text });
    if (DRIVER !== 'console') {
      const ts = new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      console.log(`  ✉  OTP sent [${DRIVER}] → ${toEmail} | code=${otp} | ${ts}${result.messageId ? ` | id=${result.messageId}` : ''}`);
    }
    return result;
  } catch (err) {
    console.error(`❌ Failed to send OTP to ${toEmail}:`, err.message);
    return { success: false };
  }
}

// ─────────────────────────────────────────────────────
// sendPasswordResetEmail
// ─────────────────────────────────────────────────────
async function sendPasswordResetEmail(toEmail, otp, firstName = 'there') {
  const appName = APP_NAME();
  const appUrl  = APP_URL();

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding:40px 20px;">
    <table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
      <tr>
        <td style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:32px;text-align:center;">
          <div style="font-size:26px;font-weight:800;color:#fff;">🔑 Password Reset</div>
          <div style="color:rgba(255,255,255,.7);font-size:13px;margin-top:4px;">${appName}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:36px 40px;">
          <p style="color:#475569;font-size:15px;margin:0 0 16px;">Hi <strong style="color:#1e293b;">${firstName}</strong>,</p>
          <p style="color:#475569;font-size:15px;margin:0 0 28px;line-height:1.6;">
            Use this code to reset your <strong>${appName}</strong> password.
          </p>
          <div style="text-align:center;margin:0 0 28px;">
            <div style="display:inline-block;background:#f5f3ff;border:2px solid #c4b5fd;border-radius:16px;padding:20px 40px;">
              <div style="font-size:42px;font-weight:800;color:#4f46e5;letter-spacing:14px;font-family:monospace;">${otp}</div>
            </div>
            <p style="color:#94a3b8;font-size:12px;margin:10px 0 0;">⏰ Expires in <strong>10 minutes</strong></p>
          </div>
          <div style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:8px;padding:12px 16px;margin-bottom:24px;">
            <p style="color:#92400e;font-size:13px;margin:0;">
              ⚠️ If you didn't request a password reset, ignore this email. Your account is safe.
            </p>
          </div>
        </td>
      </tr>
      <tr>
        <td style="background:#f8fafc;padding:16px 40px;border-top:1px solid #e2e8f0;text-align:center;">
          <p style="color:#cbd5e1;font-size:12px;margin:0;">
            © 2026 ${appName} · Provincial Government of Aurora<br/>
            <a href="${appUrl}" style="color:#93c5fd;text-decoration:none;">${appUrl}</a>
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text = `${appName} Password Reset\n\nHi ${firstName},\n\nYour reset code: ${otp}\n\nExpires in 10 minutes.\n\nIf you didn't request this, ignore this email.\n\n© 2026 ${appName}`;

  try {
    const result = await _send({ to: toEmail, subject: `${otp} — Your ${appName} password reset code`, html, text });
    if (DRIVER !== 'console') console.log(`  🔑 Password reset sent [${DRIVER}] → ${toEmail}`);
    return result;
  } catch (err) {
    console.error(`❌ Failed to send password reset to ${toEmail}:`, err.message);
    return { success: false };
  }
}

// ─────────────────────────────────────────────────────
// sendWelcomeEmail
// ─────────────────────────────────────────────────────
async function sendWelcomeEmail(toEmail, firstName) {
  const appName = APP_NAME();
  const appUrl  = APP_URL();
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
  <tr><td style="background:linear-gradient(135deg,#1e3a8a,#2563eb);padding:32px;text-align:center;">
    <div style="font-size:26px;font-weight:800;color:#fff;">🎉 Welcome to ${appName}!</div>
  </td></tr>
  <tr><td style="padding:36px 40px;">
    <p style="color:#475569;font-size:15px;line-height:1.7;">
      Hi <strong style="color:#1e293b;">${firstName}</strong>! Your email is verified. 🎊<br/><br/>
      Your government ID is under review — we'll notify you within <strong>24 hours</strong> once approved.<br/><br/>
      Thank you for joining ${appName}!
    </p>
  </td></tr>
  <tr><td style="background:#f8fafc;padding:16px 40px;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="color:#cbd5e1;font-size:12px;margin:0;">© 2026 ${appName} · <a href="${appUrl}" style="color:#93c5fd;text-decoration:none;">${appUrl}</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
  const text = `Welcome to ${appName}!\n\nHi ${firstName}, your email is verified.\n\nYour government ID is under review — we'll notify you within 24 hours once approved.\n\nThank you for joining ${appName}!`;
  try {
    const result = await _send({ to: toEmail, subject: `Welcome to ${appName}! 🎉`, html, text });
    if (DRIVER !== 'console') console.log(`  🎉 Welcome email sent [${DRIVER}] → ${toEmail}`);
    return result;
  } catch (err) {
    console.error('Failed to send welcome email:', err.message);
    return { success: false };
  }
}

// ─────────────────────────────────────────────────────
// sendAccountPendingEmail
// ─────────────────────────────────────────────────────
async function sendAccountPendingEmail(toEmail, firstName) {
  const appName = APP_NAME();
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
  <tr><td style="background:linear-gradient(135deg,#92400e,#d97706);padding:32px;text-align:center;">
    <div style="font-size:26px;font-weight:800;color:#fff;">⏳ Account Under Review</div>
    <div style="color:rgba(255,255,255,.7);font-size:13px;margin-top:4px;">${appName}</div>
  </td></tr>
  <tr><td style="padding:36px 40px;">
    <p style="color:#475569;font-size:15px;line-height:1.7;">
      Hi <strong style="color:#1e293b;">${firstName}</strong>,<br/><br/>
      Thank you for registering. Your account is currently under review by our administrators.<br/><br/>
      We'll send you an email once your account has been approved. This usually takes <strong>24 hours</strong>.
    </p>
  </td></tr>
  <tr><td style="background:#f8fafc;padding:16px 40px;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="color:#cbd5e1;font-size:12px;margin:0;">© 2026 ${appName}</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
  const text = `Account Under Review — ${appName}\n\nHi ${firstName},\n\nYour account is under review. We'll notify you within 24 hours once approved.`;
  try {
    const result = await _send({ to: toEmail, subject: `[${appName}] Your account is under review`, html, text });
    if (DRIVER !== 'console') console.log(`  ⏳ Account pending email sent [${DRIVER}] → ${toEmail}`);
    return result;
  } catch (err) {
    console.error('Failed to send account pending email:', err.message);
    return { success: false };
  }
}

// ─────────────────────────────────────────────────────
// sendAccountApprovedEmail
// ─────────────────────────────────────────────────────
async function sendAccountApprovedEmail(toEmail, firstName) {
  const appName = APP_NAME();
  const appUrl  = APP_URL();
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
  <tr><td style="background:linear-gradient(135deg,#14532d,#16a34a);padding:32px;text-align:center;">
    <div style="font-size:26px;font-weight:800;color:#fff;">✅ Account Approved!</div>
    <div style="color:rgba(255,255,255,.7);font-size:13px;margin-top:4px;">${appName}</div>
  </td></tr>
  <tr><td style="padding:36px 40px;">
    <p style="color:#475569;font-size:15px;line-height:1.7;">
      Hi <strong style="color:#1e293b;">${firstName}</strong>,<br/><br/>
      Great news! Your <strong>${appName}</strong> account has been approved. You can now log in and access all features.
    </p>
    <a href="${appUrl}" style="display:inline-block;margin-top:16px;padding:12px 28px;background:#16a34a;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">Go to ${appName}</a>
  </td></tr>
  <tr><td style="background:#f8fafc;padding:16px 40px;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="color:#cbd5e1;font-size:12px;margin:0;">© 2026 ${appName} · <a href="${appUrl}" style="color:#93c5fd;text-decoration:none;">${appUrl}</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
  const text = `Account Approved — ${appName}\n\nHi ${firstName},\n\nYour account has been approved! Log in at: ${appUrl}`;
  try {
    const result = await _send({ to: toEmail, subject: `[${appName}] Your account has been approved ✅`, html, text });
    if (DRIVER !== 'console') console.log(`  ✅ Account approved email sent [${DRIVER}] → ${toEmail}`);
    return result;
  } catch (err) {
    console.error('Failed to send account approved email:', err.message);
    return { success: false };
  }
}

// ─────────────────────────────────────────────────────
// sendAccountRejectedEmail
// ─────────────────────────────────────────────────────
async function sendAccountRejectedEmail(toEmail, firstName, reason = '') {
  const appName = APP_NAME();
  const appUrl  = APP_URL();
  const reasonHtml = reason
    ? `<div style="background:#fef2f2;border-left:4px solid #ef4444;border-radius:8px;padding:12px 16px;margin:16px 0;">
         <p style="color:#991b1b;font-size:13px;margin:0;"><strong>Reason:</strong> ${reason}</p>
       </div>`
    : '';
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
  <tr><td style="background:linear-gradient(135deg,#7f1d1d,#dc2626);padding:32px;text-align:center;">
    <div style="font-size:26px;font-weight:800;color:#fff;">❌ Account Not Approved</div>
    <div style="color:rgba(255,255,255,.7);font-size:13px;margin-top:4px;">${appName}</div>
  </td></tr>
  <tr><td style="padding:36px 40px;">
    <p style="color:#475569;font-size:15px;line-height:1.7;">
      Hi <strong style="color:#1e293b;">${firstName}</strong>,<br/><br/>
      Unfortunately, your <strong>${appName}</strong> account application was not approved at this time.
    </p>
    ${reasonHtml}
    <p style="color:#475569;font-size:15px;line-height:1.7;">
      You may re-apply with the correct documents. If you believe this is an error, please contact the dormitory office.
    </p>
    <a href="${appUrl}" style="display:inline-block;margin-top:16px;padding:12px 28px;background:#dc2626;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">Contact Admin</a>
  </td></tr>
  <tr><td style="background:#f8fafc;padding:16px 40px;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="color:#cbd5e1;font-size:12px;margin:0;">© 2026 ${appName}</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
  const text = `Account Not Approved — ${appName}\n\nHi ${firstName},\n\nYour account application was not approved.${reason ? `\n\nReason: ${reason}` : ''}\n\nContact the dormitory office for assistance.`;
  try {
    const result = await _send({ to: toEmail, subject: `[${appName}] Account application update`, html, text });
    if (DRIVER !== 'console') console.log(`  ❌ Account rejected email sent [${DRIVER}] → ${toEmail}`);
    return result;
  } catch (err) {
    console.error('Failed to send account rejected email:', err.message);
    return { success: false };
  }
}

// ─────────────────────────────────────────────────────
// sendContactEmail — contact-form submission to admin
// ─────────────────────────────────────────────────────
async function sendContactEmail(toEmail, senderName, senderEmail, subject, message) {
  const appName = APP_NAME();
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
  <tr><td style="background:linear-gradient(135deg,#1e3a8a,#2563eb);padding:32px;text-align:center;">
    <div style="font-size:22px;font-weight:800;color:#fff;">📩 New Contact Form Message</div>
    <div style="color:rgba(255,255,255,.7);font-size:13px;margin-top:4px;">${appName}</div>
  </td></tr>
  <tr><td style="padding:36px 40px;">
    <table style="width:100%;margin-bottom:20px;">
      <tr><td style="color:#64748b;font-size:13px;padding:4px 0;width:80px;"><strong>From:</strong></td>
          <td style="color:#1e293b;font-size:14px;">${senderName} &lt;${senderEmail}&gt;</td></tr>
      <tr><td style="color:#64748b;font-size:13px;padding:4px 0;"><strong>Subject:</strong></td>
          <td style="color:#1e293b;font-size:14px;">${subject}</td></tr>
    </table>
    <div style="background:#f8fafc;border-radius:10px;padding:20px;border:1px solid #e2e8f0;">
      <p style="color:#334155;font-size:14px;line-height:1.8;margin:0;white-space:pre-wrap;">${message}</p>
    </div>
  </td></tr>
  <tr><td style="background:#f8fafc;padding:16px 40px;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="color:#cbd5e1;font-size:12px;margin:0;">© 2026 ${appName}</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
  const text = `New contact form message\n\nFrom: ${senderName} <${senderEmail}>\nSubject: ${subject}\n\n${message}`;
  try {
    const result = await _send({ to: toEmail, subject: `[${appName} Contact] ${subject}`, html, text });
    if (DRIVER !== 'console') console.log(`  📩 Contact email sent [${DRIVER}] → ${toEmail}`);
    return result;
  } catch (err) {
    console.error('Failed to send contact email:', err.message);
    return { success: false };
  }
}

// ─────────────────────────────────────────────────────
// sendDormReminderEmail
// ─────────────────────────────────────────────────────
async function sendDormReminderEmail(toEmail, firstName, month, amount) {
  const appName = APP_NAME();
  const appUrl  = APP_URL();
  const monthLabel = (() => {
    try { const [y, m] = month.split('-'); return new Date(y, m - 1).toLocaleString('en-PH', { month: 'long', year: 'numeric' }); }
    catch { return month; }
  })();
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
  <tr><td style="background:linear-gradient(135deg,#1e3a8a,#2563eb);padding:32px;text-align:center;">
    <div style="font-size:26px;font-weight:800;color:#fff;">🏠 Dormitory Payment Reminder</div>
    <div style="color:rgba(255,255,255,.7);font-size:13px;margin-top:4px;">${appName}</div>
  </td></tr>
  <tr><td style="padding:36px 40px;">
    <p style="color:#475569;font-size:15px;line-height:1.7;">
      Hi <strong style="color:#1e293b;">${firstName}</strong>,<br/><br/>
      This is a friendly reminder that your dormitory fee for <strong>${monthLabel}</strong> is due.<br/><br/>
      <strong style="font-size:18px;color:#1e3a8a;">Amount Due: ₱${Number(amount).toLocaleString()}</strong><br/><br/>
      Please coordinate with the dormitory administrator to settle your payment. Thank you!
    </p>
  </td></tr>
  <tr><td style="background:#f8fafc;padding:16px 40px;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="color:#cbd5e1;font-size:12px;margin:0;">© 2026 ${appName} · <a href="${appUrl}" style="color:#93c5fd;text-decoration:none;">${appUrl}</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
  const text = `Dormitory Payment Reminder — ${appName}\n\nHi ${firstName},\n\nYour dormitory fee for ${monthLabel} is due.\nAmount Due: ₱${Number(amount).toLocaleString()}\n\nPlease contact the dormitory administrator to settle your payment.`;
  try {
    const result = await _send({ to: toEmail, subject: `[${appName}] Dormitory Payment Reminder — ${monthLabel}`, html, text });
    if (DRIVER !== 'console') console.log(`  🏠 Dorm reminder sent [${DRIVER}] → ${toEmail}`);
    return result;
  } catch (err) {
    console.error('Failed to send dorm reminder email:', err.message);
    return { success: false };
  }
}

// ─────────────────────────────────────────────────────
// sendBedAssignedEmail
// ─────────────────────────────────────────────────────
async function sendBedAssignedEmail(toEmail, firstName, roomNumber, bedNumber) {
  const appName = APP_NAME();
  const appUrl  = APP_URL();
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
  <tr><td style="background:linear-gradient(135deg,#14532d,#16a34a);padding:32px;text-align:center;">
    <div style="font-size:26px;font-weight:800;color:#fff;">🏠 Bed Assignment</div>
    <div style="color:rgba(255,255,255,.7);font-size:13px;margin-top:4px;">${appName}</div>
  </td></tr>
  <tr><td style="padding:36px 40px;">
    <p style="color:#475569;font-size:15px;line-height:1.7;">
      Hi <strong style="color:#1e293b;">${firstName}</strong>,<br/><br/>
      You have been assigned a bed in the PGA dormitory:
    </p>
    <table style="margin:20px 0;width:100%;border-collapse:collapse;">
      <tr><td style="padding:12px 16px;background:#f0fdf4;border-radius:8px 8px 0 0;border-bottom:1px solid #dcfce7;">
        <span style="font-size:12px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:.05em;">Room Number</span><br/>
        <span style="font-size:28px;font-weight:800;color:#14532d;">Room ${roomNumber}</span>
      </td></tr>
      <tr><td style="padding:12px 16px;background:#f0fdf4;border-radius:0 0 8px 8px;">
        <span style="font-size:12px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:.05em;">Bed Number</span><br/>
        <span style="font-size:28px;font-weight:800;color:#14532d;">Bed ${bedNumber}</span>
      </td></tr>
    </table>
    <p style="color:#475569;font-size:14px;line-height:1.7;">
      Please coordinate with the dormitory administrator for move-in procedures. Welcome! 🎉
    </p>
    <a href="${appUrl}/feed.html" style="display:inline-block;margin-top:8px;padding:12px 28px;background:#16a34a;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">View My Profile</a>
  </td></tr>
  <tr><td style="background:#f8fafc;padding:16px 40px;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="color:#cbd5e1;font-size:12px;margin:0;">© 2026 ${appName} · <a href="${appUrl}" style="color:#93c5fd;text-decoration:none;">${appUrl}</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
  const text = `Bed Assignment — ${appName}\n\nHi ${firstName},\n\nYou have been assigned:\nRoom: ${roomNumber}\nBed:  ${bedNumber}\n\nContact the dormitory administrator for move-in procedures.`;
  try {
    const result = await _send({ to: toEmail, subject: `[${appName}] Bed Assignment — Room ${roomNumber}, Bed ${bedNumber}`, html, text });
    if (DRIVER !== 'console') console.log(`  🏠 Bed assigned email sent [${DRIVER}] → ${toEmail}`);
    return result;
  } catch (err) {
    console.error('Failed to send bed assigned email:', err.message);
    return { success: false };
  }
}

// ─────────────────────────────────────────────────────
// sendBedUnassignedEmail
// ─────────────────────────────────────────────────────
async function sendBedUnassignedEmail(toEmail, firstName, roomNumber, bedNumber) {
  const appName = APP_NAME();
  const appUrl  = APP_URL();
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
  <tr><td style="background:linear-gradient(135deg,#7c2d12,#ea580c);padding:32px;text-align:center;">
    <div style="font-size:26px;font-weight:800;color:#fff;">🏠 Bed Unassignment Notice</div>
    <div style="color:rgba(255,255,255,.7);font-size:13px;margin-top:4px;">${appName}</div>
  </td></tr>
  <tr><td style="padding:36px 40px;">
    <p style="color:#475569;font-size:15px;line-height:1.7;">
      Hi <strong style="color:#1e293b;">${firstName}</strong>,<br/><br/>
      Your bed assignment for <strong>Room ${roomNumber}, Bed ${bedNumber}</strong> has been removed by the dormitory administrator.<br/><br/>
      If you believe this is an error or would like to request reassignment, please contact the dormitory office.
    </p>
    <a href="${appUrl}/feed.html" style="display:inline-block;margin-top:8px;padding:12px 28px;background:#ea580c;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">Contact Admin</a>
  </td></tr>
  <tr><td style="background:#f8fafc;padding:16px 40px;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="color:#cbd5e1;font-size:12px;margin:0;">© 2026 ${appName} · <a href="${appUrl}" style="color:#93c5fd;text-decoration:none;">${appUrl}</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
  const text = `Bed Unassignment Notice — ${appName}\n\nHi ${firstName},\n\nYour bed assignment for Room ${roomNumber}, Bed ${bedNumber} has been removed.\n\nContact the dormitory office if you believe this is an error.`;
  try {
    const result = await _send({ to: toEmail, subject: `[${appName}] Bed Unassignment Notice — Room ${roomNumber}, Bed ${bedNumber}`, html, text });
    if (DRIVER !== 'console') console.log(`  🏠 Bed unassigned email sent [${DRIVER}] → ${toEmail}`);
    return result;
  } catch (err) {
    console.error('Failed to send bed unassigned email:', err.message);
    return { success: false };
  }
}

// ─────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────
module.exports = {
  generateOTP,
  sendOTPEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendAccountPendingEmail,
  sendAccountApprovedEmail,
  sendAccountRejectedEmail,
  sendContactEmail,
  sendDormReminderEmail,
  sendBedAssignedEmail,
  sendBedUnassignedEmail,
  // Expose active driver for health-checks / admin status panel
  getDriver: () => DRIVER,
};
