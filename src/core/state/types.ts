/** The one State model: a Query (theme / free text / event / free combination)
 *  resolves to a State. The corpus is never destructively filtered: every
 *  story gets a relevance weight and a band (`foreground` / `context`). */

import type { Lang, Localized } from '../types.js'

export type Query =
  | { kind: 'theme'; themeId: string }
  | { kind: 'search'; text: string }
  | { kind: 'event'; eventId: string; year?: number; from?: string; to?: string }
  | { kind: 'free';    text?: string; themeId?: string; eventId?: string; year?: number; from?: string; to?: string }

export type MatchMode = 'ordinary' | 'lexical+entities'

export interface ResolvedFilter {
  /** Territory / zone the state was computed for. */
  places?: string[]
  /** Pack theme categories that constrained the state. */
  categories?: string[]
  timeWindow?: { from: string; to: string }
  textMatch?: string
  radiusM?: number
  /** Why those stories and not others, declared. */
  matchMode?: MatchMode
  themeId?: string
  eventId?: string
  notes?: string[]
}

export type FabricBand = 'foreground' | 'context'

export type RelationType =
  | 'proximity'
  | 'place'
  | 'cooccurrence'
  | 'topic'
  | 'semantic'
  | 'author_community'

export interface FabricNode {
  storyId: string
  /** 0..1 relevance weight (context stays > 0 and is never removed). */
  weight: number
  band: FabricBand
  /** Cell centre from the anonymous grid index; null when not georeferenced. */
  point: [number, number] | null
  cell: string | null
  ts: string | null
  lang: string | null
  author: string
  mediaKinds: string[]
  themeIds: string[]
  matchedTerms: string[]
  /** First characters of the published (scrubbed) story, for the state list. */
  excerpt: string
  noGeo: boolean
}

export interface FabricEdge {
  id: string
  from: string
  to: string
  type: RelationType
  weight: number
  band: FabricBand
  /** Template string — never a language model. */
  explanation: string
}

export interface FabricZone {
  cell: string
  center: [number, number]
  count: number
  weight: number
  /** Template justification (server-side), e.g. "4 relevant stories in cell …". */
  explanation: string
}

export interface FabricIndicators {
  stories: number
  foreground: number
  context: number
  edges: number
  sparse: boolean
  /** Reasons the fabric is degraded (e.g. too few stories, missing geo). */
  degradedReasons: string[]
}

export interface FabricSnapshot {
  modes: Array<'filaments' | 'field'>
  /** `weave` is deliberately excluded by contract. */
  excludedModes: Array<'weave'>
  nodes: FabricNode[]
  edges: FabricEdge[]
  zones: FabricZone[]
  indicators: FabricIndicators
  relations: Array<{ type: RelationType; available: boolean; count: number; reason?: string }>
}

export interface Coverage {
  matched: number
  total: number
  sparse: boolean
}

export interface ThemeSuggestion {
  themeId: string
  label: Localized
  count: number
}

export interface State {
  query: Query
  resolvedFilter: ResolvedFilter
  /** All corpus stories, weighted; not a filtered subset. */
  stories: FabricNode[]
  fabric: FabricSnapshot
  explanation: string
  coverage: Coverage
  /** Present when nothing matched: explicit empty state with nearby themes. */
  suggestions: ThemeSuggestion[]
  lang: Lang
  computedAt: string
}

export interface FabricConfig {
  enabled: boolean
  /** 0..1 (UI shows 0–100%). */
  opacity: number
  mode: 'filaments' | 'field'
  palette: string[]
  curvature: number
  thickness: number
  halo: number
  nodeScale: number
  labelZoom: number
  fieldBandMeters: number
  relations: Record<RelationType, boolean>
  reducedMotion: boolean
}

export const RELATION_TYPES: RelationType[] = [
  'proximity',
  'place',
  'cooccurrence',
  'topic',
  'semantic',
  'author_community',
]
