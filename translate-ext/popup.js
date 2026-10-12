/* Translate – popup */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const t = (k, s) => chrome.i18n.getMessage(k, s) || k;
  const UILOC = chrome.i18n.getUILanguage();
  const els = { src: $('src'), tgt: $('tgt'), input: $('input'), output: $('output'), copy: $('copy'), clear: $('clear'),
    count: $('count'), detected: $('detected'), swap: $('swap'), page: $('page'), pageLabel: $('pageLabel'), pageHint: $('pageHint') };
  const MAX = 5000;
  let detected = null, result = '', reqId = 0, timer = 0, tab = null, pageState = null;

  if (new URLSearchParams(location.search).has('window')) document.body.classList.add('win');
  document.documentElement.lang = UILOC;
  document.documentElement.dir = chrome.i18n.getMessage('@@bidi_dir') || 'ltr';

  // i18n
  document.querySelectorAll('[data-i18n]').forEach((e) => { e.textContent = t(e.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach((e) => { e.placeholder = t(e.dataset.i18nPh); });
  document.querySelectorAll('[data-i18n-title]').forEach((e) => { e.title = t(e.dataset.i18nTitle); });
  document.querySelectorAll('[data-i18n-aria]').forEach((e) => { e.setAttribute('aria-label', t(e.dataset.i18nAria)); });
  els.output.dataset.ph = t('outputPlaceholder');

  // Language lists
  const langs = TLang.list(UILOC);
  const fill = (sel, withAuto) => {
    const frag = document.createDocumentFragment();
    if (withAuto) frag.append(new Option(t('detectLanguage'), 'auto'));
    for (const l of langs) frag.append(new Option(l.name, l.code));
    sel.append(frag);
  };
  fill(els.src, true);
  fill(els.tgt, false);

  const save = () => chrome.storage.local.set({ src: els.src.value, tgt: els.tgt.value });
  const saveDraft = () => chrome.storage.session.set({ draft: els.input.value }).catch(() => {});

  function setDir() {
    els.input.lang = els.src.value === 'auto' ? '' : els.src.value;
    els.output.lang = els.tgt.value;
  }

  function updateCount() {
    els.count.textContent = `${els.input.value.length} / ${MAX}`;
    els.clear.hidden = !els.input.value;
  }

  async function translateNow() {
    const text = els.input.value;
    const id = ++reqId;
    if (!text.trim()) {
      result = ''; els.output.textContent = ''; els.output.className = ''; els.copy.disabled = true; showDetected(null);
      return;
    }
    els.output.classList.add('loading');
    try {
      const r = await chrome.runtime.sendMessage({ type: 'translate', texts: [text], sl: els.src.value, tl: els.tgt.value, format: 'text' });
      if (id !== reqId) return;
      if (!r || !r.ok) throw new Error(r && r.error);
      result = r.translations[0] || '';
      els.output.className = '';
      els.output.textContent = result;
      els.copy.disabled = !result;
      showDetected(els.src.value === 'auto' ? r.detected : null);
    } catch (_) {
      if (id !== reqId) return;
      result = '';
      els.output.className = 'err';
      els.output.textContent = t('errorGeneric');
      els.copy.disabled = true;
    }
  }
  function schedule(delay = 350) { clearTimeout(timer); timer = setTimeout(translateNow, delay); }
  function showDetected(code) {
    detected = code || null;
    els.detected.textContent = detected ? t('detectedLang', [TLang.name(detected, UILOC)]) : '';
  }

  els.input.addEventListener('input', () => { updateCount(); saveDraft(); schedule(); });
  els.input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); schedule(0); } });
  els.src.addEventListener('change', () => { save(); setDir(); schedule(0); });
  els.tgt.addEventListener('change', () => {
    save(); setDir(); schedule(0);
    if (pageState && pageState.on) pageAction('translatePage');
  });
  els.clear.addEventListener('click', () => { els.input.value = ''; updateCount(); saveDraft(); translateNow(); els.input.focus(); });
  els.copy.addEventListener('click', async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    els.copy.title = t('copied');
    els.detected.textContent = t('copied');
    setTimeout(() => { els.copy.title = t('copy'); showDetected(detected); }, 1200);
  });
  els.swap.addEventListener('click', () => {
    const from = els.src.value === 'auto' ? detected : els.src.value;
    const to = els.tgt.value;
    if (!from || from === to) { els.src.value = to; } else { els.src.value = to; els.tgt.value = from; }
    if (result) { els.input.value = result; updateCount(); saveDraft(); }
    save(); setDir(); schedule(0);
  });
  $('privacy').addEventListener('click', (e) => { e.preventDefault(); chrome.tabs.create({ url: chrome.runtime.getURL('privacy.html') }); });
  $('noticeOk').addEventListener('click', () => { $('notice').hidden = true; chrome.storage.local.set({ noticeSeen: true }); });

  /* ---------- page translation ---------- */
  const RESTRICTED = /^(chrome|edge|brave|opera|vivaldi|about|chrome-extension|devtools|view-source|chrome-search|data|javascript):|^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)/i;

  function renderPage() {
    const ok = tab && tab.url && !RESTRICTED.test(tab.url);
    els.page.disabled = !ok;
    els.pageHint.textContent = ok ? '' : t('pageUnavailable');
    if (!ok) { els.pageLabel.textContent = t('translatePage'); return; }
    if (pageState && pageState.on) {
      els.pageLabel.textContent = t('showOriginal');
      els.pageHint.textContent = t('translatedTo', [TLang.name(pageState.tl, UILOC)]);
    } else els.pageLabel.textContent = t('translatePage');
  }

  async function pageAction(type) {
    if (!tab) return;
    els.page.disabled = true;
    els.pageHint.textContent = t('translating');
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['languages.js', 'content.js'] });
      pageState = await chrome.tabs.sendMessage(tab.id, { type, tl: els.tgt.value }, { frameId: 0 });
      renderPage();
    } catch (_) {
      els.page.disabled = true;
      els.pageHint.textContent = t('pageUnavailable');
    }
  }
  els.page.addEventListener('click', () => pageAction(pageState && pageState.on ? 'restorePage' : 'translatePage'));

  /* ---------- init ---------- */
  (async () => {
    const s = await chrome.storage.local.get({ src: 'auto', tgt: null, noticeSeen: false });
    els.src.value = s.src || 'auto';
    if (els.src.selectedIndex < 0) els.src.value = 'auto';
    els.tgt.value = s.tgt || TLang.normalize(UILOC);
    if (els.tgt.selectedIndex < 0) els.tgt.value = 'en';
    if (!s.noticeSeen) $('notice').hidden = false;
    setDir();

    const ss = await chrome.storage.session.get({ pending: '', draft: '' }).catch(() => ({ pending: '', draft: '' }));
    if (ss.pending) { els.input.value = ss.pending.slice(0, MAX); chrome.storage.session.set({ pending: '', draft: els.input.value }); }
    else els.input.value = ss.draft || '';
    updateCount();
    if (els.input.value.trim()) translateNow();
    els.input.focus();
    els.input.setSelectionRange(els.input.value.length, els.input.value.length);

    try {
      [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: !document.body.classList.contains('win') });
      if (document.body.classList.contains('win')) tab = null; // standalone window: no page context
      if (tab) pageState = await chrome.tabs.sendMessage(tab.id, { type: 'getState' }, { frameId: 0 }).catch(() => null);
    } catch (_) { tab = null; }
    renderPage();
  })();
})();
