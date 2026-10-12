/* Translate – shared language helpers (popup, background, content). */
(() => {
  const CODES = ['af','sq','am','ar','hy','as','ay','az','bm','eu','be','bn','bho','bs','bg','ca','ceb','ny','zh-CN','zh-TW','co','hr','cs','da','dv','doi','nl','en','eo','et','ee','tl','fi','fr','fy','gl','ka','de','el','gn','gu','ht','ha','haw','he','hi','hmn','hu','is','ig','ilo','id','ga','it','ja','jw','kn','kk','km','rw','gom','ko','kri','ku','ckb','ky','lo','la','lv','ln','lt','lg','lb','mk','mai','mg','ms','ml','mt','mi','mr','mni-Mtei','lus','mn','my','ne','no','or','om','ps','fa','pl','pt','pa','qu','ro','ru','sm','sa','gd','nso','sr','st','sn','sd','si','sk','sl','so','es','su','sw','sv','tg','ta','tt','te','th','ti','ts','tr','tk','ak','uk','ur','ug','uz','vi','cy','xh','yi','yo','zu'];
  // Codes whose display name must be resolved through a different BCP-47 tag.
  const DISPLAY_ALIAS = { jw: 'jv', tl: 'fil', 'mni-Mtei': 'mni', gom: 'kok', 'zh-CN': 'zh-Hans', 'zh-TW': 'zh-Hant', no: 'nb', iw: 'he' };
  const SET = new Set(CODES);

  /** Map any browser/BCP-47 tag (e.g. "pt-BR", "zh-HK", "nb") to a supported code. */
  function normalize(tag) {
    if (!tag) return 'en';
    const t = String(tag).replace('_', '-');
    if (SET.has(t)) return t;
    const lower = t.toLowerCase();
    if (lower.startsWith('zh')) return /(tw|hk|mo|hant)/.test(lower) ? 'zh-TW' : 'zh-CN';
    const base = lower.split('-')[0];
    const map = { nb: 'no', nn: 'no', iw: 'he', jv: 'jw', fil: 'tl', kok: 'gom', mni: 'mni-Mtei' };
    if (map[base]) return map[base];
    return SET.has(base) ? base : 'en';
  }

  let cache = null, cacheLocale = null;
  /** Sorted [{code, name}] localized in the UI language via Intl (no bundled name tables). */
  function list(uiLocale) {
    if (cache && cacheLocale === uiLocale) return cache;
    let dn = null;
    try { dn = new Intl.DisplayNames([uiLocale, 'en'], { type: 'language' }); } catch (_) {}
    const cap = (s) => s.charAt(0).toLocaleUpperCase(uiLocale) + s.slice(1);
    cache = CODES.map((code) => {
      let name = code;
      try { name = (dn && dn.of(DISPLAY_ALIAS[code] || code)) || code; } catch (_) {}
      return { code, name: cap(name) };
    }).sort((a, b) => a.name.localeCompare(b.name, uiLocale));
    cacheLocale = uiLocale;
    return cache;
  }

  function name(code, uiLocale) {
    const hit = list(uiLocale).find((l) => l.code === code);
    if (hit) return hit.name;
    try { return new Intl.DisplayNames([uiLocale], { type: 'language' }).of(code) || code; } catch (_) { return code; }
  }

  const RTL = new Set(['ar', 'he', 'iw', 'fa', 'ur', 'ps', 'sd', 'ug', 'yi', 'dv', 'ckb']);
  const isRTL = (code) => RTL.has(String(code).split('-')[0]);

  globalThis.TLang = { CODES, normalize, list, name, isRTL };
})();
