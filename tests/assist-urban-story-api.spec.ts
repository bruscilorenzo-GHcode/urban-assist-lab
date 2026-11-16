import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({
  setJSON: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@netlify/blobs', () => ({ getStore: () => store }))

import handler from '../netlify/functions/story'

const NOTE = {
  text: 'Una storia a Scicli, chiama 514-555-0123',
  ts: '2026-11-05T09:00:00Z',
  lang: 'it',
  dz: 'scicli',
  lat: 36.7931,
  lon: 14.7073,
}

function post(note: Record<string, unknown> = NOTE): Request {
  return new Request('https://example.test/api/story', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ note, consent: { geo_mode: 'grid', allow_dispatch: true } }),
  })
}

beforeEach(() => {
  store.setJSON.mockReset().mockResolvedValue(undefined)
  store.get.mockReset()
  store.list.mockReset().mockResolvedValue({ blobs: [] })
  store.delete.mockReset().mockResolvedValue(undefined)
})

describe('story API', () => {
  it('publishes, scrubs and persists the sanitised record under the DZ', async () => {
    const res = await handler(post(), {} as never)
    expect(res.status).toBe(200)
    const body = await res.json() as { story: Record<string, unknown>; editToken?: string }
    expect(body.story.dz).toBe('scicli')
    expect(body.editToken).toMatch(/^[a-f0-9]{32}$/)
    expect(store.setJSON).toHaveBeenCalledTimes(1)
    const [key, value] = store.setJSON.mock.calls[0]!
    expect(key).toMatch(/^dz:scicli:\d{13}:st_[a-f0-9]{16}$/)
    const blob = JSON.stringify(value)
    expect(blob).not.toContain('514-555-0123')
    expect(blob).not.toMatch(/"(?:lat|lon|latitude|longitude)"\s*:/)
    expect(blob).toContain('gr_r8_')
    expect(blob).toContain(body.editToken!)
  })

  it('returns the newest stored stories of a DZ', async () => {
    const story = { id: 'st_1', dz: 'scicli', text: 'storia', ts: 't', media: [], editToken: 'secret' }
    store.list.mockResolvedValue({ blobs: [{ key: 'dz:scicli:0000000000001:st_1' }, { key: 'dz:scicli:0000000000002:st_2' }] })
    store.get.mockResolvedValue(story)
    const res = await handler(new Request('https://example.test/api/story?dz=scicli'), {} as never)
    expect(res.status).toBe(200)
    const body = await res.json() as { stories: Array<Record<string, unknown>> }
    expect(body.stories).toHaveLength(2)
    expect(body.stories[0]!.editToken).toBeUndefined()
    expect(store.get).toHaveBeenCalledWith('dz:scicli:0000000000002:st_2', { type: 'json' })
  })

  it('rejects a missing or malformed DZ on GET', async () => {
    const missing = await handler(new Request('https://example.test/api/story'), {} as never)
    expect(missing.status).toBe(400)
    const bad = await handler(new Request('https://example.test/api/story?dz=Montr%C3%A9al/..'), {} as never)
    expect(bad.status).toBe(400)
  })

  it('deletes only with the author token and removes the story media', async () => {
    const id = `st_${'a'.repeat(16)}`
    const key = `dz:scicli:0000000000001:${id}`
    store.list.mockResolvedValue({ blobs: [{ key }] })
    store.get.mockResolvedValue({ id, dz: 'scicli', editToken: 'right-token', text: 'x', ts: 't', media: [{ id: 'b'.repeat(18), kind: 'audio', size: 1 }] })
    const del = (token: string) => new Request('https://example.test/api/story', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, dz: 'scicli', token }),
    })
    const wrong = await handler(del('wrong-token'), {} as never)
    expect(wrong.status).toBe(403)
    expect(store.delete).not.toHaveBeenCalled()

    const ok = await handler(del('right-token'), {} as never)
    expect(ok.status).toBe(200)
    expect(store.delete).toHaveBeenCalledWith(key)
    expect(store.delete).toHaveBeenCalledWith(`media:${'b'.repeat(18)}`)
  })

  it('rejects malformed deletions and missing stories', async () => {
    const malformed = await handler(new Request('https://example.test/api/story', {
      method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'bad', dz: 'scicli', token: 't' }),
    }), {} as never)
    expect(malformed.status).toBe(400)
    store.list.mockResolvedValue({ blobs: [] })
    const missing = await handler(new Request('https://example.test/api/story', {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: `st_${'a'.repeat(16)}`, dz: 'scicli', token: 't' }),
    }), {} as never)
    expect(missing.status).toBe(404)
  })

  it('reports storage failure on GET but never fails a publication on it', async () => {
    store.list.mockRejectedValue(new Error('blobs down'))
    const failedList = await handler(new Request('https://example.test/api/story?dz=scicli'), {} as never)
    expect(failedList.status).toBe(503)

    store.setJSON.mockRejectedValue(new Error('blobs down'))
    const stillPublished = await handler(post(), {} as never)
    expect(stillPublished.status).toBe(200)
  })
})
