/** Last loaded stories per DZ, so the already-loaded map and wall stay
 *  consultable offline. Only public story records are cached; media bytes stay
 *  in the browser cache/Blobs. Bounded and local to the device. */

import type { PublishedStory } from './story.js'

export const STORY_CACHE_KEY = 'assist-urban.story-cache.v1'

interface CacheEntry {
  stories: PublishedStory[]
  at: string
}

type ReadStorage = Pick<Storage, 'getItem'>
type WriteStorage = Pick<Storage, 'getItem'> & Pick<Storage, 'setItem'>

export function isPublishedStory(value: unknown): value is PublishedStory {
  if (!value || typeof value !== 'object') return false
  const story = value as Partial<PublishedStory>
  return typeof story.id === 'string'
    && typeof story.text === 'string'
    && typeof story.ts === 'string'
    && (story.dz === null || typeof story.dz === 'string')
    && Array.isArray(story.media)
}

export function loadCachedStories(dz: string, storage: ReadStorage | null | undefined): { stories: PublishedStory[]; at: string } | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(STORY_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, CacheEntry> | null
    const entry = parsed?.[dz]
    if (!entry || !Array.isArray(entry.stories)) return null
    const stories = entry.stories.filter(isPublishedStory)
    return stories.length ? { stories, at: typeof entry.at === 'string' ? entry.at : '' } : null
  } catch {
    return null
  }
}

export function cacheStories(dz: string, stories: PublishedStory[], storage: WriteStorage | null | undefined): void {
  if (!storage) return
  try {
    const raw = storage.getItem(STORY_CACHE_KEY)
    const parsed = raw ? JSON.parse(raw) as Record<string, CacheEntry> : {}
    parsed[dz] = { stories: stories.filter(isPublishedStory).slice(0, 48), at: new Date().toISOString() }
    const entries = Object.entries(parsed).slice(-4)
    storage.setItem(STORY_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    // Quota / private mode: the online wall still works.
  }
}
