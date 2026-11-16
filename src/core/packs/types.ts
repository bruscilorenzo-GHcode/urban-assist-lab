/** Project pack: a territory and its reading. Data only — a new city or DZ is
 *  a new pack (or a pack derived from the zone), never new code. */

import type { EventTemplate } from '../calendar/types.js'
import type { Localized } from '../types.js'
import type { Query } from '../state/types.js'

export type FabricMode = 'filaments' | 'field'

export interface ThemeDefinition {
  id: string
  label: Localized
  /** Vocabulary of the theme; used because stories carry no category field. */
  categories: string[]
  keywords: string[]
}

export interface FabricPalette {
  name: string
  /** 2–7 colours, never a rainbow. */
  colors: string[]
}

export interface FabricPackConfig {
  defaultMode: FabricMode
  /** 0..1 */
  defaultOpacity: number
  palette: FabricPalette
  /** 0..1 */
  curvature: number
  fieldBandMeters: number
  fieldBandMinutes: number
  nodeScale: number
  /** 0.5..6 */
  thickness: number
  /** 0..1 */
  halo: number
  /** Labels only on hover or at/above this zoom. */
  labelZoom: number
  /** Proximity edge radius in metres. */
  proximityMeters: number
}

export interface PackCopy {
  title: Localized
  subtitle: Localized
  emptyState: Localized
  sparseState: Localized
}

export interface ProjectPack {
  id: string
  name: string
  /** Explicit association: every zone/pack resolves through this id. */
  territoryId: string
  /** [south, west, north, east] */
  territory: { bbox: [number, number, number, number]; center: [number, number]; zoom: number }
  themes: ThemeDefinition[]
  /** Event template ids allowed in this pack. */
  events: string[]
  /** Territory-specific event templates shipped as data with the pack, so a
   *  new city needs no deploy and no code: import the pack and the calendar
   *  resolves. Global national templates stay in the calendar seeds. */
  eventTemplates: EventTemplate[]
  /** Include `scope: 'national'` templates, with their uncertainty note. */
  includeNational: boolean
  fabric: FabricPackConfig
  copy: PackCopy
  defaults: { query?: Query; opacity?: number; mode?: FabricMode }
}

export interface PackIssue {
  code: string
  path: string
  params?: Record<string, string | number>
}

export type PackParseResult =
  | { ok: true; pack: ProjectPack; issues: [] }
  | { ok: false; pack: null; issues: PackIssue[] }

/** The subset of a Dramaturgical Zone needed to derive a default pack. */
export interface ZoneLike {
  id: string
  name: string
  city: string
  center: [number, number]
  zoom: number
  focus: Localized
}
