/**
 * utils/passport-setup.js  (updated for SQLite db)
 *
 * Same logic as before — only changed:
 *   - Import from utils/db.js instead of utils/userStore.js
 *   - deserializeUser uses findUserById (DB lookup, not array.find)
 */

const passport       = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { findUserByEmail, findUserById } = require('./db');

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser((id, done) => {
  const user = findUserById(id);
  done(null, user || null);
});

passport.use(new GoogleStrategy(
  {
    clientID:          process.env.GOOGLE_CLIENT_ID,
    clientSecret:      process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:       process.env.GOOGLE_CALLBACK_URL,
    passReqToCallback: true,
  },
  async (req, accessToken, refreshToken, profile, done) => {
    try {
      const email    = profile.emails?.[0]?.value || '';
      const googleId = profile.id;

      // Already fully registered → check status then log in
      const { db } = require('./db');
      const existing = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId);
      if (existing) {
        const user = findUserById(existing.id);
        if (!user.isActive) {
          return done(null, false, { message: 'account_suspended' });
        }
        if (user.accountStatus === 'pending') {
          return done(null, false, { message: 'account_pending' });
        }
        if (user.accountStatus === 'rejected') {
          return done(null, false, { message: 'account_rejected' });
        }
        console.log(`Google login ✅  ${user.email}`);
        return done(null, user);
      }

      // Email exists but registered locally → block
      if (findUserByEmail(email)) {
        return done(null, false, { message: `email_taken:${email}` });
      }

      // Brand-new user → store in session, do NOT create account yet
      req.session.pendingGoogle = {
        googleId,
        email,
        firstName: profile.name?.givenName  || '',
        lastName:  profile.name?.familyName || '',
        avatar:    profile.photos?.[0]?.value || '',
      };
      console.log(`Google signup 🔄  pending OTP: ${email}`);
      return done(null, false, { message: 'pending_signup' });

    } catch (err) {
      return done(err, null);
    }
  }
));

module.exports = passport;
