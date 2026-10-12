# Translate – estensione per Brave / Chrome / Edge (Chromium)

Traduce testo selezionato (tasto destro → **Traduci «…»**) e intere pagine **sul posto**, senza ricaricare né proxare il sito: il DOM originale resta intatto (stessi elementi, link, eventi), si traduce solo il testo. Funziona su Linux, Windows, macOS e ChromeOS.

## Installazione (modalità sviluppatore)
1. Estrai lo zip.
2. Apri `brave://extensions` (o `chrome://extensions`).
3. Attiva **Modalità sviluppatore** → **Carica estensione non pacchettizzata** → seleziona la cartella `translate-ext`.
4. Fissa l'icona nella barra.

## Uso
- **Popup** (clic sull'icona o `Alt+Shift+Y`): due riquadri, sinistra = lingua di partenza (default *Rileva lingua* o ultima usata), destra = lingua di arrivo (lingua del browser o ultima usata). Traduzione mentre scrivi, inverti lingue, copia, *Traduci pagina*.
- **Selezione**: seleziona testo → tasto destro → *Traduci «…»* → scheda accanto al testo con la lingua modificabile.
- **Pagina intera**: tasto destro → *Translate → Traduci pagina* / *Mostra originale*, oppure `Alt+Shift+U`.
- Scorciatoie modificabili in `brave://extensions/shortcuts`.

## Come funziona la traduzione della pagina
- Ogni blocco (paragrafo, voce di elenco, cella…) viene inviato con i tag inline come segnaposto, così la frase resta coerente e link/grassetti restano al loro posto.
- Riusa i nodi originali (nessun elemento ricreato) → compatibile con React/Vue/SPA; “Mostra originale” ripristina tutto esattamente.
- Traduzione *lazy*: prima ciò che è visibile, poi il resto mentre scorri; i contenuti caricati dinamicamente vengono tradotti in automatico.
- Rispetta `translate="no"`, `.notranslate`, `code`, `pre`, campi modificabili.
- Cache in memoria, richieste raggruppate (≤4.500 caratteri), massimo 4 in parallelo, retry automatico.

## Servizio di traduzione
Gratuito, senza chiave e senza registrazione: endpoint pubblico di Google Translate (`translate.googleapis.com`), con fallback MyMemory per testi brevi. Nota: è un endpoint non ufficiale, senza SLA.

## Privacy e conformità (UE / Italia / Chrome Web Store)
- Permessi minimi: `activeTab`, `scripting`, `contextMenus`, `storage` + i due endpoint di traduzione. Nessun accesso permanente ai siti, nessun content script su tutte le pagine.
- Nessun dato raccolto, nessun analytics, cookie o tracciamento; preferenze solo in locale; bozza del popup solo per la sessione.
- Informativa GDPR/Codice Privacy in `privacy.html` (IT/EN) e avviso alla prima apertura.
- Accessibilità (WCAG 2.1 AA / Legge Stanca / European Accessibility Act): navigazione da tastiera, etichette ARIA, focus visibile, tema chiaro/scuro automatico, `prefers-reduced-motion`, supporto lingue RTL.
- Interfaccia localizzata automaticamente (IT, EN, ES, FR, DE, PT-BR); i nomi delle 130+ lingue sono generati con `Intl.DisplayNames` nella lingua del browser.
