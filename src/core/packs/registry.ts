/** Pack resolution, city-agnostic: id → seed/stored pack, territory → pack,
 *  no pack → derived from the zone. */

import { derivePackFromZone, zoneTerritoryId } from './derive.js'
import { SEED_PACKS } from './seeds.js'
import type { ProjectPack, ZoneLike } from './types.js'

export function findSeedPack(id: string): ProjectPack | null {
  return SEED_PACKS.find((pack) => pack.id === id) ?? null
}

export function findPack(id: string, stored: ProjectPack[] = []): ProjectPack | null {
  return stored.find((pack) => pack.id === id) ?? findSeedPack(id)
}

/** Default curated pack for a territory, if one is declared as data. */
export function packForTerritory(zone: ZoneLike, stored: ProjectPack[] = []): ProjectPack | null {
  const territoryId = zoneTerritoryId(zone)
  return stored.find((pack) => pack.territoryId === territoryId)
    ?? SEED_PACKS.find((pack) => pack.territoryId === territoryId)
    ?? SEED_PACKS.find((pack) => pack.territoryId === zone.id)
    ?? null
}

/** Never leave a zone without an emergent state. */
export function resolvePackForZone(
  zone: ZoneLike,
  options: { packId?: string | null; stored?: ProjectPack[] } = {},
): ProjectPack {
  const stored = options.stored ?? []
  if (options.packId) {
    const explicit = findPack(options.packId, stored)
    if (explicit) return explicit
  }
  return packForTerritory(zone, stored) ?? derivePackFromZone(zone)
}
