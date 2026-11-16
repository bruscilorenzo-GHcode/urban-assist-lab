import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({
  setJSON: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@netlify/blobs', () => ({ getStore: () => store }))

import handler from '../netlify/functions/telemetry'

function post(body: unknown): Request {
  return new Request('https://example.test/api/telemetry', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  store.setJSON.mockReset().mockResolvedValue(undefined)
  store.list.mockReset().mockResolvedValue({ blobs: [] })
  store.delete.mockReset().mockResolvedValue(undefined)
  store.get.mockReset()
})

describe('technical telemetry', () => {
  it('stores allow-listed technical keys only, never story text', async () => {
    const res = await handler(post({
      event: 'state.fetch',
      data: {
        build: 'abc123',
        status: 200,
        durationMs: 42,
        dz: 'scicli',
        text: 'Questa è la storia privata di un cittadino',
        story: 'st_secret',
        note: 'ok',
      },
    }), {} as never)
    expect(res.status).toBe(202)
    const stored = JSON.stringify(store.setJSON.mock.calls[0]![1])
    expect(stored).toContain('abc123')
    expect(stored).toContain('state.fetch')
    expect(stored).not.toContain('storia privata')
    expect(stored).not.toContain('st_secret')
  })

  it('rejects malformed event names and non-POST methods', async () => {
    expect((await handler(post({ event: 'X!' }), {} as never)).status).toBe(400)
    expect((await handler(new Request('https://example.test/api/telemetry'), {} as never)).status).toBe(405)
    const accepted = await handler(post({ event: 'state.fetch', data: ['not', 'an', 'object'] }), {} as never)
    expect(accepted.status).toBe(202)
    expect(store.setJSON.mock.calls[0]![1]).toEqual(expect.objectContaining({ event: 'state.fetch', data: {} }))
  })

  it('prunes old events to a bounded log', async () => {
    store.list.mockResolvedValue({ blobs: [{ key: 'ev:0000000000001:aaaa' }, { key: 'ev:0000000000002:bbbb' }] })
    const res = await handler(post({ event: 'app.boot', data: { build: 'abc' } }), {} as never)
    expect(res.status).toBe(202)
    expect(store.delete).not.toHaveBeenCalled()
  })
})
