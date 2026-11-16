/** A pilot DZ created at runtime has no curated pack yet, but it must never be
 *  left without an emergent state: derive a default pack from the zone data
 *  (centre, zoom, focus), default themes and an explicitly empty calendar. */

import type { ProjectPack, ZoneLike } from './types.js'
import { DEFAULT_FABRIC, DEFAULT_THEMES, defaultCopy } from './defaults.js'

const ID_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/

function slug(text: string, fallback: string): string {
  const clean = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  return clean || fallback
}

export function derivedPackId(zoneId: string): string {
  const candidate = `pack_${slug(zoneId, 'zone')}`
  return candidate.length >= 2 && ID_RE.test(candidate) ? candidate : `pack_${slug(zoneId, 'zone').slice(0, 50)}`
}

/** Territory id a zone belongs to; stored packs are matched on this. */
export function zoneTerritoryId(zone: ZoneLike): string {
  return slug(zone.city || zone.name || zone.id, zone.id)
}

/** Approximate viewport bounds for a zoom level, only to give the pack a
 *  bbox: it is a framing box, never a citizen coordinate. */
function bboxForZoom(center: [number, number], zoom: number): [number, number, number, number] {
  const lat = Math.max(-85, Math.min(85, center[0]))
  const metersPerPixel = 156543.03392 * Math.cos((lat * Math.PI) / 180) / Math.pow(2, zoom)
  const halfHeight = (metersPerPixel * 360) / 2
  const halfWidth = (metersPerPixel * 520) / 2
  const dLat = halfHeight / 111_320
  const dLon = halfWidth / (111_320 * Math.max(0.15, Math.cos((lat * Math.PI) / 180)))
  const south = Math.max(-90, center[0] - dLat)
  const north = Math.min(90, center[0] + dLat)
  const west = Math.max(-180, center[1] - dLon)
  const east = Math.min(180, center[1] + dLon)
  return [Number(south.toFixed(6)), Number(west.toFixed(6)), Number(north.toFixed(6)), Number(east.toFixed(6))]
}

/** Default pack for any zone. Themes are the generic template and the calendar
 *  is empty *and declared* (`events: []` → "calendar not curated yet"). */
export function derivePackFromZone(zone: ZoneLike): ProjectPack {
  const name = zone.name.trim() || zone.city.trim() || zone.id
  return {
    id: derivedPackId(zone.id),
    name,
    territoryId: zoneTerritoryId(zone),
    territory: {
      bbox: bboxForZoom(zone.center, Math.round(zone.zoom)),
      center: [zone.center[0], zone.center[1]],
      zoom: Math.max(1, Math.min(19, Math.round(zone.zoom))),
    },
    themes: DEFAULT_THEMES.map((theme) => ({
      ...theme,
      label: { ...theme.label },
      categories: [...theme.categories],
      keywords: [...theme.keywords],
    })),
    eventTemplates: [],
    events: [],
    includeNational: false,
    fabric: {
      ...DEFAULT_FABRIC,
      palette: { ...DEFAULT_FABRIC.palette, colors: [...DEFAULT_FABRIC.palette.colors] },
    },
    copy: defaultCopy({ it: name, en: name }, zone.focus),
    defaults: {},
  }
}
