/** The delete tokens of the stories published from this browser.
 *
 *  The published record never exposes its token; the POST response returns it
 *  once, and we keep the id → token map locally so the author can delete their
 *  own stories later. Another browser, or a cleared storage, cannot delete. */

export const MY_STORIES_KEY = 'assist-urban.my-stories.v1'

export type MyStories = Record<string, string>

export function loadMyStories(storage: Pick<Storage, 'getItem'> | null | undefined): MyStories {
  if (!storage) return {}
  try {
    const raw = storage.getItem(MY_STORIES_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const stories: MyStories = {}
    for (const [id, token] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof id === 'string' && id.startsWith('st_') && typeof token === 'string' && token.length > 0) {
        stories[id] = token
      }
    }
    return stories
  } catch {
    return {}
  }
}

export function saveMyStories(stories: MyStories, storage: Pick<Storage, 'setItem'> | null | undefined): void {
  if (!storage) return
  try {
    storage.setItem(MY_STORIES_KEY, JSON.stringify(stories))
  } catch {
    // private mode / quota: the current session can still delete
  }
}
