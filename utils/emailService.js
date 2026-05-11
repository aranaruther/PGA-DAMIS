/**
 * utils/emailService.js
 *
 * TWO MODES — controlled by .env:
 *
 *  USE_REAL_EMAIL=false (default)
 *    → Ethereal: fake test inbox, no real delivery.
 *      After each send, a clickable preview URL prints in the terminal.
 *      Perfect for development — no Gmail setup needed.
 *
 *  USE_REAL_EMAIL=true
 *    → Gmail SMTP: real emails land in actual inboxes.
 *      Requires EMAIL_USER + EMAIL_PASS (Gmail App Password) in .env.
 *      Switch to this before going live.
 */

const nodemailer = require('nodemailer');

let transporter  = null;
let etherealUser = '';   // used as the From address in Ethereal mode

// ─────────────────────────────────────────────────────
// INIT — called once on module load
// ─────────────────────────────────────────────────────
async function initTransporter() {
  if (process.env.USE_REAL_EMAIL === 'true') {
    // ── Real Gmail SMTP ──────────────────────────────
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,   // 16-char App Password, NOT your Gmail password
      },
    });

    try {
      await transporter.verify();
      console.log('✅ Gmail SMTP connected —', process.env.EMAIL_USER);
    } catch (err) {
      console.error('❌ Gmail SMTP failed:', err.message);
      console.log('   Tip: make sure EMAIL_PASS is a Gmail App Password (16 chars, no spaces)');
      console.log('   Falling back to Ethereal for this session...');
      await setupEthereal();
    }

  } else {
    // ── Ethereal test inbox (default) ────────────────
    await setupEthereal();
  }
}

async function setupEthereal() {
  const account = await nodemailer.createTestAccount();
  etherealUser  = account.user;

  transporter = nodemailer.createTransport({
    host:   'smtp.ethereal.email',
    port:   587,
    secure: false,
    auth: { user: account.user, pass: account.pass },
  });

  console.log('');
  console.log('┌──────────────────────────────────────────────────┐');
  console.log('│  📧  Ethereal email mode (development)           │');
  console.log('│  Emails are NOT delivered to real inboxes.       │');
  console.log('│  After each OTP send, a preview URL will appear  │');
  console.log('│  here in the terminal. Click it to see the email.│');
  console.log('│                                                   │');
  console.log('│  To send real emails: set USE_REAL_EMAIL=true    │');
  console.log('│  in your .env file and add your Gmail App Pass.  │');
  console.log('└──────────────────────────────────────────────────┘');
  console.log('');
}

// Start init immediately
initTransporter().catch(console.error);

// ─────────────────────────────────────────────────────
// Generate a 6-digit OTP using Node's built-in crypto
// (more secure than Math.random)
// ─────────────────────────────────────────────────────
function generateOTP() {
  const { randomInt } = require('crypto');
  return String(randomInt(100000, 999999));
}

// ─────────────────────────────────────────────────────
// sendOTPEmail
// Returns: { success: boolean, previewUrl?: string }
// ─────────────────────────────────────────────────────
async function sendOTPEmail(toEmail, otp, firstName = 'there') {
  // Wait up to 3s for transporter to be ready on cold start
  if (!transporter) {
    await new Promise(r => setTimeout(r, 3000));
  }
  if (!transporter) return { success: false };

  const appName = process.env.APP_NAME || 'PGA-DAMIS';
  const appUrl  = process.env.APP_URL  || 'http://localhost:3000';

  const html = `
<!DOCTYPE html>
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

  const text = `${appName} Verification\n\nHi ${firstName},\n\nYour code: ${otp}\n\nExpires in 10 minutes. Never share this code.\n\nIf you didn't request this, ignore this email.\n\n© 2025 ${appName}`;

  try {
    const info = await transporter.sendMail({
      from:    `"${appName}" <${etherealUser || process.env.EMAIL_USER}>`,
      to:      toEmail,
      subject: `${otp} — Your ${appName} verification code`,
      text,
      html,
    });

    // Ethereal gives us a URL where we can preview the email
    const previewUrl = nodemailer.getTestMessageUrl(info);

    if (previewUrl) {
      console.log('');
      console.log('╔══════════════════════════════════════════════════════╗');
      console.log('║  📬  OTP Email Sent (Ethereal Preview)               ║');
      console.log(`║  To:   ${toEmail.padEnd(46)}║`);
      console.log(`║  Code: ${String(otp).padEnd(46)}║`);
      console.log('║  ↓ Click the link below to view the email ↓          ║');
      console.log('╚══════════════════════════════════════════════════════╝');
      console.log(' ', previewUrl);
      console.log('');
      return { success: true, previewUrl };
    }

    const ts = new Date().toLocaleTimeString('en-PH', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
    console.log('');
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║  📧  OTP Email Sent (Gmail SMTP)                     ║');
    console.log(`║  Time:    ${ts.padEnd(43)}║`);
    console.log(`║  To:      ${toEmail.padEnd(43)}║`);
    console.log(`║  Name:    ${firstName.padEnd(43)}║`);
    console.log(`║  Code:    ${String(otp).padEnd(43)}║`);
    console.log(`║  Msg ID:  ${String(info.messageId||'—').slice(0,43).padEnd(43)}║`);
    console.log('║  ✔ Gmail accepted — check recipient inbox/spam       ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log('');
    return { success: true };

  } catch (err) {
    console.error(`❌ Failed to send OTP to ${toEmail}:`, err.message);
    return { success: false };
  }
}

// ─────────────────────────────────────────────────────
// sendWelcomeEmail — fires after successful registration
// ─────────────────────────────────────────────────────
async function sendWelcomeEmail(toEmail, firstName) {
  if (!transporter) return { success: false };

  const appName = process.env.APP_NAME || 'PGA-DAMIS';

  const html = `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
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
    <p style="color:#cbd5e1;font-size:12px;margin:0;">© 2026 ${appName}</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  try {
    const info = await transporter.sendMail({
      from:    `"${appName}" <${etherealUser || process.env.EMAIL_USER}>`,
      to:      toEmail,
      subject: `Welcome to ${appName}! 🎉`,
      html,
    });
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) console.log('  🎉 Welcome email preview:', previewUrl);
    return { success: true, previewUrl };
  } catch (err) {
    console.error('Failed to send welcome email:', err.message);
    return { success: false };
  }
}


// ─────────────────────────────────────────────────────
// sendPasswordResetEmail
// ─────────────────────────────────────────────────────
async function sendPasswordResetEmail(toEmail, otp, firstName = 'there') {
  if (!transporter) {
    await new Promise(r => setTimeout(r, 3000));
  }
  if (!transporter) return { success: false };

  const appName = process.env.APP_NAME || 'PGA-DAMIS';
  const appUrl  = process.env.APP_URL  || 'http://localhost:3000';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding:40px 20px;">
    <table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
      <tr>
        <td style="background:linear-gradient(135deg,#7c3aed,#6d28d9);padding:32px;text-align:center;">
          <div style="font-size:26px;font-weight:800;color:#fff;letter-spacing:-0.5px;">🔵 ${appName}</div>
          <div style="color:rgba(255,255,255,.7);font-size:13px;margin-top:4px;">Password Reset</div>
        </td>
      </tr>
      <tr>
        <td style="padding:36px 40px;">
          <p style="color:#475569;font-size:15px;margin:0 0 16px;">Hi <strong style="color:#1e293b;">${firstName}</strong>,</p>
          <p style="color:#475569;font-size:15px;margin:0 0 28px;line-height:1.6;">
            We received a request to reset your <strong>${appName}</strong> password.<br/>
            Use the code below to continue. It expires in <strong>10 minutes</strong>.
          </p>
          <div style="text-align:center;margin:0 0 28px;">
            <div style="display:inline-block;background:#f5f3ff;border:2px solid #ddd6fe;border-radius:16px;padding:20px 40px;">
              <div style="font-size:42px;font-weight:800;color:#7c3aed;letter-spacing:14px;font-family:monospace;">${otp}</div>
            </div>
            <p style="color:#94a3b8;font-size:12px;margin:10px 0 0;">⏰ Expires in <strong>10 minutes</strong></p>
          </div>
          <div style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:8px;padding:12px 16px;margin-bottom:24px;">
            <p style="color:#92400e;font-size:13px;margin:0;">
              ⚠️ <strong>If you did not request this, ignore this email.</strong> Your password will not be changed.
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

  const text = `${appName} Password Reset\n\nHi ${firstName},\n\nYour reset code: ${otp}\n\nExpires in 10 minutes. If you did not request this, ignore this email.`;

  try {
    const info = await transporter.sendMail({
      from:    `"${appName}" <${etherealUser || process.env.EMAIL_USER}>`,
      to:      toEmail,
      subject: `${otp} — Reset your ${appName} password`,
      text,
      html,
    });
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log('');
      console.log('╔══════════════════════════════════════════════════════╗');
      console.log('║  🔑  Password Reset Email (Ethereal Preview)         ║');
      console.log(`║  To:   ${toEmail.padEnd(46)}║`);
      console.log(`║  Code: ${String(otp).padEnd(46)}║`);
      console.log('║  ↓ Click to preview ↓                                ║');
      console.log('╚══════════════════════════════════════════════════════╝');
      console.log(' ', previewUrl);
      console.log('');
    }
    return { success: true, previewUrl };
  } catch (err) {
    console.error('Failed to send reset email:', err.message);
    return { success: false };
  }
}


// ─────────────────────────────────────────────────────
// sendAccountPendingEmail — fires after registration
// ─────────────────────────────────────────────────────
async function sendAccountPendingEmail(toEmail, firstName) {
  if (!transporter) return { success: false };
  const appName = process.env.APP_NAME || 'PGA-DAMIS';
  const html = `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
  <tr><td style="background:linear-gradient(135deg,#1e3a8a,#2563eb);padding:32px;text-align:center;">
    <div style="font-size:26px;font-weight:800;color:#fff;">⏳ Application Received</div>
  </td></tr>
  <tr><td style="padding:36px 40px;">
    <p style="color:#475569;font-size:15px;line-height:1.7;">
      Hi <strong style="color:#1e293b;">${firstName}</strong>! Your ${appName} account has been submitted for review.<br/><br/>
      Our team will review your information and get back to you within <strong>24 hours</strong>.<br/><br/>
      You'll receive another email as soon as your account is approved. Thank you for your patience!
    </p>
  </td></tr>
  <tr><td style="background:#f8fafc;padding:16px 40px;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="color:#cbd5e1;font-size:12px;margin:0;">© 2026 ${appName}</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
  try {
    const info = await transporter.sendMail({
      from: `"${appName}" <${etherealUser || process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: `Your ${appName} application is under review ⏳`,
      html,
    });
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) console.log('  ⏳ Pending email preview:', previewUrl);
    return { success: true };
  } catch (err) {
    console.error('Failed to send pending email:', err.message);
    return { success: false };
  }
}

// ─────────────────────────────────────────────────────
// sendAccountApprovedEmail — fires when admin approves
// ─────────────────────────────────────────────────────
async function sendAccountApprovedEmail(toEmail, firstName) {
  if (!transporter) return { success: false };
  const appName = process.env.APP_NAME || 'PGA-DAMIS';
  const appUrl  = process.env.APP_URL  || 'http://localhost:3000';
  const html = `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
  <tr><td style="background:linear-gradient(135deg,#065f46,#10b981);padding:32px;text-align:center;">
    <div style="font-size:26px;font-weight:800;color:#fff;">🎉 You're Approved!</div>
  </td></tr>
  <tr><td style="padding:36px 40px;">
    <p style="color:#475569;font-size:15px;line-height:1.7;">
      Great news, <strong style="color:#1e293b;">${firstName}</strong>! Your ${appName} account has been approved.<br/><br/>
      You can now log in and start connecting with the community!
    </p>
    <div style="text-align:center;margin:28px 0;">
      <a href="${appUrl}" style="background:#10b981;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Log In to ${appName}</a>
    </div>
  </td></tr>
  <tr><td style="background:#f8fafc;padding:16px 40px;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="color:#cbd5e1;font-size:12px;margin:0;">© 2026 ${appName}</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
  try {
    const info = await transporter.sendMail({
      from: `"${appName}" <${etherealUser || process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: `Your ${appName} account is approved! 🎉`,
      html,
    });
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) console.log('  ✅ Approved email preview:', previewUrl);
    return { success: true };
  } catch (err) {
    console.error('Failed to send approved email:', err.message);
    return { success: false };
  }
}

// ─────────────────────────────────────────────────────
// sendAccountRejectedEmail — fires when admin rejects
// ─────────────────────────────────────────────────────
async function sendAccountRejectedEmail(toEmail, firstName, reason = '') {
  if (!transporter) return { success: false };
  const appName = process.env.APP_NAME || 'PGA-DAMIS';
  const reasonHtml = reason
    ? `<p style="background:#fef2f2;border-left:4px solid #ef4444;padding:12px 16px;border-radius:4px;color:#991b1b;font-size:14px;margin:16px 0;">Reason: ${reason}</p>`
    : '';
  const html = `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
  <tr><td style="background:linear-gradient(135deg,#7f1d1d,#dc2626);padding:32px;text-align:center;">
    <div style="font-size:26px;font-weight:800;color:#fff;">Account Not Approved</div>
  </td></tr>
  <tr><td style="padding:36px 40px;">
    <p style="color:#475569;font-size:15px;line-height:1.7;">
      Hi <strong style="color:#1e293b;">${firstName}</strong>, unfortunately your ${appName} account registration was not approved.
    </p>
    ${reasonHtml}
    <p style="color:#475569;font-size:14px;line-height:1.7;">
      If you believe this is an error, please contact our support team.
    </p>
  </td></tr>
  <tr><td style="background:#f8fafc;padding:16px 40px;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="color:#cbd5e1;font-size:12px;margin:0;">© 2026 ${appName}</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
  try {
    const info = await transporter.sendMail({
      from: `"${appName}" <${etherealUser || process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: `Regarding your ${appName} registration`,
      html,
    });
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) console.log('  ❌ Rejected email preview:', previewUrl);
    return { success: true };
  } catch (err) {
    console.error('Failed to send rejected email:', err.message);
    return { success: false };
  }
}

// sendContactEmail — forwards an anonymous support message to the admin
async function sendContactEmail(fromName, fromEmail, message) {
  if (!transporter) await initTransporter();
  if (!transporter) return { success: false };
  const adminTo   = process.env.EMAIL_USER || process.env.ADMIN_EMAIL;
  const appName   = process.env.APP_NAME || 'PGA-DAMIS';
  if (!adminTo) return { success: false, error: 'No admin email configured.' };
  try {
    await transporter.sendMail({
      from:    `"${appName} Support Bot" <${process.env.EMAIL_USER}>`,
      to:      adminTo,
      subject: `[${appName}] Support message from ${fromName || 'Anonymous'}`,
      html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
        <h2 style="color:#0070e0;margin-bottom:4px">${appName} — Support Message</h2>
        <p style="color:#64748b;font-size:13px;margin-bottom:20px">Sent via the AI support chat widget</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
          <tr><td style="padding:8px 12px;background:#f8fafc;font-weight:600;width:100px;border:1px solid #e2e8f0">Name</td>
              <td style="padding:8px 12px;border:1px solid #e2e8f0">${fromName || '—'}</td></tr>
          <tr><td style="padding:8px 12px;background:#f8fafc;font-weight:600;border:1px solid #e2e8f0">Email</td>
              <td style="padding:8px 12px;border:1px solid #e2e8f0">${fromEmail || '—'}</td></tr>
        </table>
        <div style="background:#f1f5f9;border-left:4px solid #0070e0;padding:16px;border-radius:4px;white-space:pre-wrap;font-size:14px;color:#334155">${message}</div>
        <p style="color:#94a3b8;font-size:12px;margin-top:20px">Reply directly to this email or use the admin panel.</p>
      </div>`,
      replyTo: fromEmail || undefined,
    });
    return { success: true };
  } catch (err) {
    console.error('sendContactEmail error:', err.message);
    return { success: false };
  }
}


// ─────────────────────────────────────────────────────
// sendDormReminderEmail — dormitory payment reminder
// ─────────────────────────────────────────────────────
async function sendDormReminderEmail(toEmail, firstName, month, amount) {
  if (!transporter) return { success: false };
  const appName = process.env.APP_NAME || 'PGA-DAMIS';
  const appUrl  = process.env.APP_URL  || 'http://localhost:3000';
  const monthLabel = (() => {
    try { const [y,m] = month.split('-'); return new Date(y, m-1).toLocaleString('en-PH', {month:'long', year:'numeric'}); }
    catch { return month; }
  })();
  const html = `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
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
    <p style="color:#cbd5e1;font-size:12px;margin:0;">© 2026 ${appName} · Provincial Government of Aurora<br/>
    <a href="${appUrl}" style="color:#93c5fd;text-decoration:none;">${appUrl}</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
  try {
    const info = await transporter.sendMail({
      from: `"${appName}" <${etherealUser || process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: `[${appName}] Dormitory Payment Reminder — ${monthLabel}`,
      html,
    });
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) console.log('  🏠 Dorm reminder email preview:', previewUrl);
    return { success: true };
  } catch (err) {
    console.error('Failed to send dorm reminder email:', err.message);
    return { success: false };
  }
}

// ─────────────────────────────────────────────────────
// sendBedAssignedEmail — notify student of bed assignment
// ─────────────────────────────────────────────────────
async function sendBedAssignedEmail(toEmail, firstName, roomNumber, bedNumber) {
  if (!transporter) return { success: false };
  const appName = process.env.APP_NAME || 'PGA-DAMIS';
  const appUrl  = process.env.APP_URL  || 'http://localhost:3000';
  const html = `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
  <tr><td style="background:linear-gradient(135deg,#14532d,#16a34a);padding:32px;text-align:center;">
    <div style="font-size:26px;font-weight:800;color:#fff;">🏠 Bed Assignment</div>
    <div style="color:rgba(255,255,255,.7);font-size:13px;margin-top:4px;">${appName}</div>
  </td></tr>
  <tr><td style="padding:36px 40px;">
    <p style="color:#475569;font-size:15px;line-height:1.7;">
      Hi <strong style="color:#1e293b;">${firstName}</strong>,<br/><br/>
      You have been assigned a bed in the PGA dormitory. Here are your details:
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
      Please coordinate with the dormitory administrator for move-in procedures. You can view your assignment details in your profile on the platform.<br/><br/>
      Welcome to the dormitory! 🎉
    </p>
    <a href="${appUrl}/feed.html" style="display:inline-block;margin-top:8px;padding:12px 28px;background:#16a34a;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">View My Profile</a>
  </td></tr>
  <tr><td style="background:#f8fafc;padding:16px 40px;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="color:#cbd5e1;font-size:12px;margin:0;">© 2026 ${appName} · Provincial Government of Aurora<br/>
    <a href="${appUrl}" style="color:#93c5fd;text-decoration:none;">${appUrl}</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
  try {
    const info = await transporter.sendMail({
      from: `"${appName}" <${etherealUser || process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: `[${appName}] Bed Assignment — Room ${roomNumber}, Bed ${bedNumber}`,
      html,
    });
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) console.log('  🏠 Bed assigned email preview:', previewUrl);
    return { success: true };
  } catch (err) {
    console.error('Failed to send bed assigned email:', err.message);
    return { success: false };
  }
}

// ─────────────────────────────────────────────────────
// sendBedUnassignedEmail — notify student their bed was removed
// ─────────────────────────────────────────────────────
async function sendBedUnassignedEmail(toEmail, firstName, roomNumber, bedNumber) {
  if (!transporter) return { success: false };
  const appName = process.env.APP_NAME || 'PGA-DAMIS';
  const appUrl  = process.env.APP_URL  || 'http://localhost:3000';
  const html = `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
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
    <p style="color:#cbd5e1;font-size:12px;margin:0;">© 2026 ${appName} · Provincial Government of Aurora<br/>
    <a href="${appUrl}" style="color:#93c5fd;text-decoration:none;">${appUrl}</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
  try {
    const info = await transporter.sendMail({
      from: `"${appName}" <${etherealUser || process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: `[${appName}] Bed Unassignment Notice — Room ${roomNumber}, Bed ${bedNumber}`,
      html,
    });
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) console.log('  🏠 Bed unassigned email preview:', previewUrl);
    return { success: true };
  } catch (err) {
    console.error('Failed to send bed unassigned email:', err.message);
    return { success: false };
  }
}

module.exports = { generateOTP, sendOTPEmail, sendWelcomeEmail, sendPasswordResetEmail, sendAccountPendingEmail, sendAccountApprovedEmail, sendAccountRejectedEmail, sendContactEmail, sendDormReminderEmail, sendBedAssignedEmail, sendBedUnassignedEmail };
