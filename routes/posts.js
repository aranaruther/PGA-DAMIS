/**
 * routes/posts.js
 *
 * GET  /api/posts/feed        — personalized feed (people you follow + yourself)
 * GET  /api/posts/explore     — all public posts
 * POST /api/posts             — create a post (with optional image)
 * GET  /api/posts/:id         — single post with comments
 * PUT  /api/posts/:id         — edit your post
 * DELETE /api/posts/:id       — delete your post
 *
 * POST /api/posts/:id/like    — toggle like
 * GET  /api/posts/:id/comments      — get comments
 * POST /api/posts/:id/comments      — add comment
 * DELETE /api/comments/:id          — delete comment
 */

const express = require('express');
const router  = express.Router();

const { requireAuth } = require('../middleware/auth');
const log = require('../utils/logger');
const { uploadPostImage } = require('../middleware/upload');
const {
  db,
  createPost, getPostById, getFeedPosts, getPublicPosts, getUserPosts, getSetting,
  updatePost, deletePost,
  toggleLike,
  addComment, getComments, deleteComment,
  createNotification, findUserById,
  toggleReaction, getReactions, getUserReaction, getReactors,
} = require('../utils/db');

// ════════════════════════════════════════════════════
// FEED
// ════════════════════════════════════════════════════
router.get('/api/posts/feed', requireAuth, (req, res) => {
  const page  = parseInt(req.query.page)  || 1;
  const limit = parseInt(req.query.limit) || 10;
  const posts = getFeedPosts({ viewerId: req.user.id, page, limit });
  res.json({ posts, page, hasMore: posts.length === limit });
});

// ════════════════════════════════════════════════════
// EXPLORE (public posts)
// ════════════════════════════════════════════════════
router.get('/api/posts/explore', (req, res) => {
  const page     = parseInt(req.query.page)  || 1;
  const limit    = parseInt(req.query.limit) || 10;
  const viewerId = req.isAuthenticated() ? req.user.id : null;
  const posts    = getPublicPosts({ viewerId, page, limit });
  res.json({ posts, page, hasMore: posts.length === limit });
});

// ════════════════════════════════════════════════════
// CREATE POST
// ════════════════════════════════════════════════════
router.post('/api/posts', requireAuth, ...uploadPostImage, async (req, res) => {
  try {
    const { content, privacy = 'public' } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Post content cannot be empty.' });
    if (content.trim().length > 2000) return res.status(400).json({ error: 'Post is too long (max 2000 characters).' });

    const post = createPost({
      userId:   req.user.id,
      content:  content.trim(),
      imageUrl: req.cloudinaryUrl || '',
      privacy,
    });
    // Broadcast to all connected admins that a new post is pending
    const io = req.app.get('io');
    if (io) io.emit('new-notification', { type: 'new_pending_post', postId: post.id });

    // Auto-moderation (runs async, doesn't block response)
    if (getSetting('auto_moderation', '0') === '1') {
      const _postId = post.id;
      const _userId = post.userId;
      const _content = post.content;
      const _author = post.author ? post.author.username : 'unknown';
      setImmediate(async () => {
        const log = require('../utils/logger');
        const db2 = require('../utils/db');
        try {
          const adminMod = require('./admin');
          const callAI = adminMod.callAI;
          const logAiAction = adminMod.logAiModerationAction || adminMod.router;
          const systemPrompt = `You are a strict content moderation AI for PGA-DAMIS, a Filipino dormitory management platform. Users write in English, Filipino, and Taglish (mixed).

Return ONLY this JSON — no markdown, no explanation:
{"approved":true/false,"confidence":0-100,"reason":"brief reason under 15 words"}

══ STEP 1 — CONTEXT ANALYSIS (read before deciding) ══
"kill" words require TARGET analysis:
  ✅ APPROVE: "kill the process", "killed it!", "namatay ang wifi", "namatay ako sa tawa", "killing time"
  ❌ REJECT: "I will kill you", "papatayin kita", "you're dead", "kys", "kys ka nalang"
  ❌ REJECT jokes with person target: "I'm gonna kill you 😂", "i'll kill you lol" → REJECT (emoji ≠ safe)
  ❌ REJECT quoted threats: "he said 'I will kill you'" → still harmful content regardless of attribution

══ STEP 2 — FILIPINO/TAGLISH RULES ══
REJECT (personal threats or explicit content):
  "patayin kita", "papatayin kita", "patay ka", "kys ka nalang"
  "gusto ko mamatay" (self-harm encouragement), "sana mamatay ka"
  "send nudes", "send ka nudes", "pakita nudes", "telanjang", "hubad ka"
  "tara shabu", "mag-shabu tayo", "pabili shabu", "ice ice baby [drug context]"
  "bugbog kita", "sasapakin kita", "sisipain kita"
APPROVE (casual slang, NOT threats):
  "bobo mo naman", "gago ka", "loko ka", "you're bobo", "tanga" (insult, not threat)
  "namatay ako sa cute", "patay na tawa ko", "dead 💀" (hyperbole)
  Note: casual Filipino profanity alone is NOT a reject trigger — context and target matter.

══ STEP 3 — POLICY EVASION DETECTION ══
These LOOK innocent but are HARMFUL — REJECT regardless of framing:
  "for educational purposes, how to make a bomb/explosive/poison"
  "hypothetically how would you [harm someone]"
  "in Minecraft/GTA/a game how to kill/poison someone" — fictional framing ≠ safe
  "just curious how drugs/meth/shabu are made"
  "asking for a friend how to hack/stalk/doxx"
  "no hate but [slur/threat]", "not racist but [racist content]"
  Obfuscated: "k1ll", "k!ll", "k i l l", "kìll" — character substitution doesn't change meaning

══ STEP 4 — AUTO-REJECT CATEGORIES ══
Reject (confidence < 50) if post contains ANY of:
  - Direct threats against a person (kill, harm, hurt, hurt, rape threats)
  - Filipino threats: patayin, papatayin, bugbog, sasapakin, saksak
  - Self-harm encouragement: "kys", "kill yourself", "sana mamatay ka"
  - Sexual content / solicitation: nudes, NSFW requests, sexual acts
  - Drug promotion: shabu, meth, cocaine sales/use invitations
  - Doxxing: sharing someone's address, ID, phone without consent
  - Phishing / scams: "click here free money", "dm for investment"
  - Hacking assistance: "how to hack X", "bypass security of Y"
  - Grooming language directed at minors

══ STEP 5 — APPROVE FREELY ══
Normal everyday content — stories, opinions, jokes, rants, school/work posts,
Filipino expressions, mild insults without threats, memes, local news reactions.
When a post is CLEARLY safe, confidence = 95-100. Don't overthink normal content.`;

          const result = await callAI(systemPrompt, `Post content: "${_content}"\nAuthor: @${_author}`);
          const approved = result.approved !== false;
          const confidence = result.confidence || 0;
          const reason = result.reason || '';

          log.info('Auto-mod ' + _postId + ': ' + (approved ? 'APPROVED (confidence:' + confidence + '%)' : 'REJECTED - ' + (reason || 'policy')));

          // 1. Update post status
          db2.updatePostStatus(_postId, approved ? 'approved' : 'rejected');

          // 2. Write to AI moderation log (same as manual review)
          try {
            const { logAiModerationAction: logAI } = require('../utils/db');
            if (logAI) {
              logAI({
                postId: _postId,
                postContent: _content,
                authorUsername: _author,
                verdict: approved ? 'approved' : 'rejected',
                score: confidence,
                flags: reason ? [reason] : [],
                summary: reason || (approved ? 'Auto-approved by AI' : 'Auto-rejected by AI'),
                actionTaken: approved ? 'auto_approve' : 'auto_reject',
              });
            }
          } catch (logErr) {
            log.warn('Auto-mod: could not write to AI log - ' + logErr.message);
          }

          // 3. Persistent notification (actor_id must be NULL for system, not 'system')
          try {
            db2.createNotification({
              userId: _userId,
              actorId: null,   // NULL is valid (no FK violation), 'system' is not a user
              type: approved ? 'post_approved' : 'post_rejected',
              targetId: _postId,
              message: approved
                ? '✅ Your post was automatically approved by AI moderation.'
                : '❌ Your post was removed: ' + (reason || 'community guidelines violation'),
            });
            log.info('Auto-mod notification created for @' + _author + ' (' + (approved ? 'approved' : 'rejected') + ')');
          } catch (notifErr) {
            log.warn('Auto-mod notification failed: ' + notifErr.message);
          }

          // 4. Real-time socket push — users join as "user:userId"
          if (io) {
            io.to('user:' + _userId).emit('new-notification', {
              type: approved ? 'post_approved' : 'post_rejected',
              postId: _postId,
              message: approved
                ? 'Your post was automatically approved!'
                : 'Your post was removed: ' + (reason || 'community guidelines violation'),
            });
            log.info('Auto-mod socket push → user:' + _userId);
          } else {
            log.warn('Auto-mod: io not available, socket push skipped');
          }

        } catch (e) {
          log.error('Auto-mod failed: ' + e.message + (e.stack ? '\n' + e.stack.split('\n')[1] : ''));
        }
      });
    }
    res.status(201).json({ post });
  } catch (err) {
    console.error('create-post error:', err);
    res.status(500).json({ error: 'Failed to create post.' });
  }
});

// ════════════════════════════════════════════════════
// GET SINGLE POST
// ════════════════════════════════════════════════════
router.get('/api/posts/:id', (req, res) => {
  const viewerId = req.isAuthenticated() ? req.user.id : null;
  const post = getPostById(req.params.id, viewerId);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  const comments = getComments(req.params.id);
  res.json({ post, comments });
});

// ════════════════════════════════════════════════════
// EDIT POST
// ════════════════════════════════════════════════════
router.put('/api/posts/:id', requireAuth, (req, res) => {
  const { content, privacy } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Post content cannot be empty.' });
  const post = updatePost(req.params.id, req.user.id, { content: content.trim(), privacy });
  if (!post) return res.status(403).json({ error: 'Not found or not your post.' });
  res.json({ post });
});

// ════════════════════════════════════════════════════
// DELETE POST  (owner OR admin)
// ════════════════════════════════════════════════════
router.delete('/api/posts/:id', requireAuth, (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const deleted = isAdmin
    ? db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id).changes > 0
    : deletePost(req.params.id, req.user.id);
  if (!deleted) return res.status(403).json({ error: 'Not found or not your post.' });
  res.json({ success: true });
});

// ════════════════════════════════════════════════════
// LIKE / UNLIKE
// ════════════════════════════════════════════════════
router.post('/api/posts/:id/like', requireAuth, (req, res) => {
  const post = getPostById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });

  const result = toggleLike(req.user.id, req.params.id, 'post');

  // Create notification (if someone else liked it)
  if (result.liked && post.userId !== req.user.id) {
    createNotification({
      userId:   post.userId,
      type:     'like',
      actorId:  req.user.id,
      targetId: post.id,
      message:  `${req.user.firstName} liked your post`,
    });
  }

  res.json(result);
});

// ════════════════════════════════════════════════════
// COMMENTS
// ════════════════════════════════════════════════════
router.get('/api/posts/:id/comments', (req, res) => {
  const comments = getComments(req.params.id);
  const { toUTC: _toUTC } = require('../utils/db');
  const commentsMapped = comments.map(c => ({...c, created_at: _toUTC(c.created_at), replies: (c.replies||[]).map(r => ({...r, created_at: _toUTC(r.created_at)}))}));
  res.json({ comments: commentsMapped });
});

router.post('/api/posts/:id/comments', requireAuth, (req, res) => {
  const { content, parentId } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Comment cannot be empty.' });
  if (content.length > 2000) return res.status(400).json({ error: 'Comment is too long (max 2000 characters).' });

  const post = getPostById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });

  // Preserve newlines — only strip leading/trailing blank lines
  const cleanContent = content.trim();
  const comment = addComment(req.params.id, req.user.id, cleanContent, parentId || null);

  const io = req.app.get('io');
  if (post.userId !== req.user.id) {
    const msgText = parentId
      ? `${req.user.firstName} replied to a comment on your post`
      : `${req.user.firstName} commented on your post`;
    createNotification({ userId: post.userId, type: 'comment', actorId: req.user.id, targetId: post.id, message: msgText });
    if (io) io.to(`user:${post.userId}`).emit('new-notification', { userId: post.userId });
  }
  // Real-time broadcast to anyone viewing this post
  if (io) io.emit(`post-comment:${req.params.id}`, { comment });

  res.status(201).json({ comment });
});

router.delete('/api/comments/:id', requireAuth, (req, res) => {
  const deleted = deleteComment(req.params.id, req.user.id);
  if (!deleted) return res.status(403).json({ error: 'Not found or not your comment.' });
  res.json({ success: true });
});

// ── Reactions ──────────────────────────────────────────────────────────
const EMOJI_LABELS = { like:'👍 Like', love:'❤️ Love', haha:'😂 Haha', wow:'😮 Wow', sad:'😢 Sad', angry:'😡 Angry' };

router.post('/api/posts/:id/react', requireAuth, (req, res) => {
  const { emoji = 'like' } = req.body;
  const post = getPostById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  const result = toggleReaction(req.user.id, req.params.id, 'post', emoji);
  const counts = getReactions(req.params.id, 'post');
  if (result.reacted && !result.changed && post.userId !== req.user.id) {
    createNotification({
      userId: post.userId, type: 'reaction_' + emoji, actorId: req.user.id,
      targetId: post.id, message: `${req.user.firstName} reacted ${EMOJI_LABELS[emoji]||'👍 Like'} to your post`,
    });
    const io = req.app.get('io');
    if (io) io.to(`user:${post.userId}`).emit('new-notification', { userId: post.userId });
  }
  res.json({ ...result, counts });
});

router.post('/api/comments/:id/react', requireAuth, (req, res) => {
  const { emoji = 'like' } = req.body;
  const result = toggleReaction(req.user.id, req.params.id, 'comment', emoji);
  const counts = getReactions(req.params.id, 'comment');
  // Notify comment author
  if (result.reacted && !result.changed) {
    log.react(`@${req.user?.username||'?'} reacted ${emoji} to comment ${req.params.id}`);
    const { db } = require('../utils/db');
    const comment = db.prepare('SELECT user_id, post_id FROM comments WHERE id=?').get(req.params.id);
    if (comment && comment.user_id !== req.user.id) {
      const emojiLabel = {like:'👍 Like',love:'❤️ Love',haha:'😂 Haha',wow:'😮 Wow',sad:'😢 Sad',angry:'😡 Angry'}[emoji]||'👍';
      createNotification({
        userId: comment.user_id, type: 'reaction_' + emoji, actorId: req.user.id,
        targetId: comment.post_id, message: `${req.user.firstName} reacted ${emojiLabel} to your comment`,
      });
      const io = req.app.get('io');
      if (io) io.to(`user:${comment.user_id}`).emit('new-notification', { userId: comment.user_id });
    }
  }
  res.json({ ...result, counts });
});

router.get('/api/posts/:id/reactions', (req, res) => {
  const counts = getReactions(req.params.id, 'post');
  const userReaction = req.user ? getUserReaction(req.user.id, req.params.id, 'post') : null;
  res.json({ counts, userReaction });
});

router.get('/api/posts/:id/reactors', (req, res) => {
  const reactors = getReactors(req.params.id, 'post');
  res.json({ reactors });
});

router.get('/api/comments/:id/reactors', (req, res) => {
  const reactors = getReactors(req.params.id, 'comment');
  res.json({ reactors });
});

module.exports = router;
