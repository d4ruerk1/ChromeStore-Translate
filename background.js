/* Translate – service worker: context menus, shortcut, translation engine. */
importScripts('languages.js');

const GOOGLE = 'https://translate.googleapis.com/translate_a/t';
const MYMEMORY = 'https://api.mymemory.translated.net/get';
const MAX_CHARS = 4500;      // per request
const MAX_ITEMS = 100;       // per request
const MAX_PARALLEL = 4;
const TIMEOUT_MS = 15000;
const CACHE_MAX = 4000;

const msg = (k, s) => chrome.i18n.getMessage(k, s) || k;
const uiLang = () => TLang.normalize((self.navigator && navigator.language) || chrome.i18n.getUILanguage());

/* ---------- settings ---------- */
async function getSettings() {
  const s = await chrome.storage.local.get({ src: 'auto', tgt: null });
  if (!s.tgt) s.tgt = uiLang();
  return s;
}

/* ---------- menus ---------- */
function createMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'tr-selection', title: msg('menuSelection'), contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'tr-page', title: msg('menuPage'), contexts: ['page'] });
    chrome.contextMenus.create({ id: 'tr-original', title: msg('menuOriginal'), contexts: ['page'] });
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  createMenus();
});
chrome.runtime.onStartup.addListener(createMenus);

/* ---------- injection ---------- */
async function inject(tabId, frameId = 0) {
  await chrome.scripting.executeScript({ target: { tabId, frameIds: [frameId] }, files: ['languages.js', 'content.js'] });
}
async function sendToTab(tabId, message, frameId = 0) {
  await inject(tabId, frameId);
  return chrome.tabs.sendMessage(tabId, message, { frameId });
}

async function openPopupFallback(text) {
  await chrome.storage.session.set({ pending: text || '' });
  try { await chrome.action.openPopup(); return; } catch (_) {}
  chrome.windows.create({ url: 'popup.html?window=1', type: 'popup', width: 680, height: 470 });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const tabId = tab && tab.id;
  if (info.menuItemId === 'tr-selection') {
    const text = info.selectionText || '';
    try {
      if (tabId == null || tabId < 0) throw new Error('no tab');
      await sendToTab(tabId, { type: 'showSelection', text }, info.frameId || 0);
    } catch (_) {
      openPopupFallback(text); // PDF viewer, chrome:// pages, restricted frames
    }
    return;
  }
  if (tabId == null || tabId < 0) return;
  const action = info.menuItemId === 'tr-page' ? 'translatePage' : 'restorePage';
  try { await sendToTab(tabId, { type: action }); } catch (_) { /* restricted page */ }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'toggle-page') return;
  if (!tab) [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id == null) return;
  try { await sendToTab(tab.id, { type: 'togglePage' }); } catch (_) {}
});

/* ---------- badge ---------- */
function setBadge(tabId, lang) {
  if (tabId == null) return;
  const text = lang ? lang.split('-')[0].toUpperCase().slice(0, 3) : '';
  chrome.action.setBadgeText({ tabId, text }).catch(() => {});
  if (lang) chrome.action.setBadgeBackgroundColor({ tabId, color: '#2563eb' }).catch(() => {});
}

/* ---------- cache (LRU, memory only – nothing persisted) ---------- */
const cache = new Map();
function cacheGet(k) {
  const v = cache.get(k);
  if (v !== undefined) { cache.delete(k); cache.set(k, v); }
  return v;
}
function cacheSet(k, v) {
  cache.set(k, v);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

/* ---------- concurrency limiter ---------- */
let active = 0;
const waiting = [];
async function limit(fn) {
  if (active >= MAX_PARALLEL) await new Promise((r) => waiting.push(r));
  active++;
  try { return await fn(); } finally { active--; const n = waiting.shift(); if (n) n(); }
}

async function fetchJSON(url, init) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) { const e = new Error('HTTP ' + res.status); e.status = res.status; throw e; }
    return await res.json();
  } finally { clearTimeout(t); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- engines ---------- */
async function google(texts, sl, tl, format) {
  const url = `${GOOGLE}?client=gtx&format=${format}&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}`;
  const body = new URLSearchParams();
  for (const t of texts) body.append('q', t);
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const data = await limit(() => fetchJSON(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body
      }));
      if (!Array.isArray(data) || data.length !== texts.length) throw new Error('Bad response');
      return data.map((d) => (Array.isArray(d) ? { t: String(d[0] ?? ''), l: d[1] || null } : { t: String(d ?? ''), l: sl === 'auto' ? null : sl }));
    } catch (e) {
      lastErr = e;
      if (e.status && e.status < 500 && e.status !== 429) break;
      await sleep(400 * (attempt + 1) ** 2);
    }
  }
  throw lastErr;
}

async function myMemory(text, sl, tl) {
  const pair = `${sl === 'auto' ? 'Autodetect' : sl}|${tl}`;
  const data = await fetchJSON(`${MYMEMORY}?q=${encodeURIComponent(text.slice(0, 500))}&langpair=${encodeURIComponent(pair)}`);
  if (!data || data.responseStatus !== 200) throw new Error('MyMemory error');
  return { t: data.responseData.translatedText, l: data.responseData.detectedLanguage || (sl === 'auto' ? null : sl) };
}

/** Translate an array of strings. format: 'html' (escaped markup) | 'text'. */
async function translate(texts, sl, tl, format) {
  const out = new Array(texts.length);
  const todo = [];
  texts.forEach((t, i) => {
    if (!t || !t.trim()) { out[i] = { t, l: null }; return; }
    const hit = cacheGet(`${format}|${sl}|${tl}|${t}`);
    if (hit) out[i] = hit; else todo.push(i);
  });

  // Group into requests bounded by size and item count.
  const groups = [];
  let cur = [], chars = 0;
  for (const i of todo) {
    const len = texts[i].length;
    if (cur.length && (chars + len > MAX_CHARS || cur.length >= MAX_ITEMS)) { groups.push(cur); cur = []; chars = 0; }
    cur.push(i); chars += len;
  }
  if (cur.length) groups.push(cur);

  await Promise.all(groups.map(async (g) => {
    let res;
    try {
      res = await google(g.map((i) => texts[i]), sl, tl, format);
    } catch (e) {
      if (format !== 'text' || g.length !== 1 || texts[g[0]].length > 500) throw e;
      res = [await myMemory(texts[g[0]], sl, tl)];
    }
    g.forEach((i, k) => { out[i] = res[k]; cacheSet(`${format}|${sl}|${tl}|${texts[i]}`, res[k]); });
  }));

  // Most frequent detected language.
  const freq = {};
  for (const r of out) if (r && r.l) freq[r.l] = (freq[r.l] || 0) + 1;
  const detected = Object.keys(freq).sort((a, b) => freq[b] - freq[a])[0] || null;
  return { translations: out.map((r) => r.t), detected };
}

/* ---------- messaging ---------- */
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (!m || typeof m !== 'object') return;
  if (m.type === 'translate') {
    (async () => {
      const s = await getSettings();
      const sl = m.sl || 'auto';
      const tl = m.tl || s.tgt;
      const r = await translate(Array.isArray(m.texts) ? m.texts.map(String) : [], sl, tl, m.format === 'text' ? 'text' : 'html');
      return { ok: true, ...r, tl };
    })().then(reply, (e) => reply({ ok: false, error: String(e && e.message || e) }));
    return true;
  }
  if (m.type === 'pageState') {
    setBadge(sender.tab && sender.tab.id, m.translated ? m.tl : null);
    return;
  }
  if (m.type === 'openPrivacy') {
    chrome.tabs.create({ url: chrome.runtime.getURL('privacy.html') });
  }
});

// Per-tab badge is reset when a tab starts loading a new document.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading') setBadge(tabId, null);
});
