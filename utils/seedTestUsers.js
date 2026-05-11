/**
 * utils/seedTestUsers.js
 * Test users are configured in .env via TEST_USER_1, TEST_USER_2, etc.
 * Set TEST_USERS_ENABLED=false to skip seeding entirely.
 */
const { findUserByEmail, findUserByUsername, createUser } = require('./db');
const log = require('./logger');

function parseTestUsersFromEnv() {
  if (process.env.TEST_USERS_ENABLED === 'false') return [];
  const users = [];
  let i = 1;
  while (process.env[`TEST_USER_${i}`]) {
    const parts = process.env[`TEST_USER_${i}`].split('|');
    if (parts.length >= 6) {
      users.push({
        firstName:  parts[0].trim(),
        middleName: parts[1].trim(),
        lastName:   parts[2].trim(),
        username:   parts[3].trim(),
        email:      parts[4].trim(),
        password:   parts[5].trim(),
      });
    }
    i++;
  }
  return users;
}

async function seedTestUsers() {
  const TEST_USERS = parseTestUsersFromEnv();
  if (!TEST_USERS.length) {
    log.info('Test user seeding skipped (TEST_USERS_ENABLED=false or none configured)');
    return;
  }
  for (const u of TEST_USERS) {
    if (findUserByEmail(u.email) || findUserByUsername(u.username)) {
      log.info(`Test user @${u.username} already exists ✔`);
      continue;
    }
    const hashed = await require('bcryptjs').hash(u.password, 12);
    createUser({
      firstName:     u.firstName,
      middleName:    u.middleName,
      lastName:      u.lastName,
      username:      u.username,
      email:         u.email,
      password:      hashed,
      emailVerified: true,
      idVerified:    true,
      authProvider:  'local',
      role:          'user',
      accountStatus: 'approved',
    });
    log.success(`Test user @${u.username} (${u.email}) seeded ✔`);
  }
}

module.exports = { seedTestUsers };
