import { describe, expect, it } from 'vitest'
import { parseUrlParams, serializeUrlParams, stateRequestParams } from '../src/core/state/url'

describe('shareable state URLs', () => {
  it('round-trips theme, text, event, window, dz, pack, pm and fabric', () => {
    const search = '?theme=acqua&q=fiume&event=testville_festa_fiume&from=2026-06-01&to=2026-06-02&dz=dz_test_01&pack=testville_demo&pm=1&fab=1&fm=field&fo=70'
    const parsed = parseUrlParams(search)
    expect(parsed.query).toEqual({
      kind: 'free',
      themeId: 'acqua',
      text: 'fiume',
      eventId: 'testville_festa_fiume',
      from: '2026-06-01',
      to: '2026-06-02',
    })
    expect(parsed.dz).toBe('dz_test_01')
    expect(parsed.pack).toBe('testville_demo')
    expect(parsed.pm).toBe(true)
    expect(parsed.fabric).toEqual({ on: true, mode: 'field', opacity: 0.7 })

    const again = parseUrlParams(serializeUrlParams(parsed))
    expect(again).toEqual(parsed)
  })

  it('keeps single-source queries typed and an empty search ordinary', () => {
    expect(parseUrlParams('?theme=acqua').query).toEqual({ kind: 'theme', themeId: 'acqua' })
    expect(parseUrlParams('?q=fiume').query).toEqual({ kind: 'search', text: 'fiume' })
    expect(parseUrlParams('?event=testville_festa_fiume&year=2026').query)
      .toEqual({ kind: 'event', eventId: 'testville_festa_fiume', year: 2026 })
    expect(parseUrlParams('').query).toEqual({ kind: 'free' })
    expect(parseUrlParams('').pm).toBe(false)
    expect(serializeUrlParams({ pm: false, query: { kind: 'free' }, fabric: {} })).toBe('')
  })

  it('rejects malformed ids and clamps opacity', () => {
    const parsed = parseUrlParams('?theme=Bad/../id&dz=../etc&pack=UPPER&fo=140')
    expect(parsed.query).toEqual({ kind: 'free' })
    expect(parsed.dz).toBeUndefined()
    expect(parsed.pack).toBeUndefined()
    expect(parsed.fabric.opacity).toBe(1)
  })

  it('round-trips the PM appearance so a palette/opacity link is shareable', () => {
    const parsed = parseUrlParams('?dz=dz_test_01&fab=1&fm=field&fo=55&pal=ocean_ink&cur=40&th=18&hal=30')
    expect(parsed.fabric).toEqual({ on: true, mode: 'field', opacity: 0.55, palette: 'ocean_ink', curvature: 0.4, thickness: 1.8, halo: 0.3 })
    expect(parseUrlParams(serializeUrlParams(parsed)).fabric).toEqual(parsed.fabric)
  })

  it('builds the same keys for the server request plus the UI language', () => {
    const params = new URLSearchParams(stateRequestParams({
      dz: 'dz_test_01',
      packId: 'testville_demo',
      query: { kind: 'free', themeId: 'acqua', text: 'fiume' },
      lang: 'en',
    }))
    expect(params.get('dz')).toBe('dz_test_01')
    expect(params.get('pack')).toBe('testville_demo')
    expect(params.get('theme')).toBe('acqua')
    expect(params.get('q')).toBe('fiume')
    expect(params.get('lang')).toBe('en')
  })
})
