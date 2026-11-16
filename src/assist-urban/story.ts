/** Pure urban storytelling submission: consent gate -> PII scrub -> geo
 *  obfuscation -> publication record. No triage, no LLM, no routing: the
 *  platform publishes multimedia stories pinned on the urban map.
 *
 *  Media live on Netlify Blobs under opaque ids (see media-upload); the
 *  original filename never reaches the server. Exact coordinates never leave
 *  the consent gate: only an anonymised cell index may be published. */

import { validateConsent, type Consent } from './pipeline/consent.js'
import { obfuscatePoint, pseudonym, scrubText, textHash } from './pipeline/pii.js'

export interface MediaRef {
  id: string
  kind: 'image' | 'video' | 'audio' | 'text'
  size: number
  /** Optional comparative timeline label (e.g. "1975", "today"). */
  timeline?: string
  /** Optional caption shown under the media in the comparative strip. */
  caption?: string
}

export interface StoryInput {
  note_id?: string
  text?: string
  ts?: string
  lang?: string
  lat?: number | null
  lon?: number | null
  /** The Dramaturgical Zone (campaign) the story belongs to. */
  dz?: string | null
  /** Group these media as a comparison of different timelines. */
  comparative?: boolean
  media?: MediaRef[]
}

export interface PublishedStory {
  id: string
  author_pseudonym: string
  text: string
  text_hash: string
  lang: string
  ts: string
  geo: { index: string, res: number } | null
  /** The Dramaturgical Zone (campaign) the story belongs to. */
  dz: string | null
  comparative: boolean
  media: MediaRef[]
  scrubbed_terms: number
}

export interface StoryResult {
  story: PublishedStory
  integrity: { pii_scrubbed: true, geo_mode: 'grid' | 'none', scrubbed_terms: number }
}

const MAX_TEXT = 4000
const KINDS = new Set(['image', 'video', 'audio', 'text'])

export async function publishStory(noteRaw: unknown, consentRaw: unknown): Promise<StoryResult> {
  const note = (noteRaw ?? {}) as StoryInput
  const consent = (consentRaw ?? {}) as Consent
  if (typeof note.text !== 'string' || note.text.trim().length === 0) {
    throw new Error('story text required')
  }
  const hasCoords = typeof note.lat === 'number' && typeof note.lon === 'number'
  const decision = validateConsent(hasCoords, { ...consent, allow_dispatch: true })
  if (!decision.accepted) throw new Error(decision.reason)

  const { text, removed } = scrubText(note.text.slice(0, MAX_TEXT))
  let scrubbed = removed
  const media: MediaRef[] = Array.isArray(note.media)
    ? note.media
      .filter((m) => m && typeof m.id === 'string' && /^[a-f0-9]{18}$/.test(m.id)
        && KINDS.has(String(m.kind)) && Number.isFinite(m.size) && m.size >= 0)
      .slice(0, 12)
      .map((m) => {
        const timelineRaw = typeof m.timeline === 'string' ? m.timeline.slice(0, 120) : ''
        const timelineScrub = timelineRaw.trim() ? scrubText(timelineRaw) : null
        if (timelineScrub) scrubbed += timelineScrub.removed
        const timeline = timelineScrub?.text.trim().slice(0, 40) || undefined
        const captionRaw = typeof m.caption === 'string' ? m.caption.slice(0, 200) : ''
        const captionScrub = captionRaw.trim() ? scrubText(captionRaw) : null
        if (captionScrub) scrubbed += captionScrub.removed
        const caption = captionScrub?.text.trim().slice(0, 80) || undefined
        return {
          id: m.id,
          kind: m.kind,
          size: Math.min(m.size, 50 * 1024 * 1024),
          ...(timeline ? { timeline } : {}),
          ...(caption ? { caption } : {}),
        }
      })
    : []
  const total = media.reduce((n, m) => n + m.size, 0)
  if (total > 50 * 1024 * 1024) throw new Error('media budget exceeded (50 MB)')

  const comparative = note.comparative === true
  if (comparative) {
    if (media.length < 2) throw new Error('comparative stories need at least 2 media items')
    const timelines = new Set(media.map((m) => (m.timeline ?? '').toLowerCase()).filter(Boolean))
    if (timelines.size < 2) throw new Error('comparative stories need at least 2 different timelines')
  }

  const id = 'st_' + randomHex(8)
  const ts = typeof note.ts === 'string' ? note.ts : new Date().toISOString()
  const lang = ['en', 'fr', 'it'].includes(note.lang ?? '') ? note.lang! : 'it'
  const dz = typeof note.dz === 'string' && /^[a-z0-9][a-z0-9_-]{1,63}$/.test(note.dz) ? note.dz : null

  let geo: PublishedStory['geo'] = null
  if (decision.geoModeDispatch === 'grid' && hasCoords) {
    const ob = obfuscatePoint(note.lat!, note.lon!, consent.geo_resolution ?? 8)
    geo = { index: ob.index, res: consent.geo_resolution ?? 8 }
  }

  const story: PublishedStory = {
    id,
    author_pseudonym: await pseudonym(note.note_id || id),
    text,
    text_hash: await textHash(text),
    lang,
    ts,
    geo,
    dz,
    comparative,
    media,
    scrubbed_terms: scrubbed,
  }
  if (JSON.stringify(story).match(/"(?:lat|lon|latitude|longitude)"\s*:/)) {
    throw new Error('coordinate-like keys must never be published')
  }
  return { story, integrity: { pii_scrubbed: true, geo_mode: geo ? 'grid' : 'none', scrubbed_terms: scrubbed } }
}

function randomHex(n: number): string {
  const b = new Uint8Array(n)
  crypto.getRandomValues(b)
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}
