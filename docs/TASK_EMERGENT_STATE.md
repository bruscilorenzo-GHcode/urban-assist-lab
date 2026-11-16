# TASK: Stato emergente della mappa, calendario eventi e fabric additivo

> Contratto di lavoro per l'agente. Leggere integralmente prima di toccare il codice.
> Fonte: committente (novembre 2026). Le sezioni `[CONFERMARE]` vanno risolte in Fase 0.

## Obiettivo

Trasformare Assist Urban da mappa che mostra storie a mappa il cui stato
**EMERGE** da una domanda. Tre ingressi producono lo stato:

- a) un **TEMA** selezionato
- b) una **RICERCA TESTUALE** libera
- c) un **EVENTO** scelto dal calendario ricorrente locale/nazionale

Lo stato risultante è reso leggibile da un fabric **ADDITIVO** sovrapposto alla
mappa, non da una sostituzione della mappa.

Le metarelazioni fra storie sono esplorabili a partire dallo stato.

Il fabric deve essere progettato e sempre più customizzabile dai project
manager, senza toccare il codice.

---

## Fase 0 — Ricognizione (obbligatoria)

`docs/STATE_RECON.md` con:

1. Come è oggi costruita la mappa: libreria, layer, sorgente dati.
2. Esiste già un filtro o una ricerca? Che forma ha?
3. Come sono rappresentate oggi le icone e con quale componente.
4. Quali campi della storia sono realmente popolati.
5. Peso bundle e tempi di caricamento attuali.

Risolvi qui ogni `[CONFERMARE]`. Non procedere senza.

---

## Fase 1 — Il modello dello stato emergente

Implementa un modulo `src/core/state/` che, dato un `Query`, restituisce uno
`State`. Un solo modello, tre sorgenti di query.

```ts
type Query =
  | { kind: 'theme';   themeId: string }
  | { kind: 'search';  text: string }
  | { kind: 'event';   eventId: string; year?: number }
  | { kind: 'free';    text?: string; themeId?: string; eventId?: string };

type State = {
  query: Query;
  resolvedFilter: {            // perché quelle storie e non altre
    places?: string[];
    categories?: string[];
    timeWindow?: { from: string; to: string };
    textMatch?: string;
    radiusM?: number;
  };
  stories: FabricNode[];       // con peso di rilevanza, non solo match
  fabric: FabricSnapshot;      // densità, archi, zone, indicatori
  explanation: string;         // da template: perché questo stato
  coverage: {
    matched: number;
    total: number;
    sparse: boolean;           // true se < soglia: dichiararlo, non nasconderlo
  };
};
```

Regole:

- Il corpus **NON** viene filtrato in modo distruttivo: si calcola un peso di
  rilevanza per ogni storia e si tiene tutto. Il fabric mostra le rilevanti
  in primo piano e le altre in secondo piano attenuato. Il contesto non
  sparisce mai: una mappa che mostra solo ciò che ho cercato mente.
- `explanation` è generata da template string, **mai** da modello linguistico.
- Ogni cambiamento di `Query` ricalcola lo `State` **lato server**; il client
  riceve lo `State` già pronto. Nessun calcolo di rilevanza semantica nel browser.

---

## Fase 2 — Ricerca: tema, testo libero, combinazione

1. **Temi**: elenco dichiarato in configurazione, non dedotto. Per Scicli e
   Beirut partire da: mobilità, accessibilità, sicurezza percepita, commercio,
   cultura, servizi pubblici, memoria, acqua, lavoro.
2. **Ricerca testuale libera**: campo sempre visibile. Deve funzionare anche
   senza embedding: fallback su match lessicale + entità estratte. Con
   embedding disponibili, similarità semantica con soglia.
3. **Combinazione**: tema AND testo AND evento devono comporre, non
   sovrascriversi. Mostra i termini attivi come chip rimovibili.
4. **Ricerca vuota = stato ordinario**: nessun filtro attivo, la mappa mostra
   tutto. Mai una schermata vuota.
5. **Ricerca senza risultati**: stato esplicito "nessuna storia su questo
   tema in quest'area" con suggerimento dei temi vicini. Il buco è un dato.
6. Salva la query in URL: `?theme=..&q=..&event=..&from=..&to=..` così uno
   stato è condivisibile e riproducibile. **Requisito**: i project manager
   devono poter mandare un link a un assessore.

---

## Fase 3 — Calendario eventi ricorrenti

### 3.1 Modello

```ts
type EventTemplate = {
  id: string;                 // 'scicli_cavalcata_san_giuseppe'
  name: string;
  territory: string;          // 'scicli' | 'beirut' | ...
  scope: 'local' | 'national';
  recurrence: {               // regola, non data singola
    kind: 'annual_month' | 'annual_easter' | 'annual_nth_weekday' | 'fixed';
    rule: string;             // descrizione leggibile della regola
  };
  typicalDurationDays: number;
  category: string;
  source: { url: string; retrievedAt: string };
  confidence: 'verified' | 'approximate' | 'client';
  notes?: string;             // es. edizioni sospese o rinviate
};
type EventInstance = {
  templateId: string; year: number; from: string; to: string;
  status: 'expected' | 'confirmed' | 'cancelled' | 'tbd';
};
```

Regole:

- Si memorizzano **TEMPLATE ricorrenti + ISTANZE annuali**. Mai una sola data.
- Ogni evento ha `source` e `confidence`. Nessuna data inventata.
- Le istanze possono essere `tbd`: mostralo come tale, non inventare.
- Il project manager può aggiungere eventi del proprio stakeholder: stesso
  modello, `source` = riferimento del cliente, `confidence` = 'client'.

### 3.2 Dataset iniziale (verificare e completare prima del rilascio)

**SCICLI — ricorrenti annuali:**

- Cavalcata di San Giuseppe — marzo, sabato prossimo al 19 — cavalcata con
  bardature fiorite, sfilata in piazza — fonte: visitvigata.com, lasiciliainrete.it
- Settimana Santa / Uomo Vivo — Pasqua — processioni, "Scisa a Cruci",
  sollevamento del Cristo Risorto — fonte: visitvigata.com, marzamemi.com blog
- Madonna delle Milizie — ultimo sabato di maggio — rievocazione storica in
  piazza Italia — fonte: visitvigata.com, comune.scicli.rg.it
- MACC Music Festival — estate, Chiostro del Carmine — fonte: ilovescicli.it,
  ilgiornalediscicli.it
- Taranta Sicily Fest — agosto — fonte: visitvigata.com
- Memorial Peppe Greco — fine settembre, corsa podistica 10 km — fonte: ilovescicli.it
- Infiorata a cavallo — agosto — fonte: ilovescicli.it

**BEIRUT — ricorrenti annuali:**

- Beirut Chants Festival — 1–23 dicembre, chiese storiche, ingresso gratuito
  con prenotazione — fonte: beirutchants.com, beirut.com
- Al Bustan Festival — febbraio–marzo, Beit Mery, musica classica e lirica —
  fonte: thingstodoinbeirut.com, tripbase.com
- Beirut Spring Festival — agosto–settembre, multidisciplinare, gratuito —
  fonte: beirutspringfestival.org
- Beirut Design Week — giugno — fonte: thingstodoinbeirut.com
- Fête de la Musique — 21 giugno, concerti diffusi gratuiti — fonte: madeinliban.com
- Beirut International Marathon — gennaio o marzo secondo l'edizione (le fonti
  divergono: marcare 'tbd') — fonte: thingstodoinbeirut.com, thingstodoinlebanon.com
- Beirut Jazz Festival — settembre — fonte: thingstodoinbeirut.com

**NAZIONALE (per Beirut, contesto):**

- Baalbeck International Festival, Byblos International Festival, Beiteddine —
  presentare con nota esplicita che le edizioni 2026 hanno subito rinvii o
  cancellazioni. Non mostrare come certi. — fonte: tripbase.com, madeinliban.com

**IMPORTANTE:** le date variano di anno in anno. Il sistema deve mostrare la
regola di ricorrenza, l'istanza dell'anno corrente con il suo stato, e
l'avvertenza che le date vanno confermate presso l'organizzatore. Nessuna
certezza che non ci sia.

---

## Fase 4 — Metarelazioni esplorabili

Dallo Stato emergente, le relazioni sono il secondo livello di esplorazione:

1. Un interruttore "relazioni" attiva il fabric fra le storie dello stato.
2. Tipi attivi in questa fase: `proximity`, `place`, `cooccurrence`, `topic`,
   `semantic` (se disponibile), `author_community`.
3. Click su un arco: giustificazione da template ("stessa piazza · 4 giorni
   di distanza · categoria comune").
4. Click su una storia: evidenzia le sue relazioni e mostra i suoi campi.
5. Filtro dello stato attivo = filtro delle relazioni. Mai relazioni fra
   storie fuori dallo stato, se non in secondo piano attenuato.
6. Nessun modello linguistico in questo percorso.

---

## Fase 5 — Fabric come layer additivo e design

Principio: il fabric è **CERA SOPRA**, non sostituzione. La mappa base resta
sempre leggibile e identica a sé stessa.

1. Il fabric è un layer con opacità regolabile (0–100%), spento di default.
2. Modalità: `filaments` e `field`. La `weave` resta esclusa.
3. Palette, curvatura, spessore, alone, opacità: tutti parametri, nessun
   valore nel codice.
4. Ogni elemento del fabric è ispezionabile: cliccare un arco, una zona o un
   alone restituisce la sua giustificazione.
5. Testo minimo sovrapposto: nessuna etichetta invadente. Etichette solo su
   hover o su soglia di zoom.
6. Rispetta `prefers-reduced-motion`: nessuna pulsazione automatica.
7. Il fabric deve degradare con grazia: con 3 storie mostra ciò che può e
   dichiara l'insufficienza; non sparisce e non finge.

---

## Fase 6 — Project pack: la customizzazione del project manager

Un "project pack" è un JSON che definisce un territorio e la sua lettura.
Nessun codice.

```ts
type ProjectPack = {
  id: string;                 // 'scicli_demo' | 'beirut_demo'
  name: string;
  territory: { bbox: [number, number, number, number]; center: [number, number]; zoom: number };
  themes: { id: string; label: string; categories: string[]; keywords: string[] }[];
  events: string[];           // templateId ammessi in questo pack
  fabric: {
    defaultMode: 'filaments' | 'field';
    defaultOpacity: number;
    palette: { name: string; colors: string[] };   // max 7 colori, niente arcobaleno
    curvature: number;
    fieldBandMeters: number;
    fieldBandMinutes: number;
    nodeScale: number;
  };
  copy: {                     // tutte le stringhe, traducibili
    title: string;
    subtitle: string;
    emptyState: string;
    sparseState: string;
  };
  defaults: { query?: Query; opacity?: number; mode?: string };
};
```

Requisiti:

1. Un pannello "Project" accessibile da `?pm=1` consente di: scegliere pack,
   cambiare palette da preset, spostare opacità e curvatura, scegliere il
   tema di default, e COPIARE l'URL dello stato corrente.
2. Le modifiche del PM non richiedono rilascio: si salvano come override
   locale o lato server e producono un nuovo URL condivisibile.
3. "Esporta pack" produce il JSON scaricabile, così il pack di Scicli può
   essere duplicato per un'altra città in un minuto.
4. Preset di palette: almeno 4, tutte sicure per deuteranopia e protanopia.
5. Il PM non deve poter rompere la mappa: i parametri hanno limiti e
   validazione con messaggi leggibili.

---

## Fase 7 — Robustezza minima (condizione per testare)

1. Bozza locale persistente per le storie in cattura; sopravvive a refresh.
2. Upload media in chunk con ripresa, coda persistente, stato per elemento.
3. Funzionamento offline per la consultazione della mappa già caricata.
4. Versione build visibile in piccolo.
5. Telemetria tecnica: errori, tempi, tipo di rete, versione. Nessun testo
   delle storie nei log.
6. Pulsante "segnala un problema" con contesto tecnico allegato.

---

## Criteri di accettazione

1. Cambiando tema, testo o evento cambia lo stato della mappa, e la mappa
   mostra ancora in secondo piano le storie non rilevanti.
2. Ogni stato è catturabile in URL e riproducibile aprendo il link.
3. Una ricerca senza risultati produce uno stato esplicito con suggerimenti,
   mai una schermata vuota.
4. Il calendario mostra template e istanze annuali con fonte, confidenza e
   stato; nessuna data inventata; gli eventi con edizione incerta sono
   marcati `tbd`.
5. Il fabric è attivabile/disattivabile e la mappa base resta identica.
6. Click su arco o zona restituisce una giustificazione leggibile nel 90%
   dei casi.
7. Un project pack si crea, si esporta e si reimporta senza toccare il codice.
8. Da `?pm=1` un non-tecnico cambia palette e opacità e ottiene un URL
   condivisibile.
9. Con 3 storie il fabric dichiara l'insufficienza e la mappa non è vuota.
10. Funziona su 3G simulato: primo caricamento < 8 s.
11. Una nuova città/DZ (anche sintetica nei test) funziona end-to-end con solo
    dati: pack + temi + eventi, senza modifiche al codice.

---

## Requisito trasversale — genericità per QUALUNQUE città e DZ

Tutto ciò che segue vale per **ogni città e ogni Dramaturgical Zone (DZ)**, non
solo per Scicli e Beirut. Regola di progetto: aggiungere una città o una DZ
nuova deve richiedere **solo dati/configurazione, mai codice**.

1. **Niente hardcoding geografico.** Nessun identificativo di città, zona,
   tema o evento nel codice di `src/core/state/`, nel fabric, nel calendario o
   nelle funzioni `/api/state`: dataset e pack sono dati (JSON/TS seed),
   caricati per territorio.
2. **Pack per territorio.** Ogni DZ è associata a un `ProjectPack` (esplicito
   `territoryId`/`packId`); una ZP creata in pilot mode ottiene un pack di
   default generato dai dati della zona (bbox/centro/zoom, temi di default,
   calendario vuoto dichiarato). Nessuna ZP resta senza stato emergente.
3. **Temi per pack.** L'elenco temi è dichiarato nel pack; i default
   (mobilità, accessibilità, sicurezza percepita, commercio, cultura, servizi
   pubblici, memoria, acqua, lavoro) sono un **template di partenza**, non
   un elenco globale vincolante.
4. **Eventi per territorio.** I template evento hanno `territory`; il
   calendario di uno stato mostra solo gli eventi del territorio della DZ
   attiva (più eventuali nazionali dichiarati nel pack, con nota). Una città
   senza eventi mostra uno stato esplicito "calendario non ancora curato",
   mai una lista vuota silenziosa.
5. **Query e URL agnostici.** `?theme=..&q=..&event=..&dz=..&pack=..` devono
   funzionare per qualunque DZ; cambiare DZ ricostruisce lo State lato server
   con il pack della nuova zona.
6. **Test di genericità (obbligatorio).** Un fixture con una **terza città
   sintetica** (es. `testville`, bbox/centro arbitrari, 2 temi, 1 evento con
   fonte fittizia dichiarata) deve produrre uno State completo, fabric e
   pack esportabile/importabile senza modifiche al codice. Il test deve
   fallire se qualcuno reintroduce un riferimento hardcoded a Scicli/Beirut
   nei percorsi generici.
7. **Degrado dichiarato.** Zona nuova senza storie/eventi: stato "insufficiente"
   con copy dal pack (`emptyState`/`sparseState`), fabric che mostra ciò che
   può e dichiara l'insufficienza.
8. **Il PM non crea codice.** Nuova città = nuovo pack (o pack derivato dal
   template) + eventi con fonte/confidenza; nessun deploy necessario per i
   contenuti (override locali o lato server, come da Fase 6).

---

## Cose da NON fare

- Non inventare date, luoghi o eventi. Ogni evento ha fonte e confidenza.
- Non mostrare un evento come certo se l'edizione è incerta.
- Non filtrare in modo distruttivo il corpus: il contesto resta visibile.
- Non usare un modello linguistico per giustificazioni, spiegazioni o
  etichette: template.
- Non calcolare rilevanza o similarità nel browser.
- Non implementare la modalità `weave`.
- Non esporre la scelta del pack o della palette a chi non è PM.
- Non usare più di 7 colori e nessun arcobaleno.
- Non specializzare il codice per Scicli o Beirut: solo dati/pack.

---

## Aree da portare al team

- Quali temi sono davvero rilevanti per Scicli e per Beirut: l'elenco in Fase
  2 è un'ipotesi, va validata da chi conosce i territori.
- Se la ricerca testuale debba cercare anche nei media (trascrizioni audio)
  o solo nel testo scritto.
- Se il calendario debba includere eventi nazionali fuori dal territorio
  (per Beirut: Baalbeck, Byblos) o solo locali.
- Chi aggiorna le istanze annuali: il PM, un curatore, o un servizio esterno.
- Se gli override del PM siano locali al browser o persistiti lato server.
