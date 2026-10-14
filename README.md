# Translate – estensione per Brave / Chrome / Edge (Chromium)

Traduce testo selezionato (tasto destro → **Traduci «…»**) e intere pagine **sul posto**, senza ricaricare né proxare il sito: il DOM originale resta intatto (stessi elementi, link, eventi), si traduce solo il testo. Funziona su Linux, Windows, macOS e ChromeOS.

> Progetto indipendente, non affiliato a Google, Brave, Microsoft, Translated o DeepL. "Chrome" nel nome del repository indica solo lo store di destinazione (Chrome Web Store).

## Installazione (modalità sviluppatore)
1. Estrai lo zip.
2. Apri `brave://extensions` (o `chrome://extensions`).
3. Attiva **Modalità sviluppatore** → **Carica estensione non pacchettizzata** → seleziona la cartella estratta (quella che contiene `manifest.json`).
4. Alla prima installazione si apre la pagina **Opzioni**: scegli il servizio di traduzione.
5. Fissa l'icona nella barra.

## Uso
- **Popup** (clic sull'icona o `Alt+Shift+Y`): due riquadri, sinistra = lingua di partenza (default *Rileva lingua* o ultima usata), destra = lingua di arrivo (lingua del browser o ultima usata). Traduzione mentre scrivi, inverti lingue, copia, *Traduci pagina*.
- **Selezione**: seleziona testo → tasto destro → *Traduci «…»* → scheda accanto al testo con la lingua modificabile.
- **Pagina intera**: tasto destro → *Translate → Traduci pagina* / *Mostra originale*, oppure `Alt+Shift+U`.
- **Opzioni**: tasto destro sull'icona → *Opzioni*.
- Scorciatoie modificabili in `brave://extensions/shortcuts`.

## Come funziona la traduzione della pagina
- Ogni blocco (paragrafo, voce di elenco, cella…) viene inviato con i tag inline come segnaposto, così la frase resta coerente e link/grassetti restano al loro posto.
- Riusa i nodi originali (nessun elemento ricreato) → compatibile con React/Vue/SPA; "Mostra originale" ripristina tutto esattamente.
- Traduzione *lazy*: prima ciò che è visibile, poi il resto mentre scorri; i contenuti caricati dinamicamente vengono tradotti in automatico.
- Rispetta `translate="no"`, `.notranslate`, `code`, `pre`, campi modificabili.
- Cache solo in memoria, richieste raggruppate secondo i limiti di ogni servizio, retry automatico.

## Servizi di traduzione (solo API ufficiali)
Dalla v1.1.0 l'endpoint **non ufficiale** `translate.googleapis.com/translate_a` (client `gtx`) è stato **rimosso**: usarlo violava i termini di servizio di Google. Ora scegli tu il servizio nelle Opzioni:

| Servizio | Chiave | Note |
|---|---|---|
| **MyMemory** (predefinito) | no | API pubblica di Translated S.r.l. (Italia). Gratuita con limite giornaliero (più alto se indichi un'email) e testi fino a 500 byte: ottima per selezioni e popup, **non per pagine intere**. |
| **Google Cloud Translation API** | sì, tua | API ufficiale, quota gratuita mensile secondo il listino Google Cloud. Consigliata per le pagine intere. Limita la chiave alla sola "Cloud Translation API". |
| **DeepL API** (Free/Pro) | sì, tua | API ufficiale. Le chiavi Free finiscono con `:fx`. Meno lingue supportate. |

Le chiavi restano in `chrome.storage.local` (mai sincronizzate) e vengono inviate solo al servizio corrispondente.

## Privacy e conformità (UE / Italia / Chrome Web Store)
- **Dati trattati**: il testo che scegli di tradurre va al servizio scelto e a nessun altro. Lo sviluppatore non ha server e non riceve nulla. Nessun analytics, cookie o tracciamento. Dettagli in `privacy.html` (IT/EN) e avviso alla prima apertura del popup.
- **Permessi**: `activeTab`, `scripting`, `contextMenus`, `storage` + gli endpoint HTTPS ufficiali dei tre servizi. Non sono richiesti permessi host generici o opzionali. Nessun content script permanente su tutte le pagine.
- **GDPR / Codice Privacy**: il testo viene inviato solo su tua richiesta esplicita; il ruolo GDPR dello sviluppatore e dei fornitori dipende dal servizio scelto, dai termini applicabili e dall'uso concreto, come spiegato in `privacy.html`.
- **Accessibilità**: navigazione da tastiera, etichette ARIA, focus visibile, tema chiaro/scuro automatico, `prefers-reduced-motion`, supporto lingue RTL. Riferimento: WCAG 2.1 AA (la Legge Stanca e l'European Accessibility Act non si applicano direttamente a un'estensione gratuita di un privato: sono usati come buona pratica).
- Interfaccia localizzata automaticamente (IT, EN, ES, FR, DE, PT-BR); i nomi delle 130+ lingue sono generati con `Intl.DisplayNames` nella lingua del browser.

## Pubblicazione sul Chrome Web Store
- **Scheda Privacy**: dichiara i tipi di dati *"Contenuti del sito web"* (testo inviato per la traduzione) e *"Informazioni personali"* (email facoltativa inviata a MyMemory per alzare il limite giornaliero), spunta le tre certificazioni (nessuna vendita, nessun uso estraneo allo scopo, nessun uso per credito) e indica come URL dell'informativa la versione pubblica di `privacy.html`.
- **Giustificazioni permessi**: `activeTab`/`scripting` = tradurre la scheda corrente dopo un'azione dell'utente; `contextMenus` = voce del menu; `storage` = preferenze; host = endpoint ufficiali dei servizi di traduzione; nessun host facoltativo o generico.
- **Digital Services Act (UE)**: se distribuisci l'estensione gratis e senza attività commerciale dichiarati **non trader**; i dati di contatto pubblici (nome, indirizzo, telefono) servono solo se sei un *trader*.

## Licenza
MIT, vedi `LICENSE`. Il software è fornito "così com'è", senza garanzie.
