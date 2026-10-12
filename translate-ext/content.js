/* Translate – content script (injected on demand via activeTab). */
(() => {
  'use strict';
  const alive = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (_) { return false; } };
  if (globalThis.__translateExt && globalThis.__translateExt.alive()) return;
  globalThis.__translateExt = { alive };

  const t = (k, s) => { try { return chrome.i18n.getMessage(k, s) || k; } catch (_) { return k; } };
  const UILOC = chrome.i18n.getUILanguage();
  const langName = (c) => TLang.name(c, UILOC);
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const LETTER = /\p{L}/u;
  const parser = new DOMParser();
  const parseHTML = (h) => parser.parseFromString('<!doctype html><body>' + h, 'text/html').body; // inert

  async function settings() {
    const s = await chrome.storage.local.get({ src: 'auto', tgt: null });
    if (!s.tgt) s.tgt = TLang.normalize(UILOC);
    return s;
  }

  async function rpc(texts, tl, format, sl = 'auto') {
    if (!alive()) throw new Error('Extension reloaded');
    const r = await chrome.runtime.sendMessage({ type: 'translate', texts, sl, tl, format });
    if (!r || !r.ok) throw new Error((r && r.error) || 'error');
    return r;
  }

  /* ================= DOM classification ================= */
  const INLINE = new Set('a abbr b bdi bdo big cite data dfn em font i ins del mark q s small span strong sub sup time tt u label nobr'.split(' '));
  const SKIP = new Set('script style noscript template code pre kbd samp var textarea input select option svg math iframe frame canvas object embed video audio head title'.split(' '));
  const HOST_ATTR = 'data-translate-ext';

  function skipped(el) {
    if (SKIP.has(el.localName) || el.hasAttribute(HOST_ATTR)) return true;
    if (el.getAttribute('translate') === 'no') return true;
    if (el.classList && el.classList.contains('notranslate')) return true;
    const ce = el.getAttribute('contenteditable');
    return ce !== null && ce !== 'false';
  }
  function inSkipped(node) {
    for (let p = node.nodeType === 1 ? node : node.parentNode; p; p = p.parentNode || p.host) {
      if (p.nodeType === 1 && skipped(p)) return true;
      if (p === document.documentElement) break;
    }
    return false;
  }
  const isInlineEl = (n) => n.nodeType === 1 && INLINE.has(n.localName) && !skipped(n);

  function hasOwnText(el) {
    for (let n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) { if (LETTER.test(n.nodeValue)) return true; }
      else if (isInlineEl(n) && hasOwnText(n)) return true;
    }
    return false;
  }

  function unitFor(node) {
    let p = node.nodeType === 1 ? node : node.parentNode;
    if (!p || p.nodeType !== 1) return null;
    while (INLINE.has(p.localName) && p.parentNode && p.parentNode.nodeType === 1) p = p.parentNode;
    return inSkipped(p) ? null : p;
  }

  function collectUnits(root, out) {
    if (root.nodeType === 1) {
      if (skipped(root)) return;
      if (!INLINE.has(root.localName) && hasOwnText(root)) out.add(root);
      if (root.shadowRoot) collectUnits(root.shadowRoot, out);
    }
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (el) => (skipped(el) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
    });
    for (let el = tw.nextNode(); el; el = tw.nextNode()) {
      if (!INLINE.has(el.localName) && hasOwnText(el)) out.add(el);
      if (el.shadowRoot) collectUnits(el.shadowRoot, out);
    }
  }

  /* ================= Page translation state ================= */
  const P = {
    on: false, tl: null, detected: null, gen: 0, busy: 0,
    texts: new Map(),      // Text -> { orig, tr }
    created: new Set(),    // synthetic Text nodes we inserted
    orders: new Map(),     // container -> original child array (only when reordered)
    attrs: new Map(),      // Element -> { attr: { orig, tr } }
    unitEls: new WeakSet(), attrEls: new WeakSet(),
    pending: new Set(), attrPending: new Set(),
    title: null, io: null, mo: null, timer: 0
  };
  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  const ATTR_SEL = '[placeholder],[title],[aria-label],img[alt]';

  function origOf(n) {
    if (P.created.has(n)) return '';
    const r = P.texts.get(n);
    if (!r) return n.nodeValue;
    if (n.nodeValue !== r.tr) { r.orig = n.nodeValue; r.tr = n.nodeValue; } // page changed it
    return r.orig;
  }
  function setText(n, value) {
    let r = P.texts.get(n);
    if (!r) { r = { orig: n.nodeValue, tr: n.nodeValue }; P.texts.set(n, r); }
    r.tr = value;
    if (n.nodeValue !== value) n.nodeValue = value;
  }
  const lead = (s) => s.match(/^\s*/)[0];
  const trail = (s) => s.match(/\s*$/)[0];
  function fit(orig, translated) {
    const core = translated.trim();
    if (!core) return orig.trim() ? (lead(orig) || trail(orig) ? ' ' : '') : orig;
    return lead(orig) + core + trail(orig);
  }

  /** Serialize a unit into placeholder markup using original text. */
  function serialize(unit) {
    const els = [], parents = [];
    let html = '';
    const walk = (c, ci) => {
      for (let n = c.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3) html += esc(origOf(n));
        else if (isInlineEl(n)) {
          const i = els.push(n) - 1; parents.push(ci);
          html += `<span i=${i}>`; walk(n, i); html += '</span>';
        } else if (n.nodeType === 1 || n.nodeType === 8) {
          const i = els.push(n) - 1; parents.push(ci);
          html += `<br i=${i}>`;
        }
      }
    };
    walk(unit, -1);
    return { html, els, parents };
  }

  /** Apply placeholder translation; returns false if structure can't be mapped safely. */
  function applyMarkup(unit, s, translated) {
    const body = parseHTML(translated);
    const seen = new Array(s.els.length).fill(false);
    const seqs = new Map(); // container index -> [string | elIndex]
    let ok = true;
    const walk = (node, ci) => {
      const seq = [];
      for (let n = node.firstChild; n && ok; n = n.nextSibling) {
        if (n.nodeType === 3) {
          if (typeof seq[seq.length - 1] === 'string') seq[seq.length - 1] += n.nodeValue; else seq.push(n.nodeValue);
        } else if (n.nodeType === 1) {
          const i = parseInt(n.getAttribute('i'), 10);
          const expectTag = s.els[i] && (isInlineEl(s.els[i]) ? 'span' : 'br');
          if (!(i >= 0) || seen[i] || n.localName !== expectTag || s.parents[i] !== ci) { ok = false; return; }
          seen[i] = true; seq.push(i);
          if (expectTag === 'span') walk(n, i);
        }
      }
      seqs.set(ci, seq);
    };
    walk(body, -1);
    if (!ok || seen.includes(false)) return false;

    for (const [ci, seq] of seqs) {
      const c = ci === -1 ? unit : s.els[ci];
      const kids = Array.from(c.childNodes);
      const origElOrder = kids.filter((n) => n.nodeType !== 3).map((n) => s.els.indexOf(n));
      const newElOrder = seq.filter((x) => typeof x === 'number');
      if (origElOrder.join() === newElOrder.join()) {
        // Same order: only rewrite text values (framework-safe, no node moves).
        const gapsOrig = [[]];
        for (const n of kids) { if (n.nodeType === 3) gapsOrig[gapsOrig.length - 1].push(n); else gapsOrig.push([]); }
        const gapsNew = [''];
        for (const x of seq) { if (typeof x === 'string') gapsNew[gapsNew.length - 1] += x; else gapsNew.push(''); }
        gapsOrig.forEach((nodes, g) => {
          const tr = gapsNew[g] || '';
          if (nodes.length) {
            const joined = nodes.map(origOf).join('');
            setText(nodes[0], fit(joined, tr));
            for (let k = 1; k < nodes.length; k++) setText(nodes[k], '');
          } else if (tr.trim()) {
            const tn = document.createTextNode(tr);
            P.created.add(tn);
            const before = g < newElOrder.length ? s.els[newElOrder[g]] : null;
            c.insertBefore(tn, before);
          }
        });
      } else {
        // Reordered by the translation (e.g. adjective/noun order): reuse nodes, move them.
        if (!P.orders.has(c)) P.orders.set(c, kids);
        const pool = kids.filter((n) => n.nodeType === 3);
        const joined = pool.map(origOf).join('');
        let first = true;
        for (const x of seq) {
          let node;
          if (typeof x === 'number') node = s.els[x];
          else {
            const val = first ? lead(joined) + x.replace(/^\s+/, '') : x;
            node = pool.shift();
            if (node) setText(node, val); else { node = document.createTextNode(val); P.created.add(node); }
          }
          first = false;
          c.appendChild(node);
        }
        for (const n of pool) { setText(n, ''); c.appendChild(n); }
      }
    }
    return true;
  }

  function textNodesOf(unit) {
    const out = [];
    const walk = (c) => {
      for (let n = c.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3) { if (!P.created.has(n) && LETTER.test(origOf(n))) out.push(n); }
        else if (isInlineEl(n)) walk(n);
      }
    };
    walk(unit);
    return out;
  }

  /** Safe fallback: translate each text node on its own. */
  async function translateNodes(nodes, gen) {
    if (!nodes.length) return;
    const origs = nodes.map(origOf);
    const r = await rpc(origs.map(esc), P.tl, 'html');
    if (gen !== P.gen) return;
    noteDetected(r.detected);
    nodes.forEach((n, i) => {
      if (!n.isConnected || origOf(n) !== origs[i]) return;
      setText(n, fit(origs[i], parseHTML(r.translations[i]).textContent));
    });
    P.mo && P.mo.takeRecords();
  }

  /* ================= Scheduling ================= */
  function track(u) {
    if (!u || P.unitEls.has(u) && P.pending.has(u)) return;
    P.unitEls.add(u);
    P.io.observe(u);
    // Elements without a box (display:contents) never intersect: queue them directly.
    if (!u.getClientRects().length && getComputedStyle(u).display === 'contents') { P.io.unobserve(u); queue(u); }
  }
  function trackAttrs(el) {
    if (!P.attrEls.has(el)) { P.attrEls.add(el); P.io.observe(el); }
  }
  function queue(u) { P.pending.add(u); schedule(); }
  function schedule() { if (!P.timer) P.timer = setTimeout(flush, 30); }

  function onIntersect(entries) {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      P.io.unobserve(el);
      if (P.attrEls.has(el)) { P.attrEls.delete(el); P.attrPending.add(el); }
      if (P.unitEls.has(el)) P.pending.add(el);
    }
    schedule();
  }

  async function flush() {
    P.timer = 0;
    if (!P.on) return;
    const gen = P.gen;
    if (P.attrPending.size) flushAttrs(gen);
    while (P.pending.size && P.busy < 3) {
      const batch = [];
      let chars = 0;
      for (const u of P.pending) {
        P.pending.delete(u);
        if (!u.isConnected || inSkipped(u)) continue;
        const s = serialize(u);
        if (!LETTER.test(s.html.replace(/<[^>]*>/g, ''))) continue;
        if (s.html.length > 4000) { run(gen, () => translateNodes(textNodesOf(u), gen)); continue; }
        batch.push({ u, s });
        chars += s.html.length;
        if (chars > 4000 || batch.length >= 60) break;
      }
      if (batch.length) run(gen, () => translateUnits(batch, gen));
    }
  }

  function run(gen, fn) {
    P.busy++; status();
    fn().catch(() => { if (gen === P.gen) P.err = true; })
      .finally(() => { P.busy--; if (gen === P.gen) { status(); if (P.pending.size || P.attrPending.size) schedule(); } });
  }

  async function translateUnits(batch, gen) {
    const r = await rpc(batch.map((b) => b.s.html), P.tl, 'html');
    if (gen !== P.gen) return;
    noteDetected(r.detected);
    const fallback = [];
    batch.forEach(({ u, s }, i) => {
      if (!u.isConnected) return;
      if (serialize(u).html !== s.html) { queue(u); return; } // changed while in flight
      if (!applyMarkup(u, s, r.translations[i])) fallback.push(u);
    });
    P.mo.takeRecords();
    if (fallback.length) await translateNodes(fallback.flatMap(textNodesOf), gen);
  }

  async function flushAttrs(gen) {
    const items = [];
    for (const el of P.attrPending) {
      P.attrPending.delete(el);
      if (!el.isConnected || el.closest('[translate="no"],.notranslate,[' + HOST_ATTR + ']')) continue;
      let rec = P.attrs.get(el);
      for (const a of ATTRS) {
        const v = el.getAttribute(a);
        if (v == null) continue;
        if (rec && rec[a] && v === rec[a].tr) continue;
        if (!LETTER.test(v)) continue;
        items.push({ el, a, v });
      }
      if (items.length >= 100) break;
    }
    if (!items.length) return;
    run(gen, async () => {
      const r = await rpc(items.map((x) => esc(x.v)), P.tl, 'html');
      if (gen !== P.gen) return;
      for (const [k, { el, a, v }] of items.entries()) {
        if (el.getAttribute(a) !== v) continue;
        const tr = parseHTML(r.translations[k]).textContent;
        let rec = P.attrs.get(el);
        if (!rec) P.attrs.set(el, (rec = {}));
        rec[a] = { orig: v, tr };
        el.setAttribute(a, tr);
      }
      P.mo.takeRecords();
    });
  }

  function onMutations(records) {
    if (!P.on) return;
    for (const r of records) {
      if (r.type === 'childList') {
        for (const n of r.addedNodes) {
          if (n.nodeType === 3) { if (LETTER.test(n.nodeValue) && !P.created.has(n)) track(unitFor(n)); continue; }
          if (n.nodeType !== 1 || n.hasAttribute(HOST_ATTR) || inSkipped(n)) continue;
          if (INLINE.has(n.localName)) track(unitFor(n));
          const set = new Set();
          collectUnits(n, set);
          set.forEach(track);
          if (n.matches(ATTR_SEL)) trackAttrs(n);
          n.querySelectorAll(ATTR_SEL).forEach(trackAttrs);
        }
      } else if (r.type === 'characterData') {
        const n = r.target;
        if (P.created.has(n)) continue;
        const rec = P.texts.get(n);
        if (rec && n.nodeValue === rec.tr) continue;
        if (LETTER.test(n.nodeValue)) track(unitFor(n));
      }
    }
  }

  function noteDetected(l) { if (l && !P.detected) P.detected = l; }

  async function translatePage(tl) {
    const s = await settings();
    tl = tl || s.tgt;
    if (P.on && P.tl === tl) return state();
    if (P.on) restorePage(true);
    P.on = true; P.tl = tl; P.detected = null; P.err = false; P.gen++; lastBusy = null;
    P.io = new IntersectionObserver(onIntersect, { rootMargin: '600px 200px' });
    P.mo = new MutationObserver(onMutations);
    const units = new Set();
    collectUnits(document.body || document.documentElement, units);
    units.forEach(track);
    document.querySelectorAll(ATTR_SEL).forEach(trackAttrs);
    P.mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    // Document title
    const title = document.title;
    if (title && LETTER.test(title)) {
      const gen = P.gen;
      rpc([esc(title)], tl, 'html').then((r) => {
        if (gen !== P.gen || document.title !== title) return;
        P.title = { orig: title, tr: parseHTML(r.translations[0]).textContent };
        document.title = P.title.tr;
      }).catch(() => {});
    }
    pill('progress');
    status();
    return state();
  }

  function restorePage(silent) {
    if (!P.on) return state();
    P.gen++; P.on = false;
    clearTimeout(P.timer); P.timer = 0;
    P.io.disconnect(); P.mo.disconnect();
    P.pending.clear(); P.attrPending.clear();
    for (const n of P.created) n.remove();
    for (const [c, kids] of P.orders) for (const n of kids) if (n.parentNode === c) c.appendChild(n);
    for (const [n, r] of P.texts) if (n.nodeValue === r.tr) n.nodeValue = r.orig;
    for (const [el, rec] of P.attrs) for (const a in rec) if (el.getAttribute(a) === rec[a].tr) el.setAttribute(a, rec[a].orig);
    if (P.title && document.title === P.title.tr) document.title = P.title.orig;
    P.texts.clear(); P.created.clear(); P.orders.clear(); P.attrs.clear();
    P.unitEls = new WeakSet(); P.attrEls = new WeakSet(); P.title = null;
    if (!silent) { pill(null); report(); }
    return state();
  }

  const state = () => ({ on: P.on, tl: P.tl, detected: P.detected, busy: P.busy > 0 });
  function report() { try { chrome.runtime.sendMessage({ type: 'pageState', translated: P.on, tl: P.tl }); } catch (_) {} }
  let lastBusy = null;
  function status() {
    if (!P.on) return;
    const busy = P.busy > 0;
    if (busy === lastBusy) return;
    lastBusy = busy;
    pill(busy ? 'progress' : P.err ? 'error' : 'done');
    if (!busy) report();
  }

  /* ================= UI (Shadow DOM, isolated from page CSS) ================= */
  const CSS = `
  :host{all:initial}
  *{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Ubuntu,Cantarell,"Noto Sans",sans-serif}
  .pill,.card{--bg:#fff;--fg:#1f2328;--mut:#5b636e;--line:#e3e6ea;--acc:#2563eb;--accbg:#eef3ff;color:var(--fg);background:var(--bg);
    border:1px solid var(--line);box-shadow:0 8px 28px rgba(0,0,0,.16),0 1px 3px rgba(0,0,0,.08);font-size:13px;line-height:1.45}
  @media (prefers-color-scheme:dark){.pill,.card{--bg:#202328;--fg:#e8eaed;--mut:#a3a9b2;--line:#363b43;--acc:#7aa7ff;--accbg:#273246}}
  .pill{position:fixed;right:16px;bottom:16px;z-index:2147483647;display:flex;align-items:center;gap:8px;padding:6px 6px 6px 12px;border-radius:999px;
    transition:opacity .25s,transform .25s}
  .pill.hide{opacity:0;transform:translateY(8px);pointer-events:none}
  .pill .lbl{white-space:nowrap;max-width:320px;overflow:hidden;text-overflow:ellipsis}
  button,select{font:inherit;color:inherit}
  .btn{border:0;background:var(--accbg);color:var(--acc);border-radius:999px;padding:5px 12px;cursor:pointer;font-weight:600}
  .btn:hover{filter:brightness(.96)} .btn:focus-visible,.x:focus-visible,select:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
  .x{display:inline-grid;place-items:center;border:0;background:transparent;color:var(--mut);width:28px;height:28px;border-radius:50%;cursor:pointer;padding:0;flex:none}
  .x:hover{background:var(--accbg)}
  .spin{width:14px;height:14px;border:2px solid var(--line);border-top-color:var(--acc);border-radius:50%;animation:s .8s linear infinite;flex:none}
  @keyframes s{to{transform:rotate(360deg)}}
  @media (prefers-reduced-motion:reduce){.spin{animation-duration:2.4s}.pill{transition:none}}
  .card{position:absolute;z-index:2147483647;width:min(380px,calc(100vw - 24px));border-radius:14px;padding:12px 12px 8px}
  .hd{display:flex;align-items:center;gap:6px;color:var(--mut);font-size:12px;margin-bottom:8px}
  .hd select{border:1px solid var(--line);background:var(--bg);border-radius:8px;padding:3px 6px;max-width:170px;color:var(--fg)}
  .hd .sp{flex:1}
  .out{font-size:15px;white-space:pre-wrap;word-wrap:break-word;max-height:260px;overflow:auto;min-height:22px;user-select:text}
  .out.err{color:#d93025;font-size:13px}
  .ft{display:flex;justify-content:flex-end;gap:6px;margin-top:8px}
  `;
  let root = null;
  function ui() {
    if (root && root.host.isConnected) return root;
    const host = document.createElement('div');
    host.setAttribute(HOST_ATTR, '');
    host.setAttribute('translate', 'no');
    root = host.attachShadow({ mode: 'closed' });
    const st = document.createElement('style');
    st.textContent = CSS;
    root.appendChild(st);
    document.documentElement.appendChild(host);
    return root;
  }
  const h = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const k in attrs) {
      if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
      else if (k === 'text') e.textContent = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    kids.forEach((c) => c && e.append(c));
    return e;
  };

  function xIcon() {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '16'); svg.setAttribute('height', '16'); svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', 'M6 6l12 12M18 6L6 18'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '2'); p.setAttribute('stroke-linecap', 'round');
    svg.appendChild(p);
    return svg;
  }
  let pillEl = null, pillTimer = 0;
  function pill(kind, err) {
    clearTimeout(pillTimer);
    if (!kind) { if (pillEl) pillEl.remove(); pillEl = null; return; }
    const r = ui();
    if (!pillEl || !pillEl.isConnected) {
      pillEl = h('div', { class: 'pill', role: 'status', 'aria-live': 'polite' });
      pillEl.addEventListener('mouseenter', () => { clearTimeout(pillTimer); pillEl.classList.remove('hide'); });
      pillEl.addEventListener('mouseleave', () => { if (!P.busy) autoHide(); });
      r.appendChild(pillEl);
    }
    pillEl.classList.remove('hide');
    pillEl.replaceChildren();
    if (kind === 'progress') pillEl.append(h('span', { class: 'spin', 'aria-hidden': 'true' }), h('span', { class: 'lbl', text: t('translating') }));
    else if (kind === 'error') pillEl.append(h('span', { class: 'lbl', text: t('errorGeneric') }));
    else {
      const label = P.detected && P.detected !== P.tl
        ? `${langName(P.detected)} → ${langName(P.tl)}` : t('translatedTo', [langName(P.tl)]);
      pillEl.append(h('span', { class: 'lbl', text: label }));
    }
    pillEl.append(
      h('button', { class: 'btn', type: 'button', text: t('showOriginal'), onclick: () => restorePage() }),
      h('button', { class: 'x', type: 'button', 'aria-label': t('close'), title: t('close'), onclick: () => pillEl.classList.add('hide') }, xIcon())
    );
    if (kind !== 'progress') autoHide();
  }
  function autoHide() { clearTimeout(pillTimer); pillTimer = setTimeout(() => pillEl && pillEl.classList.add('hide'), 5000); }

  /* ---------- selection card ---------- */
  let card = null, cardCleanup = null;
  function closeCard() { if (cardCleanup) cardCleanup(); if (card) card.remove(); card = null; cardCleanup = null; }

  async function showSelection(fallbackText) {
    const sel = getSelection();
    let text = (sel && sel.toString().trim()) || (fallbackText || '').trim();
    if (!text) return;
    text = text.slice(0, 5000);
    let rect = null;
    if (sel && sel.rangeCount && sel.toString().trim()) rect = sel.getRangeAt(0).getBoundingClientRect();
    if ((!rect || (!rect.width && !rect.height)) && document.activeElement && document.activeElement !== document.body) rect = document.activeElement.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) rect = { left: innerWidth / 2 - 190, right: innerWidth / 2 + 190, top: 80, bottom: 80 };

    closeCard();
    const s = await settings();
    const r = ui();
    const out = h('div', { class: 'out', 'aria-live': 'polite', dir: 'auto' });
    const src = h('span', { text: t('detectLanguage') });
    const select = h('select', { 'aria-label': t('targetLanguage') });
    for (const l of TLang.list(UILOC)) select.append(new Option(l.name, l.code, false, l.code === s.tgt));
    const copyBtn = h('button', { class: 'btn', type: 'button', text: t('copy') });
    card = h('div', { class: 'card', role: 'dialog', 'aria-label': t('extName') },
      h('div', { class: 'hd' }, src, h('span', { 'aria-hidden': 'true', text: '→' }), select, h('span', { class: 'sp' }),
        h('button', { class: 'x', type: 'button', 'aria-label': t('close'), title: t('close'), onclick: closeCard }, xIcon())),
      out,
      h('div', { class: 'ft' }, copyBtn));
    r.appendChild(card);

    // Position near the selection, inside the viewport.
    const w = card.offsetWidth, ht = card.offsetHeight || 140;
    let left = Math.min(Math.max(8, rect.left), innerWidth - w - 8);
    let top = rect.bottom + 8;
    if (top + ht > innerHeight - 8 && rect.top - ht - 8 > 0) top = rect.top - ht - 8;
    card.style.left = left + scrollX + 'px';
    card.style.top = Math.max(8, top) + scrollY + 'px';

    let result = '';
    const go = async (tl) => {
      out.className = 'out';
      out.replaceChildren(h('span', { class: 'spin', 'aria-label': t('translating') }));
      try {
        const res = await rpc([text], tl, 'text');
        result = res.translations[0];
        out.textContent = result;
        out.lang = tl;
        if (res.detected) src.textContent = langName(res.detected);
      } catch (e) {
        out.className = 'out err';
        out.textContent = t('errorGeneric');
      }
    };
    select.addEventListener('change', () => { chrome.storage.local.set({ tgt: select.value }); go(select.value); });
    copyBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(result); } catch (_) {
        const ta = document.createElement('textarea'); ta.value = result; document.documentElement.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      }
      copyBtn.textContent = t('copied');
      setTimeout(() => { copyBtn.textContent = t('copy'); }, 1200);
    });
    const onDown = (e) => { if (card && !e.composedPath().includes(r.host)) closeCard(); };
    const onKey = (e) => { if (e.key === 'Escape') closeCard(); };
    setTimeout(() => { document.addEventListener('mousedown', onDown, true); document.addEventListener('keydown', onKey, true); }, 0);
    cardCleanup = () => { document.removeEventListener('mousedown', onDown, true); document.removeEventListener('keydown', onKey, true); };
    go(s.tgt);
  }

  /* ================= Messages ================= */
  chrome.runtime.onMessage.addListener((m, _s, reply) => {
    if (!m || typeof m !== 'object') return;
    const done = (p) => { Promise.resolve(p).then(reply, () => reply(state())); return true; };
    switch (m.type) {
      case 'ping': reply(true); return;
      case 'getState': reply(state()); return;
      case 'translatePage': return done(translatePage(m.tl));
      case 'restorePage': reply(restorePage()); return;
      case 'togglePage': return done(P.on ? restorePage() : translatePage(m.tl));
      case 'showSelection': if (window.top === window || m.text) showSelection(m.text); reply(true); return;
    }
  });
})();
