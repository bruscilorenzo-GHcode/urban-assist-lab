import { describe, expect, it } from 'vitest'
import { publishStory } from '../src/assist-urban/story'
import { validateConsent, ConsentError } from '../src/assist-urban/pipeline/consent'
import { scrubText, obfuscatePoint } from '../src/assist-urban/pipeline/pii'
import {
  SEED_ZONES,
  createPilotZone,
  loadActiveZoneId,
  loadPilotZones,
  makeZoneId,
  mergeZones,
  saveActiveZoneId,
  savePilotZones,
  validateZoneInput,
  zoneById,
} from '../src/assist-urban/pipeline/dramaturgical-zones'
import { validateMediaFile, kindOf, chunksFor } from '../netlify/functions/lib/media.js'
import { MAX_STORED_STORIES, newestFirst, normalizeDz, storyKey, storyPrefix } from '../netlify/functions/lib/stories.js'

const TEXT = 'La ciclabile si interrompe davanti al porto, con la bici finisco nel traffico. Chiama 514-555-0123, scrivi a mario@example.com'

describe('dramaturgical zones', () => {
  it('ships Scicli, Napoli Est and Beirut as curated zones and never Montréal', () => {
    expect(SEED_ZONES.map((zone) => zone.id)).toEqual(['scicli', 'napoli_est', 'beirut'])
    expect(SEED_ZONES.every((zone) => zone.status === 'active')).toBe(true)
    expect(SEED_ZONES.every((zone) => zone.origin === 'curated')).toBe(true)
    expect(JSON.stringify(SEED_ZONES).toLowerCase()).not.toContain('montréal')
    expect(mergeZones([]).map((zone) => zone.name)).toEqual(['Scicli', 'Napoli Est', 'Beirut'])
  })

  it('drops a legacy Montréal zone from persisted pilot zones', () => {
    const legacy = { ...SEED_ZONES[0]!, id: 'montreal', name: 'Montréal', origin: 'pilot' as const }
    expect(mergeZones([legacy]).some((zone) => zone.id === 'montreal')).toBe(false)
  })

  it('validates and creates a pilot zone with a stable campaign id', () => {
    const input = {
      name: 'Ragusa Ibla', city: 'Ragusa',
      focusIt: 'i vicoli di Ibla', focusEn: 'the alleys of Ibla',
      themeIt: 'memoria', themeEn: 'memory',
      lat: 36.925, lon: 14.725, zoom: 15,
    }
    expect(validateZoneInput(input)).toBeNull()
    const zone = createPilotZone(input)
    expect(zone.id).toMatch(/^dz_ragusa_ibla_[a-f0-9]{4}$/)
    expect(zone.origin).toBe('pilot')
    expect(zone.center).toEqual([36.925, 14.725])
    expect(zone.status).toBe('active')
    expect(validateZoneInput({ ...input, lat: 200 })).toBe('center')
    expect(validateZoneInput({ ...input, name: '' })).toBe('name')
    expect(makeZoneId('Napoli Est')).toMatch(/^dz_napoli_est_/)
  })

  it('persists only pilot zones and merges them after the curated ones', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value) },
    }
    const pilot = createPilotZone({
      name: 'Test DZ', city: 'Test',
      focusIt: 'focus test', focusEn: 'test focus',
      themeIt: '', themeEn: '', lat: 40.1, lon: 14.2, zoom: 12,
    })
    savePilotZones([{ ...SEED_ZONES[0]!, origin: 'curated' }, pilot], storage)
    const loaded = loadPilotZones(storage)
    expect(loaded.map((zone) => zone.id)).toEqual([pilot.id])
    expect(mergeZones(loaded).map((zone) => zone.id)).toEqual(['scicli', 'napoli_est', 'beirut', pilot.id])
    expect(zoneById(mergeZones(loaded), 'missing').id).toBe('scicli')
    saveActiveZoneId(pilot.id, storage)
    expect(loadActiveZoneId(storage, mergeZones(loaded))).toBe(pilot.id)
    expect(loadActiveZoneId(storage, SEED_ZONES)).toBeNull()
  })
})

describe('story persistence keys', () => {
  it('scopes keys by DZ and orders them chronologically', () => {
    expect(normalizeDz('scicli')).toBe('scicli')
    expect(normalizeDz('napoli_est')).toBe('napoli_est')
    expect(normalizeDz('Montréal/../x')).toBeNull()
    expect(normalizeDz(null)).toBeNull()
    expect(storyPrefix('scicli')).toBe('dz:scicli:')
    const older = storyKey({ id: 'st_old', dz: 'scicli' }, 1_700_000_000_000)
    const newer = storyKey({ id: 'st_new', dz: 'scicli' }, 1_700_000_001_000)
    expect(older).toBe('dz:scicli:1700000000000:st_old')
    expect(newer > older).toBe(true)
    expect(storyKey({ id: 'st_x', dz: null }, 1)).toBe('dz:none:0000000000001:st_x')
    expect(newestFirst([older, newer])).toEqual([newer, older])
    expect(MAX_STORED_STORIES).toBe(48)
  })
})

describe('consent + pii', () => {
  it('refuses coordinates without grid consent', () => {
    expect(() => validateConsent(true, { geo_mode: 'none', allow_dispatch: true })).toThrow(ConsentError)
  })
  it('scrubs identifiers and obfuscates cells', () => {
    const { text } = scrubText(TEXT)
    expect(text).not.toContain('514-555-0123')
    expect(text).not.toContain('mario@example.com')
    expect(obfuscatePoint(38.1168, 13.3616).index).toMatch(/^gr_r8_/)
  })
})

describe('media helpers', () => {
  it('validates type and the 50 MB budget', () => {
    expect(kindOf('audio/webm')).toBe('audio')
    expect(validateMediaFile('image/png', 1024).ok).toBe(true)
    expect(validateMediaFile('application/zip', 1024).ok).toBe(false)
    expect(validateMediaFile('video/mp4', 16 * 1024 * 1024).ok).toBe(true)
    expect(validateMediaFile('video/mp4', 51 * 1024 * 1024).ok).toBe(false)
    expect(chunksFor(15 * 1024 * 1024)).toBe(4)
    expect(chunksFor(50 * 1024 * 1024)).toBe(13)
  })
})

describe('publishStory', () => {
  it('publishes a scrubbed story with an anonymous cell and its DZ', async () => {
    const out = await publishStory(
      { text: TEXT, ts: '2026-11-04T10:00:00Z', lang: 'it', dz: 'scicli', lat: 38.1168, lon: 13.3616,
        media: [{ id: 'a'.repeat(18), kind: 'audio', size: 5000 }] },
      { geo_mode: 'grid', allow_dispatch: true })
    const blob = JSON.stringify(out)
    expect(blob).not.toContain('38.1168')
    expect(blob).not.toContain('13.3616')
    expect(blob).not.toContain('514-555-0123')
    expect(out.story.geo?.index).toMatch(/^gr_r8_/)
    expect(out.story.dz).toBe('scicli')
    expect(out.story.media).toHaveLength(1)
    expect(out.story.author_pseudonym).toMatch(/^anon_/)
    expect(out.integrity.pii_scrubbed).toBe(true)
  })

  it('publishes a comparative post with media from different timelines', async () => {
    const out = await publishStory({
      text: 'La stessa piazza in due momenti',
      ts: 't',
      dz: 'scicli',
      comparative: true,
      media: [
        { id: 'a'.repeat(18), kind: 'image', size: 100, timeline: '1975', caption: 'La piazza nel 1975, tel 514-555-0123' },
        { id: 'b'.repeat(18), kind: 'image', size: 100, timeline: 'oggi', caption: 'La stessa piazza oggi' },
      ],
    }, { geo_mode: 'none', allow_dispatch: true })
    expect(out.story.comparative).toBe(true)
    expect(out.story.media.map((m) => m.timeline)).toEqual(['1975', 'oggi'])
    expect(out.story.media[0]!.caption).not.toContain('514-555-0123')
    expect(out.story.scrubbed_terms).toBeGreaterThan(0)
  })

  it('rejects comparative posts without two different timelines', async () => {
    const one = [{ id: 'a'.repeat(18), kind: 'image', size: 10, timeline: '1975' }]
    await expect(publishStory({ text: 'x', comparative: true, media: one }, { geo_mode: 'none', allow_dispatch: true }))
      .rejects.toThrow(/at least 2 media/)
    const same = [
      { id: 'a'.repeat(18), kind: 'image', size: 10, timeline: 'oggi' },
      { id: 'b'.repeat(18), kind: 'image', size: 10, timeline: 'OGGI' },
    ]
    await expect(publishStory({ text: 'x', comparative: true, media: same }, { geo_mode: 'none', allow_dispatch: true }))
      .rejects.toThrow(/different timelines/)
  })

  it('publishes non-georeferenced stories without geo', async () => {
    const out = await publishStory({ text: 'Una storia senza luogo', ts: 't', dz: 'napoli_est' }, { geo_mode: 'none', allow_dispatch: true })
    expect(out.story.geo).toBeNull()
    expect(out.story.dz).toBe('napoli_est')
    expect(out.integrity.geo_mode).toBe('none')
  })

  it('rejects empty text, bad media ids and over-budget media; ignores invalid DZ ids', async () => {
    await expect(publishStory({ text: '   ' }, { geo_mode: 'none', allow_dispatch: true })).rejects.toThrow(/required/)
    const badId = await publishStory({ text: 'ok', media: [{ id: 'nope', kind: 'audio', size: 1 }] },
      { geo_mode: 'none', allow_dispatch: true })
    expect(badId.story.media).toHaveLength(0)
    const badDz = await publishStory({ text: 'ok', dz: 'Montréal/../x' }, { geo_mode: 'none', allow_dispatch: true })
    expect(badDz.story.dz).toBeNull()
    await expect(publishStory(
      { text: 'ok', media: [{ id: 'b'.repeat(18), kind: 'video', size: 30 * 1024 * 1024 }, { id: 'c'.repeat(18), kind: 'video', size: 30 * 1024 * 1024 }] },
      { geo_mode: 'none', allow_dispatch: true })).rejects.toThrow(/budget/)
  })
})
