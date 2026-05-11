/**
 * routes/notifications.js
 *
 * GET /api/notifications              — get all notifications
 * GET /api/notifications/unread-count — badge number
 * PUT /api/notifications/read-all     — mark all read
 * PUT /api/notifications/:id/read     — mark one read
 */

const express = require('express');
const router  = express.Router();

const { requireAuth }                                      = require('../middleware/auth');
const { getNotifications, getUnreadCount, markAllRead, markOneRead } = require('../utils/db');

router.get('/api/notifications', requireAuth, (req, res) => {
  const notifs = getNotifications(req.user.id);
  const { toUTC } = require('../utils/db');
  const notifsMapped = notifs.map(n => ({...n, created_at: toUTC(n.created_at)}));
  res.json({ notifications: notifsMapped });
});

router.get('/api/notifications/unread-count', requireAuth, (req, res) => {
  res.json({ count: getUnreadCount(req.user.id) });
});

router.put('/api/notifications/read-all', requireAuth, (req, res) => {
  markAllRead(req.user.id);
  res.json({ success: true });
});

router.put('/api/notifications/:id/read', requireAuth, (req, res) => {
  markOneRead(req.params.id, req.user.id);
  res.json({ success: true });
});

module.exports = router;
