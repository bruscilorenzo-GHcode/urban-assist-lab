import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({
  setJSON: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@netlify/blobs', () => ({ getStore: () => store }))

import handler from '../netlify/functions/zones'

const ZONE = {
  name: 'Ragusa Ibla', city: 'Ragusa',
  focusIt: 'i vicoli di Ibla', focusEn: 'the alleys of Ibla',
  themeIt: 'memoria', themeEn: 'memory',
  lat: 36.925, lon: 14.725, zoom: 14,
}

function post(body: unknown): Request {
  return new Request('https://example.test/api/zones', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  store.setJSON.mockReset().mockResolvedValue(undefined)
  store.get.mockReset()
  store.list.mockReset().mockResolvedValue({ blobs: [] })
  store.delete.mockReset().mockResolvedValue(undefined)
})

describe('zones API', () => {
  it('creates a shared DZ and returns a private edit token', async () => {
    const res = await handler(post({ zone: ZONE }), {} as never)
    expect(res.status).toBe(200)
    const body = await res.json() as { zone: Record<string, unknown>; editToken: string }
    expect(body.zone.id).toMatch(/^dz_ragusa_ibla_[a-f0-9]{4}$/)
    expect(body.zone.origin).toBe('pilot')
    expect(body.editToken).toMatch(/^[a-f0-9]{32}$/)
    expect(store.setJSON).toHaveBeenCalledTimes(1)
    const [key, value] = store.setJSON.mock.calls[0]!
    expect(key).toBe(`zone:${body.zone.id}`)
    expect((value as { editToken?: string }).editToken).toBe(body.editToken)
  })

  it('serves every collaborator the zones without their tokens', async () => {
    store.list.mockResolvedValue({ blobs: [{ key: 'zone:dz_ragusa_ibla_ab12' }, { key: 'zone:dz_napoli_est_cd34' }] })
    store.get.mockResolvedValue({ ...ZONE, id: 'dz_ragusa_ibla_ab12', label: 'Ragusa Ibla · Ragusa', status: 'active', origin: 'pilot', focus: { it: ZONE.focusIt, en: ZONE.focusEn }, center: [ZONE.lat, ZONE.lon], themeHint: { it: ZONE.themeIt, en: ZONE.themeEn }, presets: [], createdAt: '2026-01-01', editToken: 'secret' })
    const res = await handler(new Request('https://example.test/api/zones'), {} as never)
    expect(res.status).toBe(200)
    const body = await res.json() as { zones: Array<Record<string, unknown>> }
    expect(body.zones).toHaveLength(2)
    expect(body.zones[0]!.editToken).toBeUndefined()
  })

  it('lets a pilot update a zone without a token but rejects a wrong supplied token', async () => {
    const id = 'dz_ragusa_ibla_ab12'
    store.get.mockResolvedValue({ ...ZONE, id, createdAt: '2026-01-01', editToken: 'right-token' })
    const updated = { ...ZONE, name: 'Ragusa Ibla Centro' }

    const wrong = await handler(post({ zone: updated, id, token: 'wrong-token' }), {} as never)
    expect(wrong.status).toBe(403)
    expect(store.setJSON).not.toHaveBeenCalled()

    const noToken = await handler(post({ zone: updated, id }), {} as never)
    expect(noToken.status).toBe(200)
    store.setJSON.mockClear()

    const ok = await handler(post({ zone: updated, id, token: 'right-token' }), {} as never)
    expect(ok.status).toBe(200)
    const body = await ok.json() as { zone: Record<string, unknown> }
    expect(body.zone.id).toBe(id)
    expect(body.zone.name).toBe('Ragusa Ibla Centro')
    expect(body.zone.createdAt).toBe('2026-01-01')
    expect(store.setJSON).toHaveBeenCalledWith(`zone:${id}`, expect.objectContaining({ editToken: 'right-token', name: 'Ragusa Ibla Centro' }))
  })

  it('lets a pilot delete a zone without a token but rejects a wrong supplied token', async () => {
    const id = 'dz_ragusa_ibla_ab12'
    store.get.mockResolvedValue({ ...ZONE, id, editToken: 'right-token' })
    const del = (token?: string) => new Request('https://example.test/api/zones', {
      method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, ...(token ? { token } : {}) }),
    })
    expect((await handler(del('wrong'), {} as never)).status).toBe(403)
    expect(store.delete).not.toHaveBeenCalled()
    expect((await handler(del(), {} as never)).status).toBe(200)
    expect(store.delete).toHaveBeenCalledWith(`zone:${id}`)
    store.delete.mockClear()
    expect((await handler(del('right-token'), {} as never)).status).toBe(200)
    expect(store.delete).toHaveBeenCalledWith(`zone:${id}`)
  })

  it('rejects an invalid DZ and unknown updates', async () => {
    const invalid = await handler(post({ zone: { ...ZONE, name: '' } }), {} as never)
    expect(invalid.status).toBe(400)
    store.get.mockResolvedValue(null)
    const missing = await handler(post({ zone: ZONE, id: 'dz_missing_ab12', token: 'tok' }), {} as never)
    expect(missing.status).toBe(404)
  })
})
