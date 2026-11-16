import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({
  setJSON: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@netlify/blobs', () => ({ getStore: () => store }))

import handler from '../netlify/functions/packs'
import { TESTVILLE_PACK } from './fixtures/testville'

const COPY = { ...TESTVILLE_PACK, id: 'testville_copy', name: 'Testville copy' }

function post(body: unknown): Request {
  return new Request('https://example.test/api/packs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  store.setJSON.mockReset().mockResolvedValue(undefined)
  store.get.mockReset().mockResolvedValue(null)
  store.list.mockReset().mockResolvedValue({ blobs: [] })
  store.delete.mockReset().mockResolvedValue(undefined)
})

describe('packs API', () => {
  it('lists the seed packs for the PM panel', async () => {
    const res = await handler(new Request('https://example.test/api/packs'), {} as never)
    expect(res.status).toBe(200)
    const body = await res.json() as { packs: Array<{ id: string }> }
    expect(body.packs.map((pack) => pack.id)).toContain('scicli_demo')
    expect(body.packs.map((pack) => pack.id)).not.toContain('testville_demo')
  })

  it('saves a PM pack with a private token, then serves it without the token', async () => {
    const created = await handler(post({ pack: COPY }), {} as never)
    expect(created.status).toBe(200)
    const body = await created.json() as { pack: { id: string }; editToken: string }
    expect(body.pack.id).toBe('testville_copy')
    expect(body.editToken).toMatch(/^[a-f0-9]{32}$/)
    expect(store.setJSON).toHaveBeenCalledWith('pack:testville_copy', expect.objectContaining({ editToken: body.editToken }))

    store.list.mockResolvedValue({ blobs: [{ key: 'pack:testville_copy' }] })
    store.get.mockResolvedValue({ ...COPY, editToken: body.editToken })
    const listed = await handler(new Request('https://example.test/api/packs'), {} as never)
    const listedBody = await listed.json() as { packs: Array<Record<string, unknown>> }
    const saved = listedBody.packs.find((pack) => pack.id === 'testville_copy')
    expect(saved).toBeTruthy()
    expect(saved!.editToken).toBeUndefined()
  })

  it('keeps seed packs read-only and rejects a wrong edit token', async () => {
    const seed = await handler(post({ pack: { ...TESTVILLE_PACK, id: 'scicli_demo' } }), {} as never)
    expect(seed.status).toBe(409)

    store.get.mockResolvedValue({ ...COPY, editToken: 'right' })
    const wrong = await handler(post({ pack: { ...COPY, name: 'Changed' }, token: 'wrong' }), {} as never)
    expect(wrong.status).toBe(403)
    store.setJSON.mockClear()
    const ok = await handler(post({ pack: { ...COPY, name: 'Changed' }, token: 'right' }), {} as never)
    expect(ok.status).toBe(200)
    expect(store.setJSON).toHaveBeenCalledTimes(1)
  })

  it('rejects invalid packs with machine-readable issues', async () => {
    const res = await handler(post({ pack: { ...COPY, fabric: { ...COPY.fabric, curvature: 9 } } }), {} as never)
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string; issues: Array<{ code: string }> }
    expect(body.error).toBe('invalid pack')
    expect(body.issues.some((issue) => issue.code === 'pack.fabric.curvature')).toBe(true)
  })
})
