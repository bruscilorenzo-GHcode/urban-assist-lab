import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({
  setJSON: vi.fn(),
  set: vi.fn(),
  get: vi.fn(),
  getMetadata: vi.fn(),
  list: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@netlify/blobs', () => ({ getStore: () => store }))

import handler from '../netlify/functions/media-upload'

const SESSION = 'a'.repeat(18)

beforeEach(() => {
  store.setJSON.mockReset().mockResolvedValue(undefined)
  store.set.mockReset().mockResolvedValue(undefined)
  store.delete.mockReset().mockResolvedValue(undefined)
  store.get.mockReset().mockResolvedValue({ contentType: 'video/mp4', size: 12_000_000, chunks: 3 })
  store.list.mockReset().mockResolvedValue({
    blobs: [{ key: `chunk:${SESSION}:0` }, { key: `chunk:${SESSION}:2` }],
  })
})

describe('resumable chunk upload', () => {
  it('reports which chunks already arrived for a session', async () => {
    const res = await handler(new Request(`https://example.test/api/media-upload?session=${SESSION}`), {} as never)
    expect(res.status).toBe(200)
    const body = await res.json() as { id: string; chunks: number; received: number[] }
    expect(body.id).toBe(SESSION)
    expect(body.chunks).toBe(3)
    expect(body.received).toEqual([0, 2])
    expect(store.list).toHaveBeenCalledWith({ prefix: `chunk:${SESSION}:` })
  })

  it('rejects a malformed session and an unknown one', async () => {
    expect((await handler(new Request('https://example.test/api/media-upload?session=nope'), {} as never)).status).toBe(400)
    store.get.mockResolvedValue(null)
    expect((await handler(new Request(`https://example.test/api/media-upload?session=${SESSION}`), {} as never)).status).toBe(404)
  })
})
