/**
 * routes/messages.js — Direct Messages
 *
 * GET  /api/messages/conversations   — list of all DM threads for current user
 * GET  /api/messages/:userId         — get message history with a user
 * POST /api/messages/:userId         — send a message to a user
 * PUT  /api/messages/:userId/read    — mark all messages from userId as read
 */

const express       = require('express');
const router        = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  getConversations, getMessages, createMessage, markMessagesRead, getUnreadMessageCount,
} = require('../utils/db');

// GET /api/messages/unread-count
router.get('/api/messages/unread-count', requireAuth, (req, res) => {
  const count = getUnreadMessageCount(req.user.id);
  res.json({ count });
});

// GET /api/messages/conversations
router.get('/api/messages/conversations', requireAuth, (req, res) => {
  const convs = getConversations(req.user.id);
  res.json({ conversations: convs });
});

// GET /api/messages/:userId
router.get('/api/messages/:userId', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const msgs = getMessages(req.user.id, req.params.userId);
  markMessagesRead(req.params.userId, req.user.id);
  res.json({ messages: msgs });
});

// POST /api/messages/:userId — text message (newlines preserved)
router.post('/api/messages/:userId', requireAuth, (req, res) => {
  const { content, imageUrl } = req.body;
  const hasContent = content && content.trim().length > 0;
  const hasImage   = imageUrl && imageUrl.trim().length > 0;
  if (!hasContent && !hasImage) return res.status(400).json({ error: 'Message cannot be empty.' });
  if (hasContent && content.length > 2000) return res.status(400).json({ error: 'Message too long (max 2000 chars).' });
  if (req.params.userId === req.user.id) return res.status(400).json({ error: 'Cannot message yourself.' });

  // Preserve line breaks — only strip leading/trailing blank lines
  const cleanContent = hasContent ? content.trim() : '';

  const msg = createMessage({
    senderId:   req.user.id,
    receiverId: req.params.userId,
    content:    cleanContent,
    imageUrl:   imageUrl || '',
  });

  const io = req.app.get('io');
  if (io) {
    io.to(`user:${req.params.userId}`).emit('receive-dm', {
      ...msg,
      fromUserId: req.user.id,
      fromName:   req.user.firstName,
      fromAvatar: req.user.avatar || '',
    });
  }

  res.status(201).json({ message: msg });
});

// POST /api/messages/:userId/image — upload image and send as DM
const { uploadPostImage } = require('../middleware/upload');
router.post('/api/messages/:userId/image', requireAuth, ...uploadPostImage, async (req, res) => {
  try {
    if (req.params.userId === req.user.id) return res.status(400).json({ error: 'Cannot message yourself.' });
    const imageUrl = req.cloudinaryUrl || '';
    if (!imageUrl) return res.status(400).json({ error: 'Image upload failed.' });

    const msg = createMessage({
      senderId:   req.user.id,
      receiverId: req.params.userId,
      content:    req.body.caption || '',
      imageUrl,
    });

    const io = req.app.get('io');
    if (io) io.to(`user:${req.params.userId}`).emit('receive-dm', {
      ...msg, fromUserId: req.user.id, fromName: req.user.firstName, fromAvatar: req.user.avatar || '',
    });
    res.status(201).json({ message: msg });
  } catch (err) {
    console.error('message image error:', err);
    res.status(500).json({ error: 'Failed to send image.' });
  }
});

// PUT /api/messages/:userId/read
router.put('/api/messages/:userId/read', requireAuth, (req, res) => {
  markMessagesRead(req.params.userId, req.user.id);
  res.json({ success: true });
});

// POST /api/messages/:msgId/react — react to a message
router.post('/api/messages/:msgId/react', requireAuth, (req, res) => {
  const { toggleMsgReaction, getMsgReactions } = require('../utils/db');
  const { emoji = 'like' } = req.body;
  const result = toggleMsgReaction(req.user.id, req.params.msgId, emoji);
  const reactions = getMsgReactions(req.params.msgId);
  const io = req.app.get('io');
  if (io) {
    // Broadcast update to both parties
    // Emit to both sender and receiver rooms
    const msg = require('../utils/db').db.prepare('SELECT sender_id, receiver_id FROM messages WHERE id=?').get(req.params.msgId);
    if (msg) {
      const payload = { msgId: req.params.msgId, reactions, userReaction: result.reacted ? emoji : null, reactorId: req.user.id };
      io.to(`user:${msg.sender_id}`).emit('msg-reaction-update', payload);
      io.to(`user:${msg.receiver_id}`).emit('msg-reaction-update', payload);
    }
  }
  res.json({ ...result, reactions });
});

// GET /api/messages/:msgId/reactors — who reacted to a message
router.get('/api/messages/:msgId/reactors', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { db } = require('../utils/db');
  const reactors = db.prepare(`
    SELECT mr.emoji, mr.user_id, u.first_name, u.last_name, u.username, u.avatar
    FROM message_reactions mr JOIN users u ON mr.user_id = u.id
    WHERE mr.message_id = ?
    ORDER BY mr.created_at DESC
  `).all(req.params.msgId);
  res.json({ reactors });
});

module.exports = router;
