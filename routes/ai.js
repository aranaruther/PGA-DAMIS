// ── AI Features Route ─────────────────────────────────────────────
const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { callAI }      = require('./admin'); // re-export below
const geminiPool      = require('../utils/geminiPool');
const log             = require('../utils/logger');
const { getSetting }  = require('../utils/db');

// Helper: call Gemini with a simple prompt, returns text or null
async function callDeepSeek(systemPrompt, userContent, maxTokens = 300) {
  const gh = process.env.GITHUB_TOKEN;
  if (!gh) return null;
  try {
    const r = await fetch('https://models.github.ai/inference/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${gh}` },
      body: JSON.stringify({
        model: 'deepseek/DeepSeek-V3-0324',
        max_tokens: maxTokens,
        temperature: 0.7,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }],
      }),
    });
    if (!r.ok) {
      log.warn(`DeepSeek fallback ${r.status}: ${(await r.text().catch(()=>'')).slice(0,100)}`);
      return null;
    }
    const d = await r.json();
    return d.choices?.[0]?.message?.content?.trim() || null;
  } catch(e) {
    log.error('DeepSeek fallback error: ' + e.message);
    return null;
  }
}

async function quickGemini(systemPrompt, userContent, maxTokens = 300) {
  let activeKey = geminiPool.getKey();

  // No Gemini keys available → go straight to DeepSeek
  if (!activeKey) {
    log.warn('AI features: all Gemini keys exhausted → using DeepSeek fallback');
    return callDeepSeek(systemPrompt, userContent, maxTokens);
  }

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userContent }] }],
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
  };

  // Try Gemini with rotation on 429
  while (activeKey) {
    const resp = await fetch(geminiPool.buildUrl(activeKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': activeKey },
      body: JSON.stringify(body),
    });
    if (resp.ok) {
      geminiPool.trackRequest(activeKey);
      const data = await resp.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    }
    if (resp.status === 429) {
      const errBody = await resp.text().catch(() => '');
      const isRPD = geminiPool.markExhausted(activeKey, errBody);
      if (isRPD) {
        const nextKey = geminiPool.getKey();
        if (nextKey) {
          log.info(`AI features: rotating Gemini key …${activeKey.slice(-6)} → …${nextKey.slice(-6)}`);
          activeKey = nextKey;
          continue;
        }
        log.warn('AI features: all Gemini keys exhausted → using DeepSeek fallback');
        return callDeepSeek(systemPrompt, userContent, maxTokens);
      }
      // RPM limit — return retry signal
      return null;
    }
    // Other error → DeepSeek
    log.warn(`AI features: Gemini ${resp.status} → DeepSeek fallback`);
    return callDeepSeek(systemPrompt, userContent, maxTokens);
  }
  return callDeepSeek(systemPrompt, userContent, maxTokens);
}

// ── Reply Suggestions ─────────────────────────────────────────────
// POST /api/ai/reply-suggestions  { message: "..." }
router.post('/api/ai/reply-suggestions', requireAuth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Message required.' });
    const sys = 'You are a Filipino social app messaging assistant. Generate exactly 3 short, natural reply suggestions (max 8 words each) for the given message. Return ONLY a JSON array of 3 strings, nothing else. Mix casual and friendly tones. Write in English or Filipino depending on the input language.';
    const raw = await quickGemini(sys, message.trim().slice(0, 200), 150);
    if (!raw) return res.json({ suggestions: [] });
    let suggestions = [];
    try { suggestions = JSON.parse(raw.replace(/```json|```/g, '').trim()); } catch { 
      suggestions = raw.split('\n').filter(l => l.trim()).slice(0, 3).map(l => l.replace(/^["'\d\.\-\*]+\s*/,'').trim());
    }
    res.json({ suggestions: suggestions.slice(0, 3) });
  } catch (err) {
    log.error('AI reply-suggestions: ' + err.message);
    res.json({ suggestions: [] });
  }
});

// ── Caption / Post Generator ──────────────────────────────────────
// POST /api/ai/generate-caption  { topic: "...", tone: "casual|professional|funny" }
router.post('/api/ai/generate-caption', requireAuth, async (req, res) => {
  try {
    const { topic, tone = 'casual' } = req.body;
    if (!topic?.trim()) return res.status(400).json({ error: 'Topic required.' });
    const sys = `You are a creative social media writer for PGA-DAMIS, a Filipino dormitory management platform. Write a single engaging post caption. Tone: ${tone}. Max 150 words. No hashtags. Return ONLY the caption text, nothing else.`;
    const caption = await quickGemini(sys, topic.trim().slice(0, 300), 200);
    if (!caption) {
      log.warn('AI generate-caption: no response from Gemini or DeepSeek');
      return res.json({ caption: '', error: 'AI service temporarily unavailable. Please try again.' });
    }
    res.json({ caption });
  } catch (err) {
    log.error('AI generate-caption: ' + err.message);
    res.json({ caption: '' });
  }
});

// ── Text Rewriter ─────────────────────────────────────────────────
// POST /api/ai/rewrite  { text: "...", mode: "grammar|casual|professional|shorter" }
router.post('/api/ai/rewrite', requireAuth, async (req, res) => {
  try {
    const { text, mode = 'grammar' } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Text required.' });
    const modeMap = {
      grammar: 'Fix grammar and spelling only. Keep the same meaning and tone. Return ONLY the corrected text.',
      casual: 'Rewrite in a casual, friendly tone. Keep it short. Return ONLY the rewritten text.',
      professional: 'Rewrite in a professional, polished tone. Return ONLY the rewritten text.',
      shorter: 'Make this shorter and more concise while keeping the key message. Return ONLY the shortened text.',
    };
    const sys = `You are a writing assistant. ${modeMap[mode] || modeMap.grammar}`;
    const rewritten = await quickGemini(sys, text.trim().slice(0, 500), 300);
    res.json({ rewritten: rewritten || text, fallback: !rewritten });
  } catch (err) {
    log.error('AI rewrite: ' + err.message);
    res.json({ rewritten: req.body.text || '' });
  }
});

// ── Hashtag Suggestions ───────────────────────────────────────────
// POST /api/ai/hashtags  { content: "..." }
router.post('/api/ai/hashtags', requireAuth, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Content required.' });
    const sys = 'Generate exactly 5 relevant hashtags for this social media post from a Filipino community platform. Return ONLY a JSON array of 5 hashtag strings (with # prefix), nothing else. Mix broad and specific tags.';
    const raw = await quickGemini(sys, content.trim().slice(0, 400), 100);
    if (!raw) return res.json({ hashtags: [] });
    let hashtags = [];
    try { hashtags = JSON.parse(raw.replace(/```json|```/g, '').trim()); } catch {
      hashtags = raw.match(/#\w+/g) || [];
    }
    res.json({ hashtags: hashtags.slice(0, 5) });
  } catch (err) {
    log.error('AI hashtags: ' + err.message);
    res.json({ hashtags: [] });
  }
});

// ── Admin: Get/Set auto-moderation setting ────────────────────────
router.get('/api/admin/settings', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only.' });
  res.json({ autoModeration: getSetting('auto_moderation', '0') === '1' });
});

router.post('/api/admin/settings', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only.' });
  const { autoModeration } = req.body;
  const { setSetting } = require('../utils/db');
  setSetting('auto_moderation', autoModeration ? '1' : '0');
  log.info(`Auto-moderation ${autoModeration ? 'ENABLED' : 'DISABLED'} by @${req.user.username}`);
  res.json({ ok: true, autoModeration: !!autoModeration });
});

module.exports = router;
