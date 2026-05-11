/**
 * public/js/api.js — Shared helpers used by all PGA-DAMIS pages
 *
 * Includes:
 *  - api()          fetch wrapper with error handling
 *  - toast()        Toastify wrapper
 *  - escHtml()      XSS-safe HTML escaping
 *  - avatarUrl()    ui-avatars fallback
 *  - darkMode       toggle + persistence via localStorage
 *  - formatDate()   dayjs relative time
 *  - onlineStatus   track via Socket.io events
 */

'use strict';

// ── Fetch wrapper ─────────────────────────────────────
async function api(url, options = {}) {
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  } catch (err) {
    console.error(`API error [${url}]:`, err.message);
    throw err;
  }
}

// ── Toast ─────────────────────────────────────────────
function toast(msg, type = 'success') {
  const bg = type === 'success' ? '#16a34a'
           : type === 'error'   ? '#e5365a'
           : type === 'warning' ? '#f59e0b'
           : '#1a8cff';
  Toastify({
    text: msg, duration: 3200, gravity: 'top', position: 'right', stopOnFocus: false,
    style: { background: bg, borderRadius: '12px', fontFamily: 'DM Sans, sans-serif', fontSize: '14px', padding: '12px 20px', pointerEvents: 'none' }
  }).showToast();
}

// ── HTML escape ───────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Full name builder (first + middle + last + suffix) ────────────────
function fullName(user) {
  if (!user) return '';
  const parts = [
    user.firstName  || user.first_name  || '',
    user.middleName || user.middle_name || '',
    user.lastName   || user.last_name   || '',
    user.suffix     || '',
  ].filter(Boolean);
  return parts.join(' ');
}

// ── Avatar fallback ───────────────────────────────────
function avatarUrl(firstName, lastName) {
  const name = encodeURIComponent(`${firstName || 'U'} ${lastName || ''}`);
  return `https://ui-avatars.com/api/?name=${name}&background=1a8cff&color=fff&size=128`;
}

// ── Date formatting ───────────────────────────────────
function fromNow(dateStr) {
  return dayjs(dateStr).fromNow();
}

// ── Dark mode ─────────────────────────────────────────
const DarkMode = {
  key: 'ch-dark',

  isEnabled() {
    return localStorage.getItem(this.key) === 'true';
  },

  apply() {
    document.documentElement.classList.toggle('dark', this.isEnabled());
    const icon = document.getElementById('dark-toggle-icon');
    if (icon) icon.className = this.isEnabled()
      ? 'fa-solid fa-sun text-yellow-400 text-sm'
      : 'fa-solid fa-moon text-slate-500 text-sm';
  },

  toggle() {
    localStorage.setItem(this.key, !this.isEnabled());
    this.apply();
    toast(this.isEnabled() ? '🌙 Dark mode on' : '☀️ Light mode on', 'info');
  },

  init() {
    // Apply before paint to avoid flash
    this.apply();
  }
};

// Run dark mode immediately (before DOMContentLoaded)
DarkMode.init();

// ── Copy to clipboard ────────────────────────────────
function copyToClipboard(text, label = 'Copied!') {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text);
    toast(`📋 ${label}`);
  }
}

// ── Scroll lock (for modals) ─────────────────────────
function lockScroll()   { document.body.style.overflow = 'hidden'; }
function unlockScroll() { document.body.style.overflow = ''; }

// ── Debounce ─────────────────────────────────────────
function debounce(fn, delay = 400) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

// ── Logout ───────────────────────────────────────────
async function logout() {
  await fetch('/api/auth/logout');
  window.location.href = '/';
}

// ── Nav helpers ───────────────────────────────────────
function goProfile(username) {
  const u = username || window.__currentUser?.username;
  if (u) window.location.href = `/profile.html?u=${u}`;
}

// ── Unread counts in nav ─────────────────────────────
async function refreshNavCounts() {
  try {
    const [notifData, msgData] = await Promise.all([
      fetch('/api/notifications/unread-count').then(r => r.json()),
      fetch('/api/messages/unread-count').then(r => r.json()).catch(() => ({ count: 0 })),
    ]);
    setBadge('notif-badge', notifData.count);
    setBadge('msg-badge',   msgData.count);
    setBadge('sidebar-notif-badge', notifData.count);
    setBadge('sidebar-msg-badge',   msgData.count);
  } catch {}
}

function setBadge(id, count) {
  const el = document.getElementById(id);
  if (!el) return;
  if (count > 0) {
    el.textContent = count > 99 ? '99+' : count;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}
