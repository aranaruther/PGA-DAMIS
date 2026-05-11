/**
 * utils/logger.js — PGA-DAMIS structured terminal logger
 *
 * v5 improvements:
 *  • log.diff(label, before, after) — show field-level changes for any record
 *  • Query string included in GET request lines (helps debug filters/pagination)
 *  • Dormitory actions get DORM badge instead of generic INFO
 *  • Admin actions get ADMIN badge inline in request log
 *  • 4xx in dev optionally show res._dormError if set on response object
 *  • 304 Not Modified suppressed in production (still shown in dev)
 *  • Body snippet limit raised 120 → 140 chars
 *
 * v4 improvements:
 *  • IP normalization       — ::1 → localhost, ::ffff:x.x.x.x → x.x.x.x
 *  • HTTP method coloring   — GET/POST/PUT/DELETE each get a distinct color
 *  • Sensitive field scrub  — passwords, OTPs, tokens hidden in body dumps
 *  • New domain badges      — log.otp, log.security, log.lifecycle, log.cloud
 *  • log.startup(svc, ok)   — clean ✔/✖ server-init line
 *  • Route group tag        — [admin] [auth] [api] inline in request logs
 *  • Static-asset silence   — 200/304 static hits skipped unless error
 *
 * v3 features retained:
 *  • log.phase(n, label)           — numbered step in a multi-step flow
 *  • log.timing(label, breakdowns) — timing table with sub-steps
 *  • log.slow(route, ms, ctx)      — smart slow-request warning
 *  • log.section(label)            — bold section header
 *  • log.tag(badge, color, msg)    — custom one-off badge
 *  • SLOW_WARN_MS env override
 *
 * v2 features retained:
 *  • Millisecond-precision timestamps (HH:MM:SS.mmm)
 *  • log.timer(label) / timer.end()
 *  • log.request(req, res, ms)
 *  • log.table(rows)
 *  • log.dev(msg) / log.trace(msg)
 *  • NO_EMOJI=1 for clean pipe output
 */

'use strict';

const USE_EMOJI = !process.env.NO_EMOJI;
const IS_DEV    = (process.env.NODE_ENV || 'development') === 'development';
const SLOW_MS   = parseInt(process.env.SLOW_WARN_MS || '1500', 10);
const VERY_SLOW = SLOW_MS * 2;

const c = {
  reset:     '\x1b[0m',
  bold:      '\x1b[1m',
  dim:       '\x1b[2m',
  italic:    '\x1b[3m',
  red:       '\x1b[31m',
  green:     '\x1b[32m',
  yellow:    '\x1b[33m',
  blue:      '\x1b[34m',
  magenta:   '\x1b[35m',
  cyan:      '\x1b[36m',
  white:     '\x1b[37m',
  gray:      '\x1b[90m',
  bgRed:     '\x1b[41m',
  bgGreen:   '\x1b[42m',
  bgYellow:  '\x1b[43m',
  bgBlue:    '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan:    '\x1b[46m',
  bgGray:    '\x1b[100m',
  bgTeal:    '\x1b[48;5;30m',
  bgOrange:  '\x1b[48;5;208m',
};

// ── Sensitive keys to scrub from body dumps ───────────────────────────────
const SENSITIVE_RE = /password|passwd|secret|token|otp|code|key|auth|credential/i;

// ── Timestamp: HH:MM:SS.mmm in Philippine Time ────────────────────────────
function ts() {
  const d    = new Date();
  const opts = { timeZone: 'Asia/Manila', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' };
  const hms  = d.toLocaleTimeString('en-PH', opts);
  const ms   = String(d.getMilliseconds()).padStart(3, '0');
  return `${hms}.${ms}`;
}

// ── Badge builder ─────────────────────────────────────────────────────────
function badge(label, color) {
  return `${c.gray}[${ts()}]${c.reset} ${color}${c.bold}${label.padEnd(8)}${c.reset}`;
}

// ── Normalize raw IP for human readability ────────────────────────────────
function normalizeIp(raw) {
  if (!raw) return '?';
  const ip = String(raw).split(',')[0].trim();
  if (ip === '::1' || ip === '127.0.0.1')  return 'localhost';
  if (ip.startsWith('::ffff:'))             return ip.slice(7);
  return ip;
}

// ── Colour HTTP method ────────────────────────────────────────────────────
function colorMethod(m) {
  switch (m) {
    case 'GET':    return `${c.green}${c.bold}GET   ${c.reset}`;
    case 'POST':   return `${c.cyan}${c.bold}POST  ${c.reset}`;
    case 'PUT':    return `${c.yellow}${c.bold}PUT   ${c.reset}`;
    case 'PATCH':  return `${c.yellow}${c.bold}PATCH ${c.reset}`;
    case 'DELETE': return `${c.red}${c.bold}DELETE${c.reset}`;
    default:       return `${c.dim}${m.padEnd(6)}${c.reset}`;
  }
}

// ── Route group tag ───────────────────────────────────────────────────────
function routeGroup(path) {
  if (/^\/api\/admin/.test(path))  return ` ${c.bgBlue}${c.white}admin${c.reset}`;
  if (/^\/api\/auth/.test(path))   return ` ${c.bgYellow}${c.white}auth ${c.reset}`;
  if (/^\/api\//.test(path))       return ` ${c.bgGray}${c.white}api  ${c.reset}`;
  return '';
}

// ── Scrub sensitive fields before printing body ───────────────────────────
function scrubBody(body) {
  if (!body || typeof body !== 'object') return body;
  const out = {};
  for (const [k, v] of Object.entries(body)) {
    out[k] = SENSITIVE_RE.test(k) ? '[redacted]' : v;
  }
  return out;
}

// ── Truncate long values ──────────────────────────────────────────────────
function trunc(v, max = 80) {
  const s = String(v);
  return s.length > max ? s.slice(0, max) + c.dim + '…' + c.reset : s;
}

// ── Format a value with colour ────────────────────────────────────────────
function colorVal(v) {
  if (v === null)            return `${c.dim}null${c.reset}`;
  if (v === undefined)       return `${c.dim}undefined${c.reset}`;
  if (v === '')              return `${c.dim}(empty)${c.reset}`;
  if (v === true)            return `${c.green}true${c.reset}`;
  if (v === false)           return `${c.red}false${c.reset}`;
  if (typeof v === 'number') return `${c.cyan}${v}${c.reset}`;
  return trunc(v);
}

// ── Status-code colour ────────────────────────────────────────────────────
function colorStatus(s) {
  if (s >= 500) return `${c.red}${c.bold}${s}${c.reset}`;
  if (s >= 400) return `${c.yellow}${s}${c.reset}`;
  if (s >= 300) return `${c.cyan}${s}${c.reset}`;
  return `${c.green}${s}${c.reset}`;
}

// ── Timing colour ─────────────────────────────────────────────────────────
function colorMs(ms) {
  if (ms > VERY_SLOW) return `${c.red}${c.bold}${ms}ms${c.reset}`;
  if (ms > SLOW_MS)   return `${c.red}${ms}ms${c.reset}`;
  if (ms > 500)       return `${c.yellow}${ms}ms${c.reset}`;
  if (ms > 100)       return `${c.cyan}${ms}ms${c.reset}`;
  return `${c.green}${ms}ms${c.reset}`;
}

const log = {
  // ── General levels ───────────────────────────────────────────────────────
  info:    (msg) => console.log(`${badge('INFO',    c.blue   )}  ${msg}`),
  success: (msg) => console.log(`${badge('OK',      c.green  )}  ${msg}`),
  warn:    (msg) => console.log(`${badge('WARN',    c.yellow )}  ${msg}`),
  error:   (msg) => console.error(`${badge('ERROR', c.red    )}  ${c.red}${msg}${c.reset}`),
  dev:     (msg) => { if (IS_DEV) console.log(`${badge('DEV', c.gray)}  ${c.dim}${msg}${c.reset}`); },

  // ── Domain badges ────────────────────────────────────────────────────────
  auth:      (msg) => console.log(`${badge('AUTH',     c.bgYellow  + c.white)}  ${msg}`),
  reg:       (msg) => console.log(`${badge('REG',      c.bgGreen   + c.white)}  ${msg}`),
  upload:    (msg) => console.log(`${badge('UPLOAD',   c.bgCyan    + c.white)}  ${msg}`),
  admin:     (msg) => console.log(`${badge('ADMIN',    c.bgBlue    + c.white)}  ${msg}`),
  socket:    (msg) => console.log(`${badge('SOCKET',   c.bgMagenta + c.white)}  ${msg}`),
  email:     (msg) => console.log(`${badge('EMAIL',    c.bgRed     + c.white)}  ${msg}`),
  db:        (msg) => console.log(`${badge('DB',       c.bgMagenta + c.white)}  ${msg}`),
  ai:        (msg) => console.log(`${badge('AI',       c.bgMagenta + c.white)}  ${msg}`),
  aiError:   (msg) => console.error(`${badge('AI ERR', c.bgRed     + c.white)}  ${c.red}${msg}${c.reset}`),
  billing:   (msg) => console.log(`${badge('BILLING',  c.bgGreen   + c.white)}  ${msg}`),
  dorm:      (msg) => console.log(`${badge('DORM',     c.bgBlue    + c.white)}  ${msg}`),
  friend:    (msg) => console.log(`${badge('FRIEND',   c.bgGreen   + c.white)}  ${msg}`),
  react:     (msg) => console.log(`${badge('REACT',    c.bgYellow  + c.white)}  ${msg}`),
  notif:     (msg) => console.log(`${badge('NOTIF',    c.bgBlue    + c.white)}  ${msg}`),
  msg:       (msg) => console.log(`${badge('MSG',      c.bgCyan    + c.white)}  ${msg}`),

  // ── New domain badges (v4) ────────────────────────────────────────────────
  /** OTP send / verify events */
  otp:       (msg) => console.log(`${badge('OTP',      c.bgYellow  + c.white)}  ${msg}`),
  /** Security events: rate-limits, brute-force, suspicious activity */
  security:  (msg) => console.log(`${badge('SECURITY', c.bgRed     + c.white)}  ${c.yellow}${msg}${c.reset}`),
  /** Account lifecycle: created → pending → approved / rejected / banned */
  lifecycle: (msg) => console.log(`${badge('LIFECYCL', c.bgTeal    + c.white)}  ${msg}`),
  /** Cloudinary / object-storage events */
  cloud:     (msg) => console.log(`${badge('CLOUD',    c.bgCyan    + c.white)}  ${msg}`),
  /** Dev-only security bypass events — active during multi-tab testing */
  bypass:    (msg) => console.log(`${badge('BYPASS',   c.bgOrange  + c.white)}  ${c.yellow}${msg}${c.reset}`),

  // ── Custom one-off badge ──────────────────────────────────────────────────
  tag: (label, color, msg) => console.log(`${badge(label, color)}  ${msg}`),

  // ── Server-startup line ───────────────────────────────────────────────────
  // log.startup('Gmail SMTP', true,  'rutherfordc@gmail.com')
  // log.startup('Cloudinary', false, 'NOT configured — base64 fallback')
  startup: (service, ok, detail = '') => {
    const icon  = ok ? `${c.green}✔${c.reset}` : `${c.red}✖${c.reset}`;
    const color = ok ? c.green : c.red;
    const det   = detail ? `  ${c.dim}${detail}${c.reset}` : '';
    console.log(`${badge('INIT', c.blue)}  ${icon} ${color}${service}${c.reset}${det}`);
  },

  // ── Divider ───────────────────────────────────────────────────────────────
  divider: (label = '') => {
    const LINE = 60;
    if (label) {
      const pad = Math.floor((LINE - label.length - 2) / 2);
      const d   = '─'.repeat(Math.max(0, pad));
      console.log(`${c.dim}${d}${c.reset} ${c.bold}${label}${c.reset} ${c.dim}${d}${c.reset}`);
    } else {
      console.log(`${c.dim}${'─'.repeat(LINE)}${c.reset}`);
    }
  },

  // ── Bold section header ───────────────────────────────────────────────────
  section: (label) => {
    const bar = '═'.repeat(Math.min(label.length + 4, 62));
    console.log(`\n${c.bold}${c.cyan}  ${label}${c.reset}`);
    console.log(`${c.dim}${bar}${c.reset}`);
  },

  // ── Numbered phase step ───────────────────────────────────────────────────
  phase: (n, label) => {
    const icons = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩'];
    const icon  = icons[n - 1] || `(${n})`;
    console.log(`${badge('PHASE', c.bgBlue + c.white)}  ${c.bold}${icon}${c.reset} ${label}`);
  },

  // ── Timing breakdown table ─────────────────────────────────────────────────
  timing: (flowLabel, breakdown) => {
    const entries = Object.entries(breakdown);
    const total   = entries.reduce((s, [, v]) => s + v, 0);
    const maxMs   = Math.max(...entries.map(([, v]) => v));
    const KEY_W   = Math.max(...entries.map(([k]) => k.length), 10);
    const BAR_W   = 20;

    console.log(`${badge('TIMING', c.bgGray + c.white)}  ${c.bold}${flowLabel}${c.reset} — total ${colorMs(total)}`);
    for (const [step, ms] of entries) {
      const pct    = total > 0 ? ms / total : 0;
      const filled = Math.round(pct * BAR_W);
      const bar    = (ms === maxMs ? c.red : c.cyan)
                   + '█'.repeat(filled) + c.dim + '░'.repeat(BAR_W - filled) + c.reset;
      const pctStr = (pct * 100).toFixed(0).padStart(3) + '%';
      const slow   = ms === maxMs ? ` ${c.red}${c.bold}← slowest${c.reset}` : '';
      console.log(`   ${c.cyan}${step.padEnd(KEY_W)}${c.reset}  ${bar}  ${colorMs(ms)}  ${c.dim}${pctStr}${c.reset}${slow}`);
    }
    console.log(`   ${c.dim}${'─'.repeat(KEY_W + BAR_W + 22)}${c.reset}`);
  },

  // ── Smart slow-request warning ────────────────────────────────────────────
  slow: (route, ms, ctx = {}) => {
    if (ms <= SLOW_MS) return;
    const isFileRoute = /upload|register|avatar|document|complete.registration/i.test(route);
    const severity    = ms > VERY_SLOW ? '🐌 VERY SLOW' : '⏱  SLOW';
    const note        = isFileRoute
      ? `${c.dim}(file-upload route — expected to be slow)${c.reset}`
      : '';
    const ctxStr = Object.keys(ctx).length
      ? '  ' + Object.entries(ctx).map(([k, v]) => `${c.dim}${k}=${c.reset}${colorVal(v)}`).join(' ')
      : '';
    log.warn(`${severity} ${colorMs(ms)}  ${c.bold}${route}${c.reset}${ctxStr}  ${note}`);
  },

  // ── Structured dump ───────────────────────────────────────────────────────
  dump: (label, obj) => {
    const KEY_W = 22;
    console.log(`${badge('DUMP', c.magenta)}  ${c.bold}${label}${c.reset}`);
    const entries = typeof obj === 'object' && obj !== null
      ? Object.entries(obj)
      : [['value', obj]];
    for (const [k, v] of entries) {
      console.log(`   ${c.dim}│${c.reset}  ${c.cyan}${String(k).padEnd(KEY_W)}${c.reset} ${colorVal(v)}`);
    }
  },

  // ── Compact aligned table ─────────────────────────────────────────────────
  table: (rows) => {
    if (!rows || !rows.length) return;
    const keys   = Object.keys(rows[0]);
    const widths = keys.map(k => Math.max(k.length, ...rows.map(r => String(r[k] ?? '').length)));
    const header = keys.map((k, i) => c.bold + k.padEnd(widths[i]) + c.reset).join('  ');
    const sep    = widths.map(w => '─'.repeat(w)).join('──');
    console.log(`   ${c.dim}${sep}${c.reset}`);
    console.log(`   ${header}`);
    console.log(`   ${c.dim}${sep}${c.reset}`);
    for (const row of rows) {
      console.log(`   ${keys.map((k, i) => colorVal(row[k]).padEnd ? String(row[k] ?? '').padEnd(widths[i]) : colorVal(row[k])).join('  ')}`);
    }
    console.log(`   ${c.dim}${sep}${c.reset}`);
  },

  // ── HTTP request summary ──────────────────────────────────────────────────
  request: (req, res, ms) => {
    const s      = res.statusCode;
    const user   = req.user
      ? `${c.cyan}@${req.user.username}${c.reset}`
      : `${c.dim}anon${c.reset}`;
    const ip     = normalizeIp(req.headers['x-forwarded-for'] || req.socket?.remoteAddress);
    const method = colorMethod(req.method);
    const group  = routeGroup(req.path);

    // Include query string in path for GET requests (helps debug filters/pagination)
    const qs   = req.method === 'GET' && req.query && Object.keys(req.query).length
      ? `${c.dim}?${new URLSearchParams(req.query).toString().slice(0, 80)}${c.reset}`
      : '';
    const route = `${method} ${c.bold}${req.path}${c.reset}${qs}`;

    let extra = '';
    if (IS_DEV && req.body && req.method !== 'GET') {
      const scrubbed = scrubBody(req.body);
      const snippet  = JSON.stringify(scrubbed).slice(0, 140);
      extra = `\n   ${c.dim}↳ body: ${snippet}${snippet.length >= 140 ? '…' : ''}${c.reset}`;
    }

    // For 4xx in dev, include response body hint if available
    if (IS_DEV && s >= 400 && res._dormError) {
      extra += `\n   ${c.red}↳ error: ${res._dormError}${c.reset}`;
    }

    const line = `${route} → ${colorStatus(s)} ${colorMs(ms)} [${user}]${group}  ip=${c.dim}${ip}${c.reset}${extra}`;

    // Classify route types
    const isFileRoute   = /upload|avatar|document|complete.registration/i.test(req.path);
    const isDormAction  = /\/api\/admin\/dormitory\/(assign|unassign|billing)/i.test(req.path);
    const isAdminAction = /\/api\/admin\/(accounts|users|dormitory)\/.+\/(approve|reject|assign|pay|verify|ban|unban)/i.test(req.path) || isDormAction;
    const isStatic      = /\.(css|js|ico|png|webp|woff2?|map|svg|txt)$/.test(req.path);
    const isHealthy304  = s === 304; // Not Modified — suppress unless debugging

    if      (s >= 500)                       log.error(line);
    else if (s >= 400)                       log.warn(`${line} ${USE_EMOJI ? '🚫 FORBIDDEN' : '[CLIENT ERROR]'}`);
    else if (ms > VERY_SLOW && !isFileRoute) log.warn(`${line} ${USE_EMOJI ? '🐌 VERY SLOW' : '[VERY SLOW]'} (>${ms}ms)`);
    else if (ms > SLOW_MS   && !isFileRoute) log.warn(`${line} ${USE_EMOJI ? '⏱ SLOW' : '[SLOW]'} (>${ms}ms)`);
    else if (ms > VERY_SLOW &&  isFileRoute) log.info(`${line} ${c.dim}(file upload — slow OK)${c.reset}`);
    else if (isDormAction)                   log.dorm(line);
    else if (isAdminAction)                  log.admin(line);
    else if (isStatic && s < 400)            return; // suppress noisy static hits
    else if (isHealthy304 && !IS_DEV)        return; // suppress 304s in production
    else                                     log.info(line);
  },

  // ── Performance timer ─────────────────────────────────────────────────────
  timer: (label) => {
    const start = Date.now();
    return {
      end: (note = '') => {
        const elapsed = Date.now() - start;
        const line    = `${c.bold}${label}${c.reset} took ${colorMs(elapsed)}${note ? ' — ' + note : ''}`;
        if (elapsed > VERY_SLOW) log.warn(line);
        else                     log.info(line);
        return elapsed;
      },
    };
  },

  // ── Stack-trace helper (dev only) ─────────────────────────────────────────
  trace: (msg) => {
    if (!IS_DEV) return;
    const stack = new Error().stack.split('\n').slice(2, 6).map(l => l.trim()).join('\n   ');
    console.log(`${badge('TRACE', c.magenta)}  ${msg}\n   ${c.dim}${stack}${c.reset}`);
  },

  // ── Quick diff logger — show before/after changes for a record ────────────
  diff: (label, before, after) => {
    const allKeys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
    const changes = [];
    for (const k of allKeys) {
      const bv = before?.[k], av = after?.[k];
      if (bv !== av) changes.push({ field: k, from: bv, to: av });
    }
    if (!changes.length) { console.log(`${badge('DIFF', c.gray)}  ${label} — ${c.dim}no changes${c.reset}`); return; }
    console.log(`${badge('DIFF', c.yellow)}  ${c.bold}${label}${c.reset} — ${changes.length} field(s) changed`);
    for (const { field, from, to } of changes) {
      console.log(`   ${c.dim}│${c.reset}  ${c.cyan}${String(field).padEnd(20)}${c.reset}  ${c.red}${trunc(String(from ?? '(none)'), 40)}${c.reset}  →  ${c.green}${trunc(String(to ?? '(none)'), 40)}${c.reset}`);
    }
  },

  // ── Expose constants for use in routes ────────────────────────────────────
  SLOW_MS,
  VERY_SLOW,
};

module.exports = log;
