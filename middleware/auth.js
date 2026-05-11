/**
 * middleware/auth.js
 *
 * requireAuth  — blocks unauthenticated requests with 401
 * requireAdmin — blocks non-admin users with 403
 * attachUser   — softly attaches user to req without blocking
 */

function requireAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'You must be logged in to do that.' });
}

function requireAdmin(req, res, next) {
  if (!req.isAuthenticated || !req.isAuthenticated())
    return res.status(401).json({ error: 'You must be logged in.' });
  if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin')
    return res.status(403).json({ error: 'Admin access required.' });
  return next();
}

function attachUser(req, res, next) {
  // Just attaches user if logged in — doesn't block
  next();
}

module.exports = { requireAuth, requireAdmin, attachUser };
