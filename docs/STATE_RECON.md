# STATE_RECON — Fase 0 (ricognizione obbligatoria)

> Stato del repository al branch `feat/emergent-state`, misurato il 2026-11-14.
> Fonti: codice letto integralmente, `npm test` (40 test verdi), `npm run build`
> (bundle in `dist/`, copia del build del commit `777d411`).
> Questo documento risponde ai 5 punti del brief e chiude le sezioni aperte
> prima di ogni modifica.

---

## 1 · Com'è costruita oggi la mappa

- **Libreria**: Leaflet 1.9 (`package.json` → `leaflet`, `@types/leaflet`),
  CSS globale `leaflet/dist/leaflet.css` importato in cima a
  `src/assist-urban/UrbanStorytelling.tsx:3`.
- **Inizializzazione**: `src/assist-urban/UrbanStorytelling.tsx:360-372`.
  Mappa creata su un `<div ref={mapDiv}>` (`:950`), centro/zoom dalla DZ attiva
  (`:362`), un solo `L.tileLayer` OSM (`:363-366`), un `L.layerGroup` per i pin
  (`storyLayer`, `:367`). Nessun pane personalizzato, nessun canvas overlay.
- **Sorgente dati**: `GET /api/story?dz=<id>` (`:411-431`). Il server
  (`netlify/functions/story.ts:43-62`) elenca Netlify Blobs con prefisso
  `dz:<dz>:` (`netlify/functions/lib/stories.ts:19-27`) e restituisce i record
  più recenti (max 48 per DZ, `lib/stories.ts:10`). Solo il record già
  sanificato è persistito (`story.ts:112-121` + `src/assist-urban/story.ts:115-127`).
- **Layer**: un solo layer di marker, ricostruito a ogni cambio di
  `zoneStories` (`:433-444`). Nessun layer di relazioni, nessun layer
  additivo, nessuna aggregazione spaziale.
- **Conseguenza per il brief**: il fabric additivo non esiste e può essere
  aggiunto in un pane dedicato senza toccare tile, pin o wall.

## 2 · Esiste già un filtro o una ricerca?

- **Solo filtro di DZ**, non di contenuto: `zoneStories` tiene le storie con
  `story.dz === zone.id` (`UrbanStorytelling.tsx:404-407`); mappa (`:433-444`)
  e wall (`:1052-1078`) mostrano esclusivamente quelle. Il selettore DZ è
  `:764-778`; pilot mode `:779-816`.
- **Nessuna ricerca testuale**: non esiste un input di ricerca né una chiave
  i18n dedicata (`src/assist-urban/i18n.tsx`, 234 righe: nessun `search`).
  Nessun tema selezionabile, nessun calendario, nessuna query in URL.
- **Nessuno stato emergente**: il client filtra in modo distruttivo per DZ
  (`:404-407`) e non esiste alcun concetto di rilevanza, peso o contesto
  attenuato. Non esiste `/api/state` (`netlify/functions/` contiene solo
  story, zones, cities, media, media-upload, transcribe).
- **URL**: l'app non legge `location.search`; non c'è round-trip di stato.

## 3 · Come sono rappresentate oggi le icone

- **`L.circleMarker` nativo Leaflet**, creato inline in
  `UrbanStorytelling.tsx:437-443`; non esiste un componente icona.
- Raggio `8 + min(media.length, 4)` px, bordo bianco 2 px, riempimento
  semitrasparente 0.85 (`:439-441`).
- Colore dal primo media via `ARC_COLORS` (`:26-29`): photo/image
  `#4fb5ae`, video `#c46bff`, audio `#e1a33d`, text `#7c9dff`; fallback
  `#e66c52`.
- Posizione: `storyPoint` estrae lat/lon dalla cella anonima `gr_r8_*`
  (`:70-76`); se la storia non è georeferenziata usa il centro della DZ.
- Click sul pin → `setSelected(story.id)` (`:442`); il wall evidenzia la riga
  (`:1054`). Nessun tooltip, nessuna etichetta, nessuna ispezione di archi.

## 4 · Quali campi della storia sono realmente popolati

Interfaccia `PublishedStory` (`src/assist-urban/story.ts:36-49`); record
costruito in `publishStory` (`:115-127`):

| Campo | Reale | Note |
| :--- | :--- | :--- |
| `id` | sì | `st_` + 16 hex (`story.ts:104`) |
| `author_pseudonym` | sì | HMAC giornaliero (`pipeline/pii.ts:52-55`) |
| `text` | sì | sanificato, max 4000 char (`story.ts:56,69`) |
| `text_hash` | sì | HMAC troncato (`pipeline/pii.ts:57-59`) |
| `lang` | sì | solo `it/en/fr`, default `it` (`story.ts:106`) |
| `ts` | sì | ISO string del client (`story.ts:105`) |
| `geo` | **spesso sì, ma anonimo** | cella `gr_r<res>_<lat>_<lon>` ris. 8 ≈ 0.005° (`pipeline/pii.ts:61-69`); `null` con consenso "none" (`story.ts:109-113`) |
| `dz` | sì | id validato `^[a-z0-9][a-z0-9_-]{1,63}$` (`story.ts:107`) |
| `comparative` | sì | boolean (`story.ts:97`) |
| `media` | sì (opzionale) | `{id, kind, size, timeline?, caption?}`, max 12 (`story.ts:71-93`) |
| `scrubbed_terms` | sì | contatore PII (`story.ts:126`) |

**Campi assenti** (rilevanti per il brief): nessun `title`, nessun `tags`,
nessuna `category`, nessun `themeId`, nessun embedding, nessuna entità
estratta a runtime. Non esiste un testo trascritto dall'audio: l'endpoint
`transcribe.mts` è separato e non persiste nulla nel record.

**Conseguenza**: la rilevanza per tema/testo deve partire da `text` (unico
testo scritto persistito) + `media[].caption`/`timeline` (testo scritto
facoltativo) + entità estratte deterministicamente dal testo. Il brief chiede
"fallback lessicale + entità" quando mancano gli embedding: è l'unica strada
percorribile oggi, e va dichiarata in `resolvedFilter`.

## 5 · Peso bundle e tempi di caricamento attuali

Misura sul build del commit base (`dist/`, 2026-11-14):

- `dist` totale: **448 KB**.
- JS: `index-Dftilo6w.js` = **417.822 B** → **127.192 B gzip**.
- CSS: `index-CrVMSmxP.css` = **28.816 B**.
- Font: Google Fonts esterni (`index.html:7-9`), non inclusi nel bundle.
- Leaflet è la dipendenza pesante; React 19 e il codice app sono compilati in
  un unico chunk (`vite.config.ts`, `chunkSizeWarningLimit: 1000`).

Non esiste una misura Lighthouse/3G registrata nel repo. Per il criterio
"3G simulato < 8 s" il budget utile è: mantenere il JS gzip sotto ~200 KB e
non aggiungere dipendenze npm (il fabric sarà canvas + Leaflet già presente,
pack/calendario/state saranno dati e codice puro). Il primo caricamento non è
misurabile in CI senza browser; la verifica 3G resta manuale (vedi §7).

---

## 6 · Decisioni sulle sezioni aperte `[CONFERMARE]`

Il brief non contiene marcatori letterali `[CONFERMARE]`; le questioni aperte
sono le cinque "Aree da portare al team" (brief, righe 352-361) più la
verifica del dataset. Decisioni **provvisorie**, dichiarate come tali e
riportate al committente nel risultato finale.

1. **Temi di Scicli/Beirut.** Elenco dichiarato **nei pack** (dati), non
   dedotto. I pack `scicli_demo` e `beirut_demo` partono dal template del brief
   (mobilità, accessibilità, sicurezza percepita, commercio, cultura, servizi
   pubblici, memoria, acqua, lavoro). Restano un'ipotesi da validare con chi
   conosce i territori; cambiarli = modificare il JSON del pack, non il codice.
2. **Ricerca nei media.** Si cerca nel **testo scritto**: `text` della storia
   più `media[].caption` e `media[].timeline` (sono testo scritto del
   cittadino). **Non** si cercano le trascrizioni audio: la trascrizione è un
   servizio opzionale (`transcribe.mts`) e non è persistita; includerla
   richiederebbe un consenso e una pipeline dedicati. Decisione dichiarata in
   `resolvedFilter.notes` e nella UI.
3. **Eventi nazionali.** Inclusi **solo se il pack lo dichiara**
   (`includeNational: true`), con nota esplicita sull'incertezza. Il pack
   Beirut li include; gli altri no. Nessuna lista globale nascosta.
4. **Chi aggiorna le istanze annuali.** Oggi: il PM, tramite pack (istanze per
   anno con `status` e `source`), persistite lato server. Un curatore o un
   servizio esterno potranno alimentare lo stesso modello senza codice. Le
   istanze non ancora confermate restano `tbd` finché una fonte non le dichiara.
5. **Override PM locali o server.** Entrambi, con precedenza dichiarata: il PM
   modifica in locale (localStorage) e può **salvare il pack lato server**
   (`/api/packs`, con edit token come le DZ) per ottenere un URL condivisibile
   e riproducibile. Un pack solo locale viene inviato al server con la query
   (POST `/api/state`) e **non** è riproducibile da altri finché non viene
   salvato: la UI lo dichiara. Scelta: server-side per la condivisione,
   locale per la sperimentazione. `?pm=1` è un flag di modalità, **non**
   autenticazione: la limitazione è dichiarata come area aperta (come già per
   la scrittura delle DZ pilot, `netlify/functions/zones.ts:70-107`).

### Altre decisioni tecniche necessarie

- **Nessun embedding disponibile**: la ricerca usa fallback lessicale
  (token, entità capitalizzate, IDF) e lo dichiara (`matchMode:
  'lexical+entities'`). Il tipo `semantic` delle metarelazioni è presente ma
  **non attivo** finché non esiste un precalcolo di embedding lato server.
- **Nessun LLM**: tutte le stringhe di `explanation` sono template con
  parametri (conteggi, nomi dal pack, regole del calendario).
- **Storie non georeferenziate**: restano nel corpus e nel fabric come nodi
  "no-geo" aggregati sul centro DZ attenuato; non generano archi `proximity`
  (nessuna distanza inventata), ma possono generare `cooccurrence`, `topic`,
  `author_community`.
- **Celle**: `geometry` derivata dal centro della cella `gr_*`, già pubblica;
  nessuna coordinata esatta nuova.

---

## 7 · Cosa manca e va costruito (mappa del lavoro)

| Area | Oggi | Da fare |
| :--- | :--- | :--- |
| Stato emergente | assente | `src/core/state/` puro + `/api/state` (Blobs) |
| Ricerca | assente | tema AND testo AND evento, chip, URL, fallback lessicale |
| Calendario | assente | template+istanze, fonte/confidenza/stato, `tbd` |
| Metarelazioni | assente | archi server-side + toggle + ispezione template |
| Fabric | assente | canvas additivo in pane, `filaments`/`field`, 0–100% |
| Pack | assente | JSON validato, seed, derivazione da DZ pilot, export/import |
| Robustezza | assente | bozza persistente, coda chunk, cache stato, versione, telemetria |
| Genericità | pipeline già agnostica per DZ (test esistenti) | test `testville` + divieto hardcode nei percorsi generici |

**Criterio 3G non verificabile in CI**: resta una verifica manuale con
DevTools; il codice aggiunto non introduce dipendenze e non duplica Leaflet.

---

## 8 · Addendum dopo l'implementazione (2026-11-14)

Misure aggiornate sullo stesso branch:

- `npm test`: **83 test, 19 file**, tutti verdi (era 40/8).
- `npm run build`: JS **≈490,4 KB** → **≈149,4 KB gzip**; CSS **34,0 KB** → **10,1 KB gzip**.
  Nessuna dipendenza npm aggiunta: il fabric è canvas + Leaflet già presente; stato, pack e
  calendario sono codice puro e dati.
- Nuove funzioni Netlify: `/api/state`, `/api/packs`, `/api/telemetry`; `/api/media-upload`
  accetta `GET ?session=<id>` per la ripresa dei chunk.
- Dati: `src/core/packs/seeds.ts` (`scicli_demo`, `beirut_demo`, `napoli_est_demo`),
  `src/core/calendar/seeds.ts` (Scicli, Beirut, nazionale), `src/core/packs/defaults.ts`
  (temi template + fabric di default). Aggiungere un territorio = nuovo pack/JSON, non codice.

### Limiti dichiarati, da portare al team

1. **`author_community`**: il record pubblico ha un `author_pseudonym` per *storia*
   (`story.ts:117`, seme = id della storia), quindi due storie dello stesso autore non
   condividono il pseudonimo finché il composer non invia un `note_id`. La relazione è
   presente nel modello ma resta `available: false` quando non ci sono pseudonimi
   ricorrenti: non viene inventata.
2. **Offline**: lo stato **e il muro** dell'ultima DZ sono in cache (localStorage) e le
   tile già caricate restano nella cache HTTP del browser; **non** c'è un service worker.
   “Mappa già caricata” è coperto (pin, wall, fabric, spiegazione), un avvio a freddo
   completamente offline no. Le palette dei pack sono limitate ai colori dei preset sicuri
   (deuteranopia/protanopia, max 7), così “niente arcobaleno” è verificabile all'import.
3. **Calendario**: le fonti sono quelle indicate nel brief (domini dichiarati) e
   `retrievedAt` è la data di composizione del dataset (2026-11-14); nessuna edizione 2026
   è stata verificata esternamente. Per questo nessun evento è `confirmed`: si usa
   `expected` per le regole stabili e `tbd` per le edizioni incerte. Le “finestre” dei mesi
   (es. estate) sono dichiarate come periodo, non come giorno d'evento.
4. **Creazione eventi del PM**: avviene importando un pack JSON con `eventTemplates`
   (fonte, confidenza, regola). È data-only e senza deploy, ma non esiste ancora un form
   dedicato: è un'area di prodotto, non un blocco tecnico.
5. **`?pm=1` non è autenticazione**: è un flag di modalità, come la scrittura delle zone
   pilot. La UI non espone pack/palette ai non-PM, ma l'API `/api/packs` accetta scritture
   con token di modifica. Da decidere lato committente se serva un controllo di accesso.
6. **3G < 8 s**: non misurato in CI (nessun browser/Throttling lì). Il budget è stato
   rispettato senza nuove dipendenze; la verifica resta manuale con DevTools.
7. **Temi**: l'elenco del brief è usato come template nei pack `scicli_demo`/`beirut_demo`;
   resta un'ipotesi da validare con chi conosce i territori (basta cambiare il JSON).
