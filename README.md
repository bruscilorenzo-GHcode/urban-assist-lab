# URBAN ASSIST — Assistive Urban Storytelling

**Reference version:** **v1.0.0** · `main` is always green (CI: tests + build).

| Canonical links | |
| :--- | :--- |
| Live reference | https://urban-assist-982.netlify.app |
| Repository | https://github.com/bruscilorenzo-GHcode/urban-assist |
| Forking & upstream sync | `FORKING.md` |
| Changelog / tags | `CHANGELOG.md` · `git tag -l` |

Fork a **tag**, keep your work on a branch, rebase on `upstream/main`, and put
territory customizations in **project packs / event data**, not in the core.

A place-bound civic storytelling app. Citizens tell **multimedia stories** — text, photo,
video, voice — anchored to a real place; the app turns them into **Dramaturgical Zones**
campaigns and keeps the collection concentrated on one area at a time.

Standalone repository: this is the **whole app** (no suite, no other projects). Fork it,
add your city, deploy it.

**Curated experiments:** **Scicli**, **Napoli Est**, **Beirut**.
**Anything else:** pilots create cities and zones directly from the UI — geocoded, no
account required. The pipeline is city-agnostic: a story always carries its zone, and the
map and wall show only the active zone.

---

## 1 · What it does

- **Two interfaces in one**: public storytelling (map, composer, wall) and a **pilot mode**
  for collaborators who create and manage their own Dramaturgical Zones.
- **A story is a place**: map click (or geolocated photo/voice), consent gate, anonymous
  deg-grid cell, PII scrubbing — exact coordinates are never stored.
- **Multimedia**: up to **50 MB** per story across photo, video, audio and text; files are
  stored in Netlify Blobs under opaque ids (original filenames never leave the browser).
- **Signals, not scores**: the app computes a *fiction ⇄ facts* measure on every story
  (deterministic, trilingual FR/EN/IT) so the wall can separate lived narrative from
  verifiable observations without punishing either.
- **The story returns**: author-side delete with a private token; media served through
  opaque ids; no public per-person counts.

## 2 · Dramaturgical Zones (DZ)

A DZ is the unit of a campaign: a name, a city, a map centre/zoom, a dramaturgical focus
(IT/EN), a theme hint and starter presets.

| Zone | City | Status |
| :--- | :--- | :--- |
| Scicli | Scicli | curated |
| Napoli Est | Napoli | curated |
| Beirut | Beirut | curated |
| *your zone* | *your city* | pilot (created from the UI) |

**Add a curated zone** (ships with every deploy): extend `SEED_ZONES` in
`src/assist-urban/pipeline/dramaturgical-zones.ts` with an object shaped like the existing
ones (`id`, `name`, `label`, `status: 'active'`, `city`, `origin: 'curated'`, `focus`,
`center: [lat, lon]`, `zoom`, `themeHint`, `presets`). Curated zones can never be shadowed
by pilot zones.

**Add a pilot zone** (runtime, shared across collaborators): switch on **pilot mode** in the
app, create the city once (geocoded), then the zone inside it. Zones are validated and
published through `/api/zones`; the creator receives a private edit token to remove it
later. Several zones can live inside the same city; inner areas are just zones with a
tighter centre and zoom.

## 3 · Architecture

```
index.html · src/main.tsx            standalone entry (no suite)
src/assist-urban/
  UrbanStorytelling.tsx              UI: map, composer, wall, pilot mode, zone switcher
  pipeline/dramaturgical-zones.ts    curated seeds, pilot validation, merge rules
  pipeline/consent.ts                consent gate (grid / none)
  pipeline/pii.ts                    PII scrubbing, anonymous deg-grid, pseudonym, hashes
  story.ts                           publish pipeline (pure, testable)
  cities.ts · geocode.ts             cities + Photon geocoding
  my-zones.ts · my-stories.ts        local ownership (edit/delete tokens)
  media-upload.ts                    chunked, resumable upload (50 MB, 4 MB chunks)
  draft-store.ts                     persistent draft + IndexedDB media queue
  state-client.ts                    fetches the server-computed State, offline cache
  state-panel.tsx                    theme/search/event controls, chips, explanation
  fabric-overlay.ts                  additive canvas fabric (filaments / field)
  project-panel.tsx                  PM pack panel (?pm=1): palette, export/import
  robustness-panel.tsx · telemetry.ts · version.ts
  i18n.tsx                           IT/EN UI strings
src/core/
  state/            Query → State engine (relevance, fabric, templates, URL)
  packs/            pack types, seeds, safe palettes, validation, derivation
  calendar/         recurring templates + yearly instances (tbd-aware)
netlify/functions/
  story.ts         GET/POST/DELETE  /api/story       (stories in Blobs, ≤48 per zone)
  zones.ts         GET/POST/DELETE  /api/zones       (pilot zones + edit tokens)
  cities.ts        GET/POST         /api/cities      (shared city records)
  state.ts         GET/POST         /api/state       (State computed server-side)
  packs.ts         GET/POST         /api/packs       (seed + PM-saved packs)
  telemetry.ts     POST             /api/telemetry   (allow-listed technical signals)
  media-upload.ts  GET/POST         /api/media-upload (chunked, resumable, Blobs)
  media.ts         GET              /api/media        (opaque-id read)
  transcribe.mts   POST             /api/groq/transcribe (optional Whisper)
tests/*.spec.ts                      Vitest (unit + API handlers + genericity)
```

Privacy invariants enforced in code: consent before coordinates leave the browser; text
scrubbed of PII; only anonymous cells (`gr_r8_…`) or no geo at all reach Blobs; media by
opaque id; delete tokens private (never returned by GET).

## 4 · Run locally

```bash
npm install

# UI only (no API): stories/zones APIs will not respond
npm run dev                 # http://localhost:5180

# Full app with Netlify Functions + Blobs emulation (recommended)
npx netlify-cli dev         # serves the app with /api/* working
```

Tests and build:

```bash
npm test                    # Vitest (story pipeline, zones, cities, API handlers)
npm run build               # tsc -b && vite build → dist/
```

## 5 · Deploy

Netlify (functions + Blobs are part of the app):

```bash
npx netlify-cli deploy --prod
# or connect the repository in the Netlify UI: build "npm run build", publish "dist"
```

- No database to provision: **Netlify Blobs** is the store.
- Optional environment variable: **`GROQ_API_KEY`** (voice transcription only; without it
  the voice channel reports "not configured" and other media keep working).
- Blob stores used: `assist-urban-stories`, `assist-urban-zones`, `assist-urban-cities`,
  `assist-urban-media`.

Static-only hosting (no functions) is not supported: publishing needs `/api/*`.

## 6 · Extending to a new city

1. **Pilot route (no deploy)**: pilot mode → create city → create zone → publish stories.
   The zone immediately gets a **derived project pack** (bbox/centre/zoom, default themes,
   explicitly empty calendar) and therefore a working emergent state.
2. **Curated route (in code)**: add the zone to `SEED_ZONES`, add presets in the local
   languages, run `npm test && npm run build`, deploy.
3. **Project pack route (data, no deploy)**: open `?pm=1`, export the derived/seed pack,
   edit themes/events/copy/fabric in the JSON, import it back, save it shared. Territory
   event templates travel inside the pack (`eventTemplates`), so a new city's calendar
   needs no code either.
4. Nothing else changes: the map, consent, pipeline, APIs and privacy guarantees are
   zone-agnostic. Inner areas are zones with `zoom` 15–17; whole cities use 12–13.

## 7 · Configuration knobs

| Where | Knob |
| :--- | :--- |
| `netlify/functions/lib/stories.ts` | `MAX_STORED_STORIES` (per zone, default 48) |
| `netlify/functions/lib/media.ts` | `MEDIA_MAX_TOTAL` / `MEDIA_MAX_PER_FILE` (50 MB) and `CHUNK_SIZE` (4 MB) |
| `src/assist-urban/pipeline/pii.ts` | pseudonym salt via `PSEUDONYM_SALT` (demo fallback if unset) |
| `src/assist-urban/pipeline/dramaturgical-zones.ts` | curated zones |

## 8 · Tests

Vitest covers: story publication pipeline and PII/consent invariants, zone validation and
merge rules (curated zones cannot be shadowed), city records, geocoding parsing, API
handlers (story, zones, cities, state, packs, telemetry) with mocked Blobs, IT/EN i18n key
parity, the emergent-state engine (non-destructive relevance, AND composition, URL
round-trip, calendar rules and `tbd`, pack export/import) and the mandatory **genericity**
suite: a third synthetic city (`testville`) must produce a full State, fabric and
exportable/importable pack, and the test fails if Scicli/Beirut leak into generic paths.

```bash
npm test
```

## 9 · Emergent state, calendar, fabric

- **State is computed server-side** (`/api/state`): the browser never scores relevance or
  similarity. Without embeddings the engine uses a declared lexical + entity fallback
  (captions/timelines included, audio transcriptions excluded).
- **The corpus is not filtered out**: every story gets a weight and a band
  (`foreground` / `context`); the base map and the wall remain complete.
- **Recurring events** store a rule, a source, a confidence and a yearly instance; uncertain
  editions stay `tbd` and the UI always asks to confirm with the organiser.
- **The fabric** is additive (“wax on top”): canvas above the map, off by default, opacity
  0–100 %, `filaments` or `field` (never `weave`), labels only on hover/zoom, reduced motion
  respected, insufficiency declared with few stories.
- **Project packs** define a territory and its reading (themes, events, fabric, copy,
  defaults). `?pm=1` opens the PM panel: pack selection, safe palette presets, opacity,
  curvature, thickness, halo, default theme, share URL, JSON export/import and a shared
  save. Limits and readable validation prevent breaking the map; seed packs are read-only
  and must be duplicated under a new id.
- **Shareable URL**: `?theme=&q=&event=&from=&to=&dz=&pack=&pm=1` plus appearance
  (`fab`, `fm`, `fo`, `pal`, `cur`, `th`, `hal`) and `year`; opening it rebuilds the same
  State on the server.

**Robustness**: draft and media queue persist (localStorage + IndexedDB), chunk uploads
resume from the last received chunk, the last State per DZ is cached for offline
consultation of the already-loaded map, the build version is visible, technical telemetry
carries no story text, and “report a problem” attaches the technical context only.

**Open decisions for the team**: which themes truly fit each territory; whether search
should include audio transcriptions; whether national events belong in the calendar;
who curates yearly instances; and whether PM overrides should be browser-local or
server-persisted (both paths exist; `?pm=1` is a mode flag, not authentication).

---

Prototype by **Super AI Studio** — Cognitive Urban Technologies.
No real citizen data ships in this repository: fixtures are synthetic.
