import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({
  setJSON: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@netlify/blobs', () => ({ getStore: () => store }))

import handler from '../netlify/functions/state'
import { TESTVILLE_PACK } from './fixtures/testville'

interface StoredStory {
  id: string
  text: string
  ts: string
  lang: string
  dz: string | null
  geo: { index: string; res: number } | null
  author_pseudonym: string
  media: Array<{ kind: string }>
}

const STORIES: StoredStory[] = [
  { id: 'st_a1', text: 'Il fiume e la riva nuova sono pieni di persone.', ts: '2026-06-01T10:00:00Z', lang: 'it', dz: 'scicli', geo: { index: 'gr_r8_36.7925_14.7075', res: 8 }, author_pseudonym: 'anon_a', media: [] },
  { id: 'st_a2', text: 'Acqua e fiume: la riva va pulita dalle plastiche.', ts: '2026-06-02T10:00:00Z', lang: 'it', dz: 'scicli', geo: { index: 'gr_r8_36.7930_14.7080', res: 8 }, author_pseudonym: 'anon_b', media: [] },
  { id: 'st_a3', text: 'La fontana del fiume non funziona più.', ts: '2026-06-03T10:00:00Z', lang: 'it', dz: 'scicli', geo: { index: 'gr_r8_36.7935_14.7085', res: 8 }, author_pseudonym: 'anon_c', media: [] },
  { id: 'st_a4', text: 'Il mercato del lavoro cerca turni al nuovo ufficio.', ts: '2026-05-01T10:00:00Z', lang: 'it', dz: 'scicli', geo: { index: 'gr_r8_36.7940_14.7090', res: 8 }, author_pseudonym: 'anon_d', media: [] },
  { id: 'st_a5', text: 'La chiesa e la processione di maggio.', ts: '2026-05-02T10:00:00Z', lang: 'it', dz: 'scicli', geo: null, author_pseudonym: 'anon_e', media: [] },
]

function byKey(key: string): StoredStory | null {
  if (key.startsWith('dz:scicli:')) {
    const id = key.split(':')[3]
    return STORIES.find((story) => story.id === id) ?? null
  }
  return null
}

beforeEach(() => {
  store.setJSON.mockReset().mockResolvedValue(undefined)
  store.delete.mockReset().mockResolvedValue(undefined)
  store.get.mockReset().mockImplementation(async (key: string) => byKey(key))
  store.list.mockReset().mockImplementation(async ({ prefix }: { prefix: string }) => {
    if (prefix === 'dz:scicli:') {
      return { blobs: STORIES.map((story, index) => ({ key: `dz:scicli:${String(index + 1).padStart(13, '0')}:${story.id}` })) }
    }
    return { blobs: [] }
  })
})

describe('state API · computed server-side', () => {
  it('returns the weighted corpus, the fabric and the template explanation', async () => {
    const res = await handler(new Request('https://example.test/api/state?dz=scicli&theme=acqua&lang=it'), {} as never)
    expect(res.status).toBe(200)
    const body = await res.json() as {
      state: { stories: Array<{ band: string; weight: number }>; coverage: { matched: number; total: number }; fabric: { edges: unknown[] }; explanation: string }
      pack: { id: string }
      calendar: { curated: boolean; instances: unknown[] }
    }
    expect(body.pack.id).toBe('scicli_demo')
    expect(body.state.coverage.total).toBe(5)
    expect(body.state.stories).toHaveLength(5)
    expect(body.state.coverage.matched).toBe(2)
    expect(body.state.stories.filter((story) => story.band === 'context')).toHaveLength(3)
    expect(body.state.stories.every((story) => story.weight > 0)).toBe(true)
    expect(body.state.explanation).toContain('fallback lessicale')
    expect(Array.isArray(body.state.fabric.edges)).toBe(true)
    expect(body.calendar.curated).toBe(true)
    expect(body.calendar.instances.length).toBeGreaterThan(0)
  })

  it('serves an explicit empty state (with context) when nothing matches', async () => {
    const res = await handler(new Request('https://example.test/api/state?dz=scicli&q=astronauti'), {} as never)
    const body = await res.json() as { state: { coverage: { matched: number; total: number }; explanation: string; suggestions: unknown[] } }
    expect(res.status).toBe(200)
    expect(body.state.coverage.matched).toBe(0)
    expect(body.state.coverage.total).toBe(5)
    expect(body.state.suggestions.length).toBeGreaterThan(0)
    expect(body.state.explanation).toContain('Nessuna storia corrisponde')
  })

  it('accepts a local PM pack over POST for a brand-new territory', async () => {
    const res = await handler(new Request('https://example.test/api/state', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dz: 'testville', pack: TESTVILLE_PACK, query: { kind: 'theme', themeId: 'acqua' }, lang: 'en' }),
    }), {} as never)
    expect(res.status).toBe(200)
    const body = await res.json() as {
      state: { coverage: { total: number }; explanation: string }
      pack: { id: string }
      calendar: { curated: boolean; instances: Array<{ templateId: string; status: string; source: { url: string } }> }
    }
    expect(body.pack.id).toBe('testville_demo')
    expect(body.state.coverage.total).toBe(0)
    expect(body.state.explanation).toContain('0 of 0')
    expect(body.calendar.curated).toBe(true)
    expect(body.calendar.instances[0]?.templateId).toBe('testville_festa_fiume')
    expect(body.calendar.instances[0]?.status).toBe('expected')
    expect(body.calendar.instances[0]?.source.url).toContain('example.invalid')
  })

  it('rejects missing/invalid zones and unknown packs explicitly', async () => {
    expect((await handler(new Request('https://example.test/api/state'), {} as never)).status).toBe(400)
    expect((await handler(new Request('https://example.test/api/state?dz=dz_missing_01'), {} as never)).status).toBe(404)
    expect((await handler(new Request('https://example.test/api/state?dz=scicli&pack=nope_01'), {} as never)).status).toBe(404)
    expect((await handler(new Request('https://example.test/api/state', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dz: 'scicli', pack: { id: 'broken' } }),
    }), {} as never)).status).toBe(400)
  })
})
