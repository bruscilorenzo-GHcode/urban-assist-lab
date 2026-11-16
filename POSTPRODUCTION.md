# POSTPRODUCTION — automatic media utterance pipeline (lab)

**Status:** experimental lab repository. It never deploys to the suite and never
touches the live demo at
https://musico-syntagma-suite.netlify.app/assist-urban.
**Reference app (source of truth):** https://github.com/bruscilorenzo-GHcode/urban-assist

## Goal

A collaborator uploads **media and documentary material** (audio, video, images,
text, documents) and the system produces a **media utterance** ready for
geolocation — or already geolocated — to be published as a story in Urban Assist.

```
upload (chunks, resumable)
   → assembly job (queued → processing → ready | failed)
   → media utterance = { text, media[], geo?, provenance, consent }
   → publish into a Dramaturgical Zone (existing /api/story pipeline)
```

## Requirements

1. **Resumable upload** for any file type allowed by the app (audio, video,
   image, text/PDF-as-document); per-item state and a persistent queue.
2. **Pipeline steps are explicit and inspectable**: normalize (audio → text via
   the existing optional transcription seam), extract metadata (duration,
   dimensions, language), derive a **draft utterance text**, collect provenance
   (original filenames never leave the device; opaque ids only).
3. **Geolocation**:
   - from EXIF GPS when present (only for the volunteer's own material),
   - else from an explicit map pin chosen by the uploader,
   - else `geo: null` — never infer a location.
   The produced object declares `geo.source ∈ {exif, pin, none}` and
   `geo.confidence`.
4. **States and retries**: `queued | processing | ready | failed`, retry with
   backoff, jobs survive a page reload (persisted queue), progress per step.
5. **No generative model in the critical path.** Text normalization is
   deterministic; the optional transcription step is the existing, key-gated
   seam. No invented content: every produced field references the source media.
6. **Consent gate unchanged**: nothing leaves the device without an explicit
   consent; PII scrubbing applies to the produced text; media stays under opaque
   ids; exact coordinates never reach the store unless the user pins them.
7. **Publish seam**: the produced utterance can be handed to the existing
   `/api/story` publisher (same two-node story model) with a single call.
8. **Tests**: unit tests for state machine, retries, EXIF parsing, geolocation
   source declaration, consent gate, and a fixture end-to-end (upload → ready →
   publish payload).

## Explicit non-goals (this phase)

- no deployment (the suite demo is frozen for this work),
- no LLM text generation,
- no change to the reference app's core state/fabric model.

## Interface sketch

```ts
type JobState = 'queued' | 'processing' | 'ready' | 'failed'
interface MediaUtterance {
  id: string
  text: string
  media: { id: string; kind: 'image' | 'video' | 'audio' | 'text'; size: number }[]
  geo: { index: string; res: number; source: 'exif' | 'pin' | 'none'; confidence: number } | null
  provenance: { originalNameKeptLocal: true; capturedAt?: string }
  lang: 'it' | 'en' | 'fr'
  state: JobState
  steps: { name: string; status: JobState; startedAt?: string; finishedAt?: string }[]
}
```

## How to work here

```bash
npm ci && npm test && npm run build   # nothing is deployed from this repo
git checkout -b feat/postproduction
```

Open a PR against this lab; when the feature is stable it is proposed to the
reference repo (`urban-assist`) and only then can it reach the suite demo.
