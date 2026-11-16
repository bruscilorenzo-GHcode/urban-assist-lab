import { describe, expect, it } from 'vitest'
import { MY_STORIES_KEY, loadMyStories, saveMyStories } from '../src/assist-urban/my-stories'

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value) },
    raw: map,
  }
}

describe('my stories · local delete tokens', () => {
  it('round-trips the author token map', () => {
    const storage = memoryStorage()
    const stories = { st_aaaaaaaaaaaaaaaa: 'token-a', st_bbbbbbbbbbbbbbbb: 'token-b' }
    saveMyStories(stories, storage)
    expect(loadMyStories(storage)).toEqual(stories)
    expect(storage.raw.get(MY_STORIES_KEY)).toContain('token-a')
  })

  it('ignores malformed or foreign entries', () => {
    const storage = memoryStorage()
    storage.raw.set(MY_STORIES_KEY, JSON.stringify({
      st_aaaaaaaaaaaaaaaa: 'token',
      nope: 'token',
      st_bbbbbbbbbbbbbbbb: 42,
    }))
    expect(loadMyStories(storage)).toEqual({ st_aaaaaaaaaaaaaaaa: 'token' })
    storage.raw.set(MY_STORIES_KEY, '{bad json')
    expect(loadMyStories(storage)).toEqual({})
    expect(loadMyStories(null)).toEqual({})
  })
})
