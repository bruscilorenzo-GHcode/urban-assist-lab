/** Delete tokens of the Dramaturgical Zones created from this browser.
 *
 *  Shared zones are readable by every collaborator, but only the browser that
 *  created one holds its token, so only the author can delete it. */

export const ZONE_TOKENS_KEY = 'assist-urban.zone-tokens.v1'

export type ZoneTokens = Record<string, string>

export function loadZoneTokens(storage: Pick<Storage, 'getItem'> | null | undefined): ZoneTokens {
  if (!storage) return {}
  try {
    const raw = storage.getItem(ZONE_TOKENS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const tokens: ZoneTokens = {}
    for (const [id, token] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof id === 'string' && id.startsWith('dz_') && typeof token === 'string' && token.length > 0) {
        tokens[id] = token
      }
    }
    return tokens
  } catch {
    return {}
  }
}

export function saveZoneTokens(tokens: ZoneTokens, storage: Pick<Storage, 'setItem'> | null | undefined): void {
  if (!storage) return
  try {
    storage.setItem(ZONE_TOKENS_KEY, JSON.stringify(tokens))
  } catch {
    // private mode / quota: the current session can still manage its zones
  }
}
