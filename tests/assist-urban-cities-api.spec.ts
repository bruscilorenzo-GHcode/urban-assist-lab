import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({
  setJSON: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@netlify/blobs', () => ({ getStore: () => store }))

import handler from '../netlify/functions/cities'
import { makeCityId } from '../src/assist-urban/cities'

const CITY = { name: 'Ragusa', lat: 36.925, lon: 14.725, zoom: 12 }

function post(city: Record<string, unknown> = CITY): Request {
  return new Request('https://example.test/api/cities', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ city }),
  })
}

beforeEach(() => {
  store.setJSON.mockReset().mockResolvedValue(undefined)
  store.get.mockReset()
  store.list.mockReset().mockResolvedValue({ blobs: [] })
  store.delete.mockReset().mockResolvedValue(undefined)
})

describe('cities API', () => {
  it('creates a shared city with its geocoded centre', async () => {
    const res = await handler(post(), {} as never)
    expect(res.status).toBe(200)
    const body = await res.json() as { city: Record<string, unknown> }
    expect(body.city.id).toMatch(/^city_ragusa_[a-f0-9]{4}$/)
    expect(body.city.name).toBe('Ragusa')
    expect(body.city.center).toEqual([36.925, 14.725])
    expect(store.setJSON).toHaveBeenCalledWith(`city:${body.city.id}`, expect.objectContaining({ name: 'Ragusa' }))
    expect(makeCityId('Napoli Est')).toMatch(/^city_napoli_est_[a-f0-9]{4}$/)
  })

  it('lists cities for the selector', async () => {
    store.list.mockResolvedValue({ blobs: [{ key: 'city:city_ragusa_ab12' }] })
    store.get.mockResolvedValue({ id: 'city_ragusa_ab12', name: 'Ragusa', center: [36.925, 14.725], zoom: 12, createdAt: 't' })
    const res = await handler(new Request('https://example.test/api/cities'), {} as never)
    expect(res.status).toBe(200)
    const body = await res.json() as { cities: Array<Record<string, unknown>> }
    expect(body.cities).toHaveLength(1)
    expect(body.cities[0]!.name).toBe('Ragusa')
  })

  it('deduplicates a city by name, case-insensitively', async () => {
    store.list.mockResolvedValue({ blobs: [{ key: 'city:city_ragusa_ab12' }] })
    store.get.mockResolvedValue({ id: 'city_ragusa_ab12', name: 'Ragusa', center: [36.925, 14.725], zoom: 12, createdAt: 't' })
    const res = await handler(post({ ...CITY, name: 'ragusa' }), {} as never)
    expect(res.status).toBe(200)
    const body = await res.json() as { city: Record<string, unknown> }
    expect(body.city.id).toBe('city_ragusa_ab12')
    expect(store.setJSON).not.toHaveBeenCalled()
  })

  it('rejects a short name or invalid coordinates', async () => {
    expect((await handler(post({ ...CITY, name: 'R' }), {} as never)).status).toBe(400)
    expect((await handler(post({ ...CITY, lat: 200 }), {} as never)).status).toBe(400)
  })
})
