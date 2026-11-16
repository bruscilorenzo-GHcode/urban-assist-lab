import { describe, expect, it } from 'vitest'
import { buildCalendar } from '../src/core/calendar/recurrence'
import { derivePackFromZone } from '../src/core/packs/derive'
import { resolvePackForZone } from '../src/core/packs/registry'
import { parseProjectPack, serializePack } from '../src/core/packs/validate'
import { computeState } from '../src/core/state/compute'
import { TESTVILLE_EVENTS, TESTVILLE_PACK, TESTVILLE_STORIES, cloneAsImported } from './fixtures/testville'

const NOW = new Date('2026-11-14T10:00:00Z')

describe('genericity · any city, any DZ, data only', () => {
  it('produces a complete State for a third synthetic city', () => {
    const calendar = buildCalendar(TESTVILLE_EVENTS, 'testville', 2026, false, TESTVILLE_PACK.events)
    const state = computeState({
      stories: TESTVILLE_STORIES,
      pack: TESTVILLE_PACK,
      calendar,
      query: { kind: 'free', themeId: 'acqua', text: 'fiume' },
      options: { lang: 'en', dzId: 'testville', now: NOW },
    })
    expect(state.stories).toHaveLength(6)
    expect(state.coverage.matched).toBeGreaterThan(0)
    expect(state.fabric.edges.length).toBeGreaterThan(0)
    expect(state.fabric.modes).toEqual(['filaments', 'field'])
    expect(state.explanation).toContain('lexical + entity fallback')
    expect(calendar.curated).toBe(true)
    expect(calendar.instances[0]?.source.url).toContain('example.invalid')
  })

  it('exports, re-imports and recomputes a pack copy without code changes', () => {
    const copy = cloneAsImported(TESTVILLE_PACK, 'testville_copy')
    const json = serializePack(copy)
    const parsed = parseProjectPack(JSON.parse(json))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const calendar = buildCalendar(TESTVILLE_EVENTS, parsed.pack.territoryId, 2026, false, parsed.pack.events)
    const state = computeState({
      stories: TESTVILLE_STORIES,
      pack: parsed.pack,
      calendar,
      query: { kind: 'theme', themeId: 'lavoro' },
      options: { lang: 'it', dzId: 'testville', now: NOW },
    })
    expect(parsed.pack.id).toBe('testville_copy')
    expect(state.coverage.matched).toBe(2)
    expect(parsed.pack.id).toBe('testville_copy')
  })

  it('gives a brand-new pilot DZ a derived pack and an explicitly empty calendar', () => {
    const zone = {
      id: 'dz_atlantis_2048',
      name: 'Atlantis Centro',
      city: 'Atlantis',
      center: [10.5, 20.5] as [number, number],
      zoom: 14,
      focus: { it: 'il centro di Atlantis', en: 'the centre of Atlantis' },
    }
    const pack = derivePackFromZone(zone)
    expect(pack.id).toMatch(/^pack_dz_atlantis_2048$/)
    expect(pack.territoryId).toBe('atlantis')
    expect(pack.themes.length).toBeGreaterThan(1)
    expect(pack.events).toEqual([])
    expect(parseProjectPack(JSON.parse(serializePack(pack))).ok).toBe(true)

    const calendar = buildCalendar(TESTVILLE_EVENTS, pack.territoryId, 2026, pack.includeNational, pack.events)
    expect(calendar.curated).toBe(false)
    expect(calendar.instances).toEqual([])

    const state = computeState({
      stories: [],
      pack,
      calendar,
      query: { kind: 'free' },
      options: { lang: 'it', dzId: zone.id, now: NOW },
    })
    expect(state.stories).toEqual([])
    expect(state.coverage.sparse).toBe(true)
    expect(state.explanation.length).toBeGreaterThan(10)
    expect(state.resolvedFilter.places).toContain(zone.id)
  })

  it('resolves a stored pack for a territory and falls back to a derived one', () => {
    const zone = {
      id: 'testville',
      name: 'Testville',
      city: 'Testville',
      center: [10.05, 20.05] as [number, number],
      zoom: 14,
      focus: { it: 'fixture', en: 'fixture' },
    }
    expect(resolvePackForZone(zone, { stored: [TESTVILLE_PACK] }).id).toBe('testville_demo')
    const unknown = resolvePackForZone({ ...zone, id: 'dz_unknown_0001', city: 'Unknown' }, { stored: [] })
    expect(unknown.id).toMatch(/^pack_/)
    expect(unknown.events).toEqual([])
  })

  it('never hardcodes Scicli/Beirut in the generic paths', () => {
    const raw = import.meta.glob(
      [
        '../src/core/**/*.ts',
        '../src/assist-urban/UrbanStorytelling.tsx',
        '../src/assist-urban/fabric-overlay.ts',
        '../src/assist-urban/state-panel.tsx',
        '../src/assist-urban/state-client.ts',
        '../src/assist-urban/draft-store.ts',
        '../src/assist-urban/story-cache.ts',
        '../src/assist-urban/project-panel.tsx',
        '../netlify/functions/state.ts',
        '../netlify/functions/packs.ts',
      ],
      { query: '?raw', import: 'default', eager: true },
    ) as Record<string, string>
    const generic = Object.entries(raw).filter(([path]) => !path.endsWith('/seeds.ts'))
    expect(generic.length).toBeGreaterThan(5)
    for (const [path, source] of generic) {
      expect(source, `${path} must stay city-agnostic`).not.toMatch(/\b(scicli|beirut|napoli)\b/i)
    }
  })
})
