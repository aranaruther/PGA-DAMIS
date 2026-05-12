/**
 * utils/seedAdmin.js
 *
 * Auto-seeds admin accounts from .env on every server startup.
 * Safe to call repeatedly — no-ops if the account already exists.
 *
 * Primary admin    → ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_USERNAME
 * Additional admins → ADMIN2_*, ADMIN3_*, ADMIN4_*, ADMIN5_*
 *
 * Per-slot env vars (N = 2..5):
 *   ADMINN_EMAIL, ADMINN_PASSWORD, ADMINN_USERNAME
 *   ADMINN_FIRST_NAME, ADMINN_MIDDLE_NAME, ADMINN_LAST_NAME
 */

'use strict';

const bcrypt = require('bcryptjs');
const { findUserByEmail, findUserByUsername, createUser } = require('./db');
const log = require('./logger');

async function seedOneAdmin({ prefix, index }) {
  const get = (key) => (process.env[`${prefix}${key}`] || '').trim();

  const email    = get('EMAIL');
  const password = get('PASSWORD');
  const username = get('USERNAME').toLowerCase();

  // Skip slot if not configured
  if (!email && !password && !username) return;

  // Partial config warning
  if (!email || !password || !username) {
    log.warn(`Admin seed [slot ${index}]: incomplete — set ${prefix}EMAIL, ${prefix}PASSWORD, ${prefix}USERNAME`);
    log.dump(`Slot ${index} env check`, {
      [`${prefix}EMAIL`]:    email    || '(empty)',
      [`${prefix}PASSWORD`]: password ? '(set)' : '(empty)',
      [`${prefix}USERNAME`]: username || '(empty)',
    });
    return;
  }

  // Already exists — check role, status, and sync names if env changed
  const existing = findUserByEmail(email);
  if (existing) {
    if (existing.role !== 'admin' && existing.role !== 'superadmin') {
      log.warn(`Admin seed [slot ${index}]: @${existing.username} (${email}) exists but role="${existing.role}" — not an admin!`);
    } else if (!existing.isActive) {
      log.warn(`Admin seed [slot ${index}]: @${existing.username} (${email}) exists but account is BANNED — reactivate via DB or admin panel.`);
    } else if (existing.accountStatus !== 'approved') {
      log.warn(`Admin seed [slot ${index}]: @${existing.username} (${email}) exists but status="${existing.accountStatus}" — cannot log in!`);
    } else {
      // Sync names if env vars differ from what is stored (e.g. was seeded with wrong default)
      const envFirst  = get('FIRST_NAME')  || 'Admin';
      const envMiddle = get('MIDDLE_NAME') || '';
      const envLast   = get('LAST_NAME')   || '';
      const needsUpdate =
        existing.firstName  !== envFirst  ||
        existing.middleName !== envMiddle ||
        existing.lastName   !== envLast;
      if (needsUpdate) {
        const { db } = require('./db');
        db.prepare(
          "UPDATE users SET first_name=?, middle_name=?, last_name=?, updated_at=datetime('now') WHERE id=?"
        ).run(envFirst, envMiddle, envLast, existing.id);
        log.info(`Admin seed [slot ${index}]: @${existing.username} name synced → ${[envFirst, envMiddle, envLast].filter(Boolean).join(' ')}`);
      } else {
        log.info(`Admin seed [slot ${index}]: @${existing.username} (${email}) already exists ✔`);
      }
    }
    return;
  }

  // Username already taken by a different account
  const byUser = findUserByUsername(username);
  if (byUser) {
    log.warn(`Admin seed [slot ${index}]: username @${username} is already taken by ${byUser.email} — change ${prefix}USERNAME`);
    return;
  }

  // Create the account
  const hashed = await bcrypt.hash(password, 12);
  try {
    createUser({
      firstName:     get('FIRST_NAME')  || 'Admin',
      middleName:    get('MIDDLE_NAME') || '',
      lastName:      get('LAST_NAME')   || '',
      username,
      email,
      password:      hashed,
      emailVerified: true,
      idVerified:    true,
      authProvider:  'local',
      role:          'admin',
      accountStatus: 'approved',
    });
    log.success(`Admin seed [slot ${index}]: @${username} (${email}) created ✔`);
  } catch (err) {
    log.error(`Admin seed [slot ${index}]: createUser FAILED — ${err.message}`);
    log.dump('Error details', { code: err.code || '—', message: err.message });
  }
}

async function seedAdmin() {
  log.divider('Admin Seeding');
  await seedOneAdmin({ prefix: 'ADMIN_',  index: 1 });
  for (let n = 2; n <= 5; n++) {
    await seedOneAdmin({ prefix: `ADMIN${n}_`, index: n });
  }
  log.divider();
}

module.exports = { seedAdmin };
