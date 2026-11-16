import { describe, expect, it, vi } from 'vitest'
import { geocodePlace, geocodePlaceInCity } from '../src/assist-urban/geocode'

const PHOTON = {
  features: [{
    geometry: { coordinates: [14.725, 36.925] },
    properties: { name: 'Ragusa Ibla', city: 'Ragusa', state: 'Sicilia', country: 'Italia' },
  }],
}

function fakeFetcher(body: unknown, status = 200) {
  return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(body), { status }))
}

describe('city geocoding for DZs', () => {
  it('finds the centre from the city name', async () => {
    const fetcher = fakeFetcher(PHOTON)
    const point = await geocodePlace('Ragusa', fetcher as unknown as typeof fetch)
    expect(point).toEqual({ lat: 36.925, lon: 14.725, label: 'Ragusa Ibla, Ragusa, Sicilia, Italia' })
    const url = String(fetcher.mock.calls[0]![0])
    expect(url).toContain('photon.komoot.io')
    expect(url).toContain('q=Ragusa')
    expect(url).not.toContain('lang=it')
  })

  it('returns null when the city is not found or the payload is broken', async () => {
    expect(await geocodePlace('Atlantide', fakeFetcher({ features: [] }) as unknown as typeof fetch)).toBeNull()
    expect(await geocodePlace('Ragusa', fakeFetcher({ features: [{ geometry: { coordinates: [999, 999] } }] }) as unknown as typeof fetch)).toBeNull()
    expect(await geocodePlace('Ragusa', fakeFetcher({}, 500) as unknown as typeof fetch)).toBeNull()
  })

  it('does not call the network for a too-short query', async () => {
    const fetcher = fakeFetcher(PHOTON)
    expect(await geocodePlace('R', fetcher as unknown as typeof fetch)).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
  })
})


const HAMRA = { features: [{ geometry: { coordinates: [35.48, 33.89] }, properties: { name: 'Hamra', city: 'Beirut', country: 'Libano' } }] }
const BEIRUT = { features: [{ geometry: { coordinates: [35.5018, 33.8938] }, properties: { name: 'Beirut', city: 'Beirut', country: 'Libano' } }] }

function router(hits: Record<string, unknown>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    for (const [needle, body] of Object.entries(hits)) {
      if (url.includes(needle)) return new Response(JSON.stringify(body), { status: 200 })
    }
    return new Response(JSON.stringify({ features: [] }), { status: 200 })
  })
}

describe('zones inside a city', () => {
  it('searches "zone, city" first so Hamra and Downtown differ in Beirut', async () => {
    const fetcher = router({ Hamra: HAMRA })
    const point = await geocodePlaceInCity('Hamra', 'Beirut', fetcher as unknown as typeof fetch)
    expect(point?.label).toBe('Hamra, Beirut, Libano')
    const url = String(fetcher.mock.calls[0]![0])
    expect(url).toContain('q=Hamra%2C%20Beirut')
  })

  it('falls back to the city when the neighbourhood is not found', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('%2C')) return new Response(JSON.stringify({ features: [] }), { status: 200 })
      return new Response(JSON.stringify(BEIRUT), { status: 200 })
    })
    const point = await geocodePlaceInCity('Quartiere inesistente', 'Beirut', fetcher as unknown as typeof fetch)
    expect(point?.label).toBe('Beirut, Beirut, Libano')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('does not duplicate the query when the zone is the city itself', async () => {
    const fetcher = router({ Beirut: BEIRUT })
    const point = await geocodePlaceInCity('Beirut', 'Beirut', fetcher as unknown as typeof fetch)
    expect(point?.label).toBe('Beirut, Beirut, Libano')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
