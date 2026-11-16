import { describe, expect, it } from 'vitest'
import { ZONE_TOKENS_KEY, loadZoneTokens, saveZoneTokens } from '../src/assist-urban/my-zones'

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value) },
    raw: map,
  }
}

describe('my zones · local edit tokens', () => {
  it('round-trips the DZ token map', () => {
    const storage = memoryStorage()
    const tokens = { dz_ragusa_ab12: 'token-a', dz_napoli_cd34: 'token-b' }
    saveZoneTokens(tokens, storage)
    expect(loadZoneTokens(storage)).toEqual(tokens)
    expect(storage.raw.get(ZONE_TOKENS_KEY)).toContain('token-a')
  })

  it('ignores malformed or foreign entries', () => {
    const storage = memoryStorage()
    storage.raw.set(ZONE_TOKENS_KEY, JSON.stringify({ dz_ragusa_ab12: 'token', other: 'token', dz_napoli_cd34: 42 }))
    expect(loadZoneTokens(storage)).toEqual({ dz_ragusa_ab12: 'token' })
    storage.raw.set(ZONE_TOKENS_KEY, '{bad')
    expect(loadZoneTokens(storage)).toEqual({})
    expect(loadZoneTokens(null)).toEqual({})
  })
})
