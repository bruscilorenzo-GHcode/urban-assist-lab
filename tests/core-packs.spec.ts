import { describe, expect, it } from 'vitest'
import { derivePackFromZone } from '../src/core/packs/derive'
import { PALETTE_PRESETS } from '../src/core/packs/presets'
import { SEED_PACKS } from '../src/core/packs/seeds'
import type { ProjectPack } from '../src/core/packs/types'
import { describePackIssue, parsePackJson, parseProjectPack, serializePack } from '../src/core/packs/validate'
import { TESTVILLE_PACK } from './fixtures/testville'

function withColors(colors: string[]): ProjectPack {
  return { ...TESTVILLE_PACK, fabric: { ...TESTVILLE_PACK.fabric, palette: { name: 'test', colors } } }
}

describe('project packs · data, validation, export/import', () => {
  it('ships seed packs that all validate, including the derived one', () => {
    expect(SEED_PACKS.map((pack) => pack.id)).toEqual(['scicli_demo', 'beirut_demo', 'napoli_est_demo'])
    for (const pack of SEED_PACKS) {
      const parsed = parseProjectPack(JSON.parse(serializePack(pack)))
      expect(parsed.ok, pack.id).toBe(true)
    }
    const derived = derivePackFromZone({
      id: 'dz_anywhere_0001',
      name: 'Anywhere',
      city: 'Nowhere',
      center: [1, 2],
      zoom: 13,
      focus: { it: 'ovunque', en: 'anywhere' },
    })
    expect(parseProjectPack(JSON.parse(serializePack(derived))).ok).toBe(true)
    expect(derived.id).toBe('pack_dz_anywhere_0001')
    expect(derived.events).toEqual([])
    expect(derived.themes.length).toBe(9)
  })

  it('exports a pack and reimports it byte-for-byte as data', () => {
    const json = serializePack(TESTVILLE_PACK)
    const parsed = parsePackJson(json)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.pack.id).toBe('testville_demo')
    expect(parsed.pack.themes).toHaveLength(2)
    expect(serializePack(parsed.pack)).toBe(json)
  })

  it('accepts plain strings for copy/labels on import (normalised to IT/EN)', () => {
    const raw = JSON.parse(JSON.stringify(TESTVILLE_PACK)) as Record<string, unknown>
    raw.copy = { title: 'Plain', subtitle: 'Plain', emptyState: 'Plain', sparseState: 'Plain' }
    const parsed = parseProjectPack(raw)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.pack.copy.title).toEqual({ it: 'Plain', en: 'Plain' })
  })

  it('rejects invalid packs with readable bilingual messages', () => {
    const tooMany = withColors(['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#56B4E9', '#D55E00', '#000000', '#999999'])
    const rejected = parseProjectPack(tooMany)
    expect(rejected.ok).toBe(false)
    const issue = rejected.issues.find((entry) => entry.code === 'pack.fabric.palette.max')
    expect(issue).toBeTruthy()
    expect(describePackIssue(issue!, 'it')).toContain('massimo 7')
    expect(describePackIssue(issue!, 'en')).toContain('at most 7')

    const unsafe = parseProjectPack(withColors(['#0072B2', '#FF00FF']))
    expect(unsafe.ok).toBe(false)
    expect(unsafe.issues.some((entry) => entry.code === 'pack.fabric.palette.unsafe')).toBe(true)
    expect(describePackIssue(unsafe.issues[0]!, 'it')).toContain('palette sicure')

    const badCurve = parseProjectPack({ ...TESTVILLE_PACK, fabric: { ...TESTVILLE_PACK.fabric, curvature: 8 } })
    expect(badCurve.ok).toBe(false)

    const badBbox = parseProjectPack({ ...TESTVILLE_PACK, territory: { bbox: [10, 20, 9, 21], center: [10, 20], zoom: 12 } })
    expect(badBbox.ok).toBe(false)

    const badEvent = parseProjectPack({
      ...TESTVILLE_PACK,
      eventTemplates: [{ ...TESTVILLE_PACK.eventTemplates[0]!, source: { url: '', retrievedAt: 'x' } }],
    })
    expect(badEvent.ok).toBe(false)
    expect(badEvent.issues.some((issue) => issue.code === 'pack.event.source')).toBe(true)

    expect(parsePackJson('{ broken')).toEqual({ ok: false, pack: null, issues: [{ code: 'pack.not_json', path: '' }] })
  })

  it('offers at least four colour-blind-safe palettes, capped at seven colours', () => {
    expect(PALETTE_PRESETS.length).toBeGreaterThanOrEqual(4)
    expect(new Set(PALETTE_PRESETS.map((preset) => preset.name)).size).toBe(PALETTE_PRESETS.length)
    for (const preset of PALETTE_PRESETS) {
      expect(preset.colors.length).toBeGreaterThanOrEqual(2)
      expect(preset.colors.length).toBeLessThanOrEqual(7)
      expect(new Set(preset.colors).size).toBe(preset.colors.length)
      for (const color of preset.colors) expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })
})
