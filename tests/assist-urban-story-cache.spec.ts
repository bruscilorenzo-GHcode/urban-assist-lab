import { describe, expect, it } from 'vitest'
import { STORY_CACHE_KEY, cacheStories, loadCachedStories } from '../src/assist-urban/story-cache'
import type { PublishedStory } from '../src/assist-urban/story'

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value) },
    raw: map,
  }
}

function story(id: string, dz = 'dz_demo_01'): PublishedStory {
  return {
    id,
    author_pseudonym: 'anon_x',
    text: 'Una storia',
    text_hash: 'sha256:x',
    lang: 'it',
    ts: '2026-11-14T10:00:00Z',
    geo: { index: 'gr_r8_10.0000_20.0000', res: 8 },
    dz,
    comparative: false,
    media: [],
    scrubbed_terms: 0,
  }
}

describe('offline story cache', () => {
  it('round-trips the last wall per DZ', () => {
    const storage = memoryStorage()
    cacheStories('dz_demo_01', [story('st_a'), story('st_b')], storage)
    cacheStories('dz_other_02', [story('st_c', 'dz_other_02')], storage)
    expect(loadCachedStories('dz_demo_01', storage)?.stories.map((entry) => entry.id)).toEqual(['st_a', 'st_b'])
    expect(loadCachedStories('dz_other_02', storage)?.stories.map((entry) => entry.id)).toEqual(['st_c'])
    expect(storage.raw.get(STORY_CACHE_KEY)).toContain('st_a')
    expect(loadCachedStories('missing', storage)).toBeNull()
    expect(loadCachedStories('dz_demo_01', null)).toBeNull()
  })

  it('ignores malformed cache entries instead of crashing offline', () => {
    const storage = memoryStorage()
    storage.raw.set(STORY_CACHE_KEY, '{bad json')
    expect(loadCachedStories('dz_demo_01', storage)).toBeNull()
    storage.raw.set(STORY_CACHE_KEY, JSON.stringify({ dz_demo_01: { at: 't', stories: [{ id: 42 }] } }))
    expect(loadCachedStories('dz_demo_01', storage)).toBeNull()
  })
})
