# CHANGELOG

All notable changes to the URBAN ASSIST reference. Tags mark fork baselines.

## v1.0.1 — 2026-11-14

- Restore the city/zone helpers (`cityNamesOf`, `zonesInCity`, `zoneCityKey`)
  used by the city switcher and by the fork-parity tests.

## v1.0.0 — 2026-11-14

**Emergent map state, recurring-event calendar, additive fabric, project packs.**

- `src/core/state/`: one `Query` model (theme / free text / recurring event /
  combined), one `State` with `resolvedFilter`, relevance-weighted stories,
  fabric snapshot, template `explanation` and declared `coverage.sparse`.
- Server-side computation: `GET /api/state` (Netlify Function); the browser
  never computes semantic relevance. Lexical + entities fallback declared in
  `resolvedFilter.matchMode`.
- Non-destructive corpus: non-relevant stories stay visible, attenuated.
- Search: themes (from pack), free text, combination (AND), removable chips,
  empty search = ordinary state, zero results = explicit state with suggestions.
- URL state: `?theme=&q=&event=&from=&to=&dz=&pack=` — shareable and reproducible.
- Recurring event calendar: templates + annual instances with `source`,
  `confidence` (`verified|approximate|client`), `status` including `tbd`
  (Beirut Marathon and the 2026 national festival editions are flagged, not
  presented as certain). Scicli, Beirut and national datasets included.
- Meta-relations: proximity, place, cooccurrence, topic, semantic (when
  available), author_community; toggle, inspectable justifications (templates).
- Additive fabric layer: opacity 0–100, `filaments` / `field` modes (no
  `weave`), pack-driven palette/curvature/width/halo, hover labels,
  `prefers-reduced-motion` respected, graceful degradation with few stories.
- Project packs (`?pm=1`): pack selection, colour-blind-safe palette presets,
  opacity/curvature, default theme, copy current URL, export/import JSON,
  bounded and validated parameters.
- Genericity: any city/DZ works from configuration — pilot zones get a default
  pack; `testville` fixture test guards against hardcoding any territory.
- Robustness: persistent capture draft, resumable chunked media queue with
  per-item state, offline consultation of the last wall, visible build version,
  technical telemetry without story text, "report a problem" with technical
  context.
- Fix: media functions read `{etag, metadata}` from `@netlify/blobs` and serve
  the correct `Content-Type` (previously always `application/octet-stream`).
- Live reference: https://urban-assist-982.netlify.app
