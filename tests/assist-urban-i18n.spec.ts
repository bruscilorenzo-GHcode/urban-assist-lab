import { describe, expect, it } from 'vitest'
import { STR, UI_LANGS, type Strings } from '../src/assist-urban/i18n'

function shape(s: Strings, path: string): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(s)) {
    const p = path ? `${path}.${k}` : k
    if (typeof v === 'function') out.push(p)
    else if (typeof v === 'object' && v !== null && !('$$typeof' in v)) out.push(...shape(v as unknown as Strings, p))
    else out.push(p)
  }
  return out
}

describe('assist-urban i18n completeness', () => {
  it('has identical key sets across all UI languages', () => {
    const [base, ...rest] = UI_LANGS.map((l) => shape(STR[l], ''))
    for (const other of rest) expect(other.sort()).toEqual(base.slice().sort())
    expect(base.length).toBeGreaterThan(40)
  })

  it('exposes both languages with non-empty strings', () => {
    for (const lang of UI_LANGS) {
      expect(STR[lang].title.length).toBeGreaterThan(10)
      expect(STR[lang].submit).toBeTruthy()
      expect(STR[lang].privacy).toBeTruthy()
      expect(STR[lang].zoneLabel).toBe('Dramaturgical Zone')
      expect(STR[lang].newZone).toBeTruthy()
      expect(STR[lang].pilotHint.toLowerCase()).toContain('dramaturgical zone')
    }
  })
})
