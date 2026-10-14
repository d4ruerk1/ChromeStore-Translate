/* Translate – options: choose the translation service (all official APIs). */
(() => {
  'use strict';
  const S = {
    it: {
      title: 'Translate – servizio di traduzione',
      lead: 'Scegli a chi inviare il testo da tradurre. Lo sviluppatore non ha server e non riceve nulla.',
      service: 'Servizio', mmDesc: 'Gratuito, senza chiave (Translated S.r.l., Italia). Limite giornaliero e frasi brevi (max 500 byte): adatto a selezioni e popup, non a pagine intere.',
      mmEmail: 'Email facoltativa (MyMemory alza il limite giornaliero se la fornisci)',
      gDesc: 'API ufficiale di Google con la tua chiave (fatturazione Google Cloud, quota gratuita mensile). Ideale per pagine intere.',
      dDesc: 'API ufficiale DeepL con la tua chiave (Free o Pro). Meno lingue, ottima qualità.',
     
      apiKey: 'Chiave API',
      keysLocal: 'Le chiavi restano solo in questo browser (chrome.storage.local), non vengono sincronizzate né inviate ad altri che al servizio scelto.',
      save: 'Salva', saved: 'Salvato', needKey: 'Inserisci la chiave per il servizio scelto.',
      privacy: 'Informativa privacy',
      r_config: 'Il servizio scelto non è configurato: completa i dati qui sotto.', r_badKey: 'La chiave API è stata rifiutata dal servizio.', r_quota: 'Hai raggiunto il limite del servizio. Riprova più tardi o scegli un altro servizio.', r_tooLong: 'MyMemory traduce solo testi brevi: per le pagine intere scegli Google Cloud o DeepL.'
    },
    en: {
      title: 'Translate – translation service',
      lead: 'Choose who receives the text you translate. The developer runs no server and receives nothing.',
      service: 'Service', mmDesc: 'Free, no key (Translated S.r.l., Italy). Daily limit and short text only (max 500 bytes): fine for selections and the popup, not for whole pages.',
      mmEmail: 'Optional email (MyMemory raises the daily limit if you provide it)',
      gDesc: 'Google\'s official API with your own key (Google Cloud billing, monthly free quota). Best for whole pages.',
      dDesc: 'DeepL\'s official API with your own key (Free or Pro). Fewer languages, great quality.',
     
      apiKey: 'API key',
      keysLocal: 'Keys stay in this browser only (chrome.storage.local); they are not synced or sent to anyone but the chosen service.',
      save: 'Save', saved: 'Saved', needKey: 'Enter the key for the chosen service.',
      privacy: 'Privacy policy',
      r_config: 'The chosen service is not configured: complete the details below.', r_badKey: 'The API key was rejected by the service.', r_quota: 'You reached the service limit. Try later or choose another service.', r_tooLong: 'MyMemory only translates short text: for whole pages choose Google Cloud or DeepL.'
    },
    es: {
      title: 'Translate – servicio de traducción', lead: 'Elige a quién se envía el texto que traduces. El desarrollador no tiene servidores y no recibe nada.',
      service: 'Servicio', mmDesc: 'Gratis, sin clave (Translated S.r.l., Italia). Límite diario y textos cortos (máx. 500 bytes).', mmEmail: 'Correo opcional (MyMemory amplía el límite diario)',
      gDesc: 'API oficial de Google con tu clave (facturación de Google Cloud, cuota gratuita mensual).', dDesc: 'API oficial de DeepL con tu clave (Free o Pro).',
      apiKey: 'Clave API', apiKeyOpt: 'Clave API (si se requiere)',
      keysLocal: 'Las claves se quedan solo en este navegador (chrome.storage.local).', save: 'Guardar', saved: 'Guardado', needKey: 'Introduce la clave del servicio elegido.', privacy: 'Política de privacidad',
      r_config: 'El servicio elegido no está configurado.', r_badKey: 'El servicio rechazó la clave API.', r_quota: 'Has alcanzado el límite del servicio.', r_tooLong: 'MyMemory solo traduce textos cortos: para páginas completas elige otro servicio.'
    },
    fr: {
      title: 'Translate – service de traduction', lead: 'Choisissez à qui le texte à traduire est envoyé. Le développeur n\'a aucun serveur et ne reçoit rien.',
      service: 'Service', mmDesc: 'Gratuit, sans clé (Translated S.r.l., Italie). Limite quotidienne et textes courts (500 octets max).', mmEmail: 'E-mail facultatif (MyMemory augmente la limite quotidienne)',
      gDesc: 'API officielle de Google avec votre clé (facturation Google Cloud, quota gratuit mensuel).', dDesc: 'API officielle de DeepL avec votre clé (Free ou Pro).',
      apiKey: 'Clé API', apiKeyOpt: 'Clé API (si nécessaire)', ltUrl: 'Adresse de l\'instance',
      keysLocal: 'Les clés restent uniquement dans ce navigateur (chrome.storage.local).', save: 'Enregistrer', saved: 'Enregistré', needKey: 'Saisissez la clé du service choisi.', privacy: 'Politique de confidentialité',
      r_config: 'Le service choisi n\'est pas configuré.', r_badKey: 'La clé API a été refusée.', r_quota: 'Limite du service atteinte.', r_tooLong: 'MyMemory ne traduit que des textes courts : pour des pages entières, choisissez un autre service.'
    },
    de: {
      title: 'Translate – Übersetzungsdienst', lead: 'Wähle, wer den zu übersetzenden Text erhält. Der Entwickler betreibt keine Server und erhält nichts.',
      service: 'Dienst', mmDesc: 'Kostenlos, ohne Schlüssel (Translated S.r.l., Italien). Tageslimit und nur kurze Texte (max. 500 Byte).', mmEmail: 'Optionale E-Mail (MyMemory erhöht das Tageslimit)',
      gDesc: 'Offizielle Google-API mit eigenem Schlüssel (Google-Cloud-Abrechnung, monatliches Freikontingent).', dDesc: 'Offizielle DeepL-API mit eigenem Schlüssel (Free oder Pro).',
      apiKey: 'API-Schlüssel', apiKeyOpt: 'API-Schlüssel (falls nötig)',
      keysLocal: 'Schlüssel bleiben nur in diesem Browser (chrome.storage.local).', save: 'Speichern', saved: 'Gespeichert', needKey: 'Gib den Schlüssel für den gewählten Dienst ein.', privacy: 'Datenschutzerklärung',
      r_config: 'Der gewählte Dienst ist nicht eingerichtet.', r_badKey: 'Der API-Schlüssel wurde abgelehnt.', r_quota: 'Limit des Dienstes erreicht.', r_tooLong: 'MyMemory übersetzt nur kurze Texte: für ganze Seiten einen anderen Dienst wählen.'
    },
    pt: {
      title: 'Translate – serviço de tradução', lead: 'Escolha para quem o texto a traduzir é enviado. O desenvolvedor não tem servidores e não recebe nada.',
      service: 'Serviço', mmDesc: 'Grátis, sem chave (Translated S.r.l., Itália). Limite diário e textos curtos (máx. 500 bytes).', mmEmail: 'E-mail opcional (o MyMemory aumenta o limite diário)',
      gDesc: 'API oficial do Google com sua chave (faturamento Google Cloud, cota gratuita mensal).', dDesc: 'API oficial do DeepL com sua chave (Free ou Pro).',
      apiKey: 'Chave de API', apiKeyOpt: 'Chave de API (se exigida)',
      keysLocal: 'As chaves ficam só neste navegador (chrome.storage.local).', save: 'Salvar', saved: 'Salvo', needKey: 'Informe a chave do serviço escolhido.', privacy: 'Política de privacidade',
      r_config: 'O serviço escolhido não está configurado.', r_badKey: 'A chave de API foi recusada.', r_quota: 'Limite do serviço atingido.', r_tooLong: 'O MyMemory só traduz textos curtos: para páginas inteiras escolha outro serviço.'
    }
  };
  const loc = (chrome.i18n.getUILanguage() || 'en').toLowerCase().split('-')[0];
  const L = S[loc] || S.en;
  const tr = (k) => L[k] || S.en[k] || k;
  document.documentElement.lang = loc;
  document.querySelectorAll('[data-t]').forEach((e) => { e.textContent = tr(e.dataset.t); });

  const $ = (id) => document.getElementById(id);
  const form = $('form');
  const DEF = { engine: 'mymemory', gKey: '', dKey: '', ltKey: '', mmEmail: '' };

  const reason = new URLSearchParams(location.search).get('reason');
  if (reason && L['r_' + reason]) { $('banner').textContent = tr('r_' + reason); $('banner').hidden = false; }

  function showFields() {
    const v = form.engine.value;
    document.querySelectorAll('.fields').forEach((f) => { f.hidden = f.dataset.for !== v; });
  }
  form.addEventListener('change', (e) => { if (e.target.name === 'engine') showFields(); });

  chrome.storage.local.get(DEF).then((s) => {
    form.engine.value = ['mymemory', 'google', 'deepl'].includes(s.engine) ? s.engine : 'mymemory';
    for (const k of ['gKey', 'dKey', 'mmEmail']) $(k).value = s[k] || '';
    showFields();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const st = $('status');
    const v = {
      engine: form.engine.value || 'mymemory',
      gKey: $('gKey').value.trim(), dKey: $('dKey').value.trim(),
      mmEmail: $('mmEmail').value.trim()
    };
    if ((v.engine === 'google' && !v.gKey) || (v.engine === 'deepl' && !v.dKey)) { st.textContent = tr('needKey'); return; }
    await chrome.storage.local.set(v);
    await chrome.storage.session.set({ nudged: false }).catch(() => {});
    $('banner').hidden = true;
    st.textContent = tr('saved');
  });
})();
