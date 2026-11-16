/** Story-record persistence helpers.
 *
 *  The story API keeps the published records in Netlify Blobs so a pilot's
 *  uploads survive a reload and the partners in Scicli / Napoli Est see the
 *  same wall. Only the already-sanitised record is stored: scrubbed text, an
 *  anonymous grid cell (or no geo), a pseudonym and opaque media ids — never
 *  exact coordinates or filenames. */

export const STORIES_STORE = 'assist-urban-stories'
export const MAX_STORED_STORIES = 48

const DZ_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/

export function normalizeDz(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return DZ_RE.test(value) ? value : null
}

export function storyPrefix(dz: string): string {
  return `dz:${dz}:`
}

/** Lexicographic key = DZ scope + zero-padded time + story id, so `list`
 *  returns oldest → newest and the newest can be taken from the tail. */
export function storyKey(story: { id: string, dz?: string | null }, now = Date.now()): string {
  return `${storyPrefix(story.dz ?? 'none')}${String(now).padStart(13, '0')}:${story.id}`
}

/** Newest first for the client wall. */
export function newestFirst<T>(items: T[]): T[] {
  return items.slice().reverse()
}
