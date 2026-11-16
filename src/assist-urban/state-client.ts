/** Client side of the emergent state: it asks the server for a finished
 *  State and caches the last one per DZ so the already-loaded map stays
 *  consultable offline. No relevance or similarity is computed here. */

import type { CalendarSnapshot } from '../core/calendar/types.js'
import type { ProjectPack } from '../core/packs/types.js'
import type { Query, State } from '../core/state/types.js'
import { stateRequestParams } from '../core/state/url.js'
import type { Lang } from '../core/types.js'

export interface StateBundle {
  state: State
  pack: ProjectPack
  calendar: CalendarSnapshot
}

export interface StateRequest {
  dz: string
  query: Query
  lang: Lang
  packId?: string
  packOverride?: ProjectPack
  year?: number
}

export const STATE_CACHE_KEY = 'assist-urban.state-cache.v1'

type CacheStore = Pick<Storage, 'getItem'> & Pick<Storage, 'setItem'>

interface CacheEntry {
  bundle: StateBundle
  at: string
}

function isBundle(value: unknown): value is StateBundle {
  if (!value || typeof value !== 'object') return false
  const bundle = value as Partial<StateBundle>
  return !!bundle.state
    && Array.isArray(bundle.state.stories)
    && !!bundle.state.fabric
    && !!bundle.pack
    && !!bundle.calendar
}

export async function fetchState(request: StateRequest, fetcher: typeof fetch = fetch): Promise<StateBundle> {
  let response: Response
  if (request.packOverride) {
    response = await fetcher('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dz: request.dz,
        query: request.query,
        pack: request.packOverride,
        lang: request.lang,
        ...(request.year ? { year: request.year } : {}),
      }),
    })
  } else {
    const params = stateRequestParams({
      dz: request.dz,
      ...(request.packId ? { packId: request.packId } : {}),
      query: request.query,
      lang: request.lang,
      ...(request.year ? { year: request.year } : {}),
    })
    response = await fetcher(`/api/state?${params}`)
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? `HTTP ${response.status}`)
  }
  const body = await response.json() as StateBundle
  if (!isBundle(body)) throw new Error('invalid state payload')
  return body
}

export function loadCachedState(dz: string, storage: CacheStore | null | undefined): { bundle: StateBundle; at: string } | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(STATE_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, CacheEntry> | null
    const entry = parsed?.[dz]
    if (!entry || !isBundle(entry.bundle) || typeof entry.at !== 'string') return null
    return { bundle: entry.bundle, at: entry.at }
  } catch {
    return null
  }
}

export function cacheState(bundle: StateBundle, dz: string, storage: CacheStore | null | undefined, at = new Date().toISOString()): void {
  if (!storage) return
  try {
    const raw = storage.getItem(STATE_CACHE_KEY)
    const parsed = raw ? JSON.parse(raw) as Record<string, CacheEntry> : {}
    parsed[dz] = { bundle, at }
    const entries = Object.entries(parsed).slice(-4)
    storage.setItem(STATE_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    // Quota / private mode: the online state still works.
  }
}
