/* Translate – service worker: context menus, shortcut, translation engines.
 *
 * v1.1.0: the unofficial endpoint translate.googleapis.com (client=gtx) has been
 * removed. Only official, documented APIs are used, chosen by the user in the
 * options page:
 *   - MyMemory (Translated S.r.l., Italy) – public API, no key (default)
 *   - Google Cloud Translation API v2 – user's own API key
 *   - DeepL API (Free or Pro) – user's own API key
 * No server of the developer is involved; API keys stay in chrome.storage.local.
 */
importScripts('languages.js');

const MYMEMORY = 'https://api.mymemory.translated.net/get';
const GOOGLE_CLOUD = 'https://translation.googleapis.com/language/translate/v2';
const DEEPL_FREE = 'https://api-free.deepl.com/v2/translate';
const DEEPL_PRO = 'https://api.deepl.com/v2/translate';

const LIMITS = {
  mymemory: { chars: 500, items: 1, parallel: 3 },   // MyMemory: max 500 bytes per query
  google: { chars: 4500, items: 100, parallel: 4 },
  deepl: { chars: 4500, items: 50, parallel: 3 },    // DeepL: max 50 texts per request
};
const TIMEOUT_MS = 15000;
const CACHE_MAX = 4000;
const DEFAULTS = { src: 'auto', tgt: null, engine: 'mymemory', gKey: '', dKey: '', mmEmail: '' };

const msg = (k, s) => chrome.i18n.getMessage(k, s) || k;
const uiLang = () => TLang.normalize((self.navigator && navigator.language) || chrome.i18n.getUILanguage());

/* ---------- settings ---------- */
async function getSettings() {
  const s = await chrome.storage.local.get(DEFAULTS);
  if (!s.tgt) s.tgt = uiLang();
  if (!['mymemory', 'google', 'deepl'].includes(s.engine)) s.engine = 'mymemory';
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

chrome.runtime.onInstalled.addListener((details) => {
  createMenus();
  // First install: let the user choose the translation service (transparency, GDPR art. 13).
  if (details.reason === 'install') chrome.runtime.openOptionsPage().catch(() => {});
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
async function limit(max, fn) {
  while (active >= max) await new Promise((r) => waiting.push(r));
  active++;
  try { return await fn(); } finally { active--; const n = waiting.shift(); if (n) n(); }
}

class EngineError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}

async function fetchJSON(url, init) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (res.status === 401 || res.status === 403) throw new EngineError('badKey', res.status);
    if (res.status === 429 || res.status === 456) throw new EngineError('quota', res.status);
    if (!res.ok) throw new EngineError('http', res.status);
    return await res.json();
  } finally { clearTimeout(t); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function withRetry(fn) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      if (e.code === 'badKey' || e.code === 'quota' || e.code === 'config' || e.code === 'tooLong') break;
      if (e.status && e.status < 500) break;
      await sleep(400 * (attempt + 1) ** 2);
    }
  }
  throw lastErr;
}

/* ---------- language code mapping ---------- */
function deeplTarget(code) {
  const m = { en: 'EN-US', pt: 'PT-BR', 'zh-CN': 'ZH-HANS', 'zh-TW': 'ZH-HANT', no: 'NB' };
  return m[code] || code.split('-')[0].toUpperCase();
}
function deeplSource(code) {
  const m = { 'zh-CN': 'ZH', 'zh-TW': 'ZH', no: 'NB' };
  return m[code] || code.split('-')[0].toUpperCase();
}
function fromDeepl(code) {
  if (!code) return null;
  const c = code.toLowerCase();
  return c === 'zh' ? 'zh-CN' : c === 'nb' ? 'no' : TLang.normalize(c);
}
const utf8Len = (s) => new TextEncoder().encode(s).length;

/* ---------- engines: (texts[], sl, tl, format, settings) -> [{t, l}] ---------- */
async function myMemory(texts, sl, tl, format, s) {
  const text = texts[0];
  if (utf8Len(text) > 500) throw new EngineError('tooLong');
  const pair = `${sl === 'auto' ? 'Autodetect' : sl}|${tl}`;
  let url = `${MYMEMORY}?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(pair)}`;
  if (s.mmEmail) url += `&de=${encodeURIComponent(s.mmEmail)}`; // higher daily quota (documented by MyMemory)
  const data = await fetchJSON(url);
  const status = Number(data && data.responseStatus);
  const out = data && data.responseData && data.responseData.translatedText;
  if (status === 429 || /^MYMEMORY WARNING/i.test(out || '')) throw new EngineError('quota', 429);
  if (status !== 200 || typeof out !== 'string') throw new EngineError('http', status || 0);
  const det = data.responseData.detectedLanguage;
  return [{ t: out, l: det ? TLang.normalize(det) : (sl === 'auto' ? null : sl) }];
}

async function googleCloud(texts, sl, tl, format, s) {
  if (!s.gKey) throw new EngineError('config');
  const body = { q: texts, target: tl, format };
  if (sl !== 'auto') body.source = sl;
  const data = await fetchJSON(`${GOOGLE_CLOUD}?key=${encodeURIComponent(s.gKey)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body)
  });
  const tr = data && data.data && data.data.translations;
  if (!Array.isArray(tr) || tr.length !== texts.length) throw new EngineError('http', 0);
  return tr.map((x) => ({ t: String(x.translatedText ?? ''), l: x.detectedSourceLanguage ? TLang.normalize(x.detectedSourceLanguage) : (sl === 'auto' ? null : sl) }));
}

async function deepl(texts, sl, tl, format, s) {
  if (!s.dKey) throw new EngineError('config');
  const endpoint = /:fx$/.test(s.dKey.trim()) ? DEEPL_FREE : DEEPL_PRO;
  const body = { text: texts, target_lang: deeplTarget(tl) };
  if (sl !== 'auto') body.source_lang = deeplSource(sl);
  if (format === 'html') body.tag_handling = 'html';
  const data = await fetchJSON(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `DeepL-Auth-Key ${s.dKey.trim()}` },
    body: JSON.stringify(body)
  });
  const tr = data && data.translations;
  if (!Array.isArray(tr) || tr.length !== texts.length) throw new EngineError('http', 0);
  return tr.map((x) => ({ t: String(x.text ?? ''), l: fromDeepl(x.detected_source_language) }));
}


const ENGINES = { mymemory: myMemory, google: googleCloud, deepl };

/* Open the options page at most once per browser session when the service needs attention. */
async function nudgeOptions(reason) {
  try {
    const { nudged } = await chrome.storage.session.get({ nudged: false });
    if (nudged) return;
    await chrome.storage.session.set({ nudged: true });
    await chrome.tabs.create({ url: chrome.runtime.getURL(`options.html?reason=${reason}`) });
  } catch (_) {}
}

/** Translate an array of strings. format: 'html' (escaped markup) | 'text'. */
async function translate(texts, sl, tl, format, s) {
  const engine = s.engine;
  const lim = LIMITS[engine];
  const run = ENGINES[engine];
  const out = new Array(texts.length);
  const todo = [];
  texts.forEach((t, i) => {
    if (!t || !t.trim()) { out[i] = { t, l: null }; return; }
    const hit = cacheGet(`${engine}|${format}|${sl}|${tl}|${t}`);
    if (hit) out[i] = hit; else todo.push(i);
  });

  // Group into requests bounded by size and item count.
  const groups = [];
  let cur = [], chars = 0;
  for (const i of todo) {
    const len = texts[i].length;
    if (cur.length && (chars + len > lim.chars || cur.length >= lim.items)) { groups.push(cur); cur = []; chars = 0; }
    cur.push(i); chars += len;
  }
  if (cur.length) groups.push(cur);

  try {
    await Promise.all(groups.map(async (g) => {
      const res = await withRetry(() => limit(lim.parallel, () => run(g.map((i) => texts[i]), sl, tl, format, s)));
      g.forEach((i, k) => { out[i] = res[k]; cacheSet(`${engine}|${format}|${sl}|${tl}|${texts[i]}`, res[k]); });
    }));
  } catch (e) {
    if (e && (e.code === 'config' || e.code === 'badKey' || e.code === 'quota' || e.code === 'tooLong')) nudgeOptions(e.code);
    throw e;
  }

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
      const r = await translate(Array.isArray(m.texts) ? m.texts.map(String) : [], sl, tl, m.format === 'text' ? 'text' : 'html', s);
      return { ok: true, ...r, tl, engine: s.engine };
    })().then(reply, (e) => reply({ ok: false, error: String((e && (e.code || e.message)) || e) }));
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
