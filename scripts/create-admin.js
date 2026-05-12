#!/usr/bin/env node
/**
 * scripts/create-admin.js
 *
 * Creates or manages the admin account.
 *
 * Usage:
 *   npm run create-admin
 *     → Uses ADMIN_* credentials from .env automatically (no prompts)
 *     → If account already exists: prints status and exits cleanly
 *
 *   npm run create-admin -- --reset
 *     → Deletes existing admin and re-creates from .env
 *     → Use this when you update credentials in .env
 *
 *   npm run promote-admin -- email@example.com
 *     → Promotes an existing user to admin
 *
 *   npm run create-admin -- --status
 *     → Shows current admin account info without changes
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const readline = require('readline');
const bcrypt   = require('bcryptjs');
const { db, createUser, findUserByEmail, findUserByUsername } = require('../utils/db');

const args = process.argv.slice(2);

function rl() { return readline.createInterface({ input: process.stdin, output: process.stdout }); }
function ask(iface, q) { return new Promise(r => iface.question(q, r)); }

function banner() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   PGA-DAMIS — Admin Account Manager      ║');
  console.log('╚══════════════════════════════════════════╝\n');
}

function getEnvCreds() {
  return {
    firstName:  process.env.ADMIN_FIRST_NAME  || '',
    middleName: process.env.ADMIN_MIDDLE_NAME || '',
    lastName:   process.env.ADMIN_LAST_NAME   || '',
    username:   (process.env.ADMIN_USERNAME   || '').toLowerCase(),
    email:      (process.env.ADMIN_EMAIL      || '').toLowerCase(),
    password:   process.env.ADMIN_PASSWORD    || '',
  };
}

async function doCreate(creds) {
  const hashed = await bcrypt.hash(creds.password, 12);
  createUser({
    firstName: creds.firstName || 'Admin', middleName: creds.middleName || '',
    lastName: creds.lastName || 'User', username: creds.username,
    email: creds.email, password: hashed,
    emailVerified: true, idVerified: true,
    authProvider: 'local', role: 'admin', accountStatus: 'approved',
  });
  console.log('\n✅ Admin account created!');
  console.log(`   Name:     ${creds.firstName} ${creds.middleName ? creds.middleName + ' ' : ''}${creds.lastName}`);
  console.log(`   Username: @${creds.username}`);
  console.log(`   Email:    ${creds.email}`);
  console.log(`   Role:     admin\n`);
  console.log('   Log in at: /admin.html\n');
  process.exit(0);
}

function showStatus() {
  banner();
  const c = getEnvCreds();
  console.log('  .env config:');
  console.log(`   Name:     ${c.firstName} ${c.lastName}`);
  console.log(`   Username: @${c.username}`);
  console.log(`   Email:    ${c.email}`);
  console.log(`   Password: ${'*'.repeat(c.password.length)} (${c.password.length} chars)\n`);
  const existing = findUserByEmail(c.email);
  if (existing) {
    console.log('  ✅ Account EXISTS in database');
    console.log(`   Role:   ${existing.role}`);
    console.log(`   Status: ${existing.accountStatus}\n`);
  } else {
    console.log('  ⚠️  Account NOT in database — run: npm run create-admin\n');
  }
  process.exit(0);
}

async function resetAdmin() {
  banner();
  const creds = getEnvCreds();
  if (!creds.email || !creds.password || !creds.username) {
    console.error('❌ ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_USERNAME must be set in .env'); process.exit(1);
  }
  const iface = rl();
  const confirm = await ask(iface, `⚠️  Delete and re-create @${creds.username} (${creds.email})?\n   Type "yes" to confirm: `);
  iface.close();
  if (confirm.trim().toLowerCase() !== 'yes') { console.log('  Cancelled.'); process.exit(0); }
  const byEmail = findUserByEmail(creds.email);
  if (byEmail) { db.prepare('DELETE FROM users WHERE id = ?').run(byEmail.id); console.log(`  🗑  Deleted: ${byEmail.email}`); }
  const byUser  = findUserByUsername(creds.username);
  if (byUser && (!byEmail || byUser.id !== byEmail.id)) { db.prepare('DELETE FROM users WHERE id = ?').run(byUser.id); console.log(`  🗑  Deleted: @${byUser.username}`); }
  await doCreate(creds);
}

function promoteExisting(email) {
  banner();
  const user = findUserByEmail(email);
  if (!user) { console.error(`❌ No user found: ${email}`); process.exit(1); }
  db.prepare(`UPDATE users SET role='admin', account_status='approved', id_verified=1 WHERE id=?`).run(user.id);
  console.log(`✅ ${user.firstName} ${user.lastName} (@${user.username}) promoted to admin!\n`);
  process.exit(0);
}

async function main() {
  if (args[0] === '--status')                  { showStatus(); return; }
  if (args[0] === '--reset')                   { await resetAdmin(); return; }
  if (args[0] === '--promote' && args[1])      { promoteExisting(args[1]); return; }

  // Default: idempotent create from .env
  banner();
  const creds = getEnvCreds();

  if (!creds.email || !creds.password || !creds.username) {
    console.error('❌ ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_USERNAME must be set in .env');
    process.exit(1);
  }
  if (creds.password.length < 8) { console.error('❌ ADMIN_PASSWORD must be at least 8 characters.'); process.exit(1); }

  const existing = findUserByEmail(creds.email);
  if (existing) {
    if (existing.role === 'admin' || existing.role === 'superadmin') {
      console.log(`✅ Admin @${existing.username} already exists — nothing to do.`);
      console.log(`   To re-create with new .env credentials: npm run create-admin -- --reset\n`);
    } else {
      console.log(`⚠️  ${existing.email} exists but role is "${existing.role}".`);
      console.log(`   To promote: npm run promote-admin -- ${existing.email}\n`);
    }
    process.exit(0);
  }

  const byUsername = findUserByUsername(creds.username);
  if (byUsername) {
    console.error(`❌ @${creds.username} is already taken by ${byUsername.email}.`);
    console.error(`   Change ADMIN_USERNAME in .env and try again.`); process.exit(1);
  }

  console.log(`  Creating from .env credentials…`);
  await doCreate(creds);
}

main().catch(err => { console.error(err); process.exit(1); });
