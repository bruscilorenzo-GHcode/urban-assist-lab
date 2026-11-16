/** The State engine. Pure, deterministic, server-side: stories in, weighted
 *  corpus + fabric + template explanation out. The corpus is NEVER filtered
 *  destructively — non-matching stories stay as attenuated context. */

import type { Lang } from '../types.js'
import type { CalendarSnapshot, EventInstance } from '../calendar/types.js'
import { resolveInstance } from '../calendar/recurrence.js'
import type { ProjectPack, ThemeDefinition } from '../packs/types.js'
import { haversineMeters, pointFromCell, storyDay } from './geo.js'
import { explainEdge, explainState } from './explain.js'
import {
  buildTextIndex,
  documentFrequencyFor,
  matchText,
  matchTheme,
  type StoryTextIndex,
  type TextMatch,
} from './text.js'
import {
  RELATION_TYPES,
  type Coverage,
  type FabricEdge,
  type FabricNode,
  type FabricZone,
  type Query,
  type RelationType,
  type ResolvedFilter,
  type State,
  type ThemeSuggestion,
} from './types.js'

export interface StateStory {
  id: string
  text: string
  ts: string
  lang: string
  dz: string | null
  geo: { index: string; res: number } | null
  author_pseudonym: string
  media: Array<{ kind: string; caption?: string; timeline?: string }>
}

export interface ComputeInput {
  stories: StateStory[]
  pack: ProjectPack
  calendar: CalendarSnapshot
  query: Query
  options?: { lang?: Lang; dzId?: string; now?: Date }
}

const SPARSE_THRESHOLD = 5
const MAX_EDGES = 240
const MAX_EDGES_PER_NODE = 8

function isoDay(value: string | undefined): string | null {
  if (!value) return null
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return Number.isNaN(date.getTime()) ? null : match[0]!
}

function activeThemeId(query: Query): string | undefined {
  return query.kind === 'theme' ? query.themeId : query.kind === 'free' ? query.themeId : undefined
}

function activeText(query: Query): string {
  if (query.kind === 'search') return query.text.trim()
  if (query.kind === 'free') return (query.text ?? '').trim()
  return ''
}

function activeEventId(query: Query): string | undefined {
  return query.kind === 'event' ? query.eventId : query.kind === 'free' ? query.eventId : undefined
}

function requestedYear(query: Query, calendar: CalendarSnapshot): number | undefined {
  if (query.kind === 'event') return query.year ?? calendar.year
  if (query.kind === 'free') return query.year ?? calendar.year
  return calendar.year
}

function resolveEvent(calendar: CalendarSnapshot, eventId: string, year: number): EventInstance | null {
  const fromSnapshot = calendar.instances.find((instance) => instance.templateId === eventId && instance.year === year)
  if (fromSnapshot) return fromSnapshot
  const template = calendar.templates.find((candidate) => candidate.id === eventId)
  return template ? resolveInstance(template, year) : null
}

function themeVocabulary(theme: ThemeDefinition): string[] {
  return [...theme.categories, ...theme.keywords]
}

function localizedTheme(theme: ThemeDefinition | undefined, lang: Lang): string {
  if (!theme) return ''
  return lang === 'en' ? theme.label.en : theme.label.it
}

interface Detail {
  story: StateStory
  index: StoryTextIndex
  point: [number, number] | null
  cell: string | null
  day: string | null
  themeScores: Map<string, { score: number; matched: string[] }>
  text: TextMatch
  qualify: boolean
  weight: number
  matchedTerms: string[]
}

export function computeState(input: ComputeInput): State {
  const { stories, pack, calendar, query } = input
  const lang: Lang = input.options?.lang ?? 'it'
  const dzId = input.options?.dzId ?? pack.territoryId
  const now = input.options?.now ?? new Date()

  const themeId = activeThemeId(query)
  const theme = themeId ? pack.themes.find((candidate) => candidate.id === themeId) : undefined
  const themeActive = !!theme
  const text = activeText(query)
  const textActive = text.length > 0
  const eventId = activeEventId(query)
  const event = eventId ? resolveEvent(calendar, eventId, requestedYear(query, calendar) ?? calendar.year) : null

  const notes: string[] = []
  notes.push(lang === 'en'
    ? 'lexical + entity fallback: no embeddings configured; captions and timelines included, audio transcriptions excluded'
    : 'fallback lessicale + entità: nessun embedding configurato; didascalie e timeline incluse, trascrizioni audio escluse')
  if (themeId && !theme) notes.push(lang === 'en' ? `theme ${themeId} not declared in this pack` : `tema ${themeId} non dichiarato in questo pack`)
  if (eventId && !event) notes.push(lang === 'en' ? `event ${eventId} not in this territory calendar` : `evento ${eventId} non nel calendario di questo territorio`)

  const explicitFrom = query.kind === 'free' ? isoDay(query.from) : null
  const explicitTo = query.kind === 'free' ? isoDay(query.to) : null
  const eventFrom = event && event.from ? event.from : null
  const eventTo = event && event.to ? event.to : null
  const fromCandidates = [eventFrom, explicitFrom].filter((value): value is string => !!value)
  const toCandidates = [eventTo, explicitTo].filter((value): value is string => !!value)
  const windowFrom = fromCandidates.length ? fromCandidates.sort().at(-1)! : null
  const windowTo = toCandidates.length ? toCandidates.sort()[0]! : null
  const window = windowFrom || windowTo
    ? { from: windowFrom ?? '0000-01-01', to: windowTo ?? '9999-12-31' }
    : undefined

  const indexes = stories.map((story) => buildTextIndex([
    story.text,
    ...story.media.map((media) => media.caption),
    ...story.media.map((media) => media.timeline),
  ]))
  const documentFrequency = documentFrequencyFor(indexes)
  const corpusSize = Math.max(1, stories.length)

  const details: Detail[] = stories.map((story, position) => {
    const index = indexes[position]!
    const themeScores = new Map<string, { score: number; matched: string[] }>()
    for (const candidate of pack.themes) {
      themeScores.set(candidate.id, matchTheme(themeVocabulary(candidate), index))
    }
    const textMatch = textActive ? matchText(text, index, documentFrequency, corpusSize) : { score: 1, matched: [] }
    const activeThemeMatch = themeActive ? themeScores.get(theme.id) ?? { score: 0, matched: [] } : { score: 1, matched: [] }
    const day = storyDay(story.ts)
    const timeScore = window ? (day && day >= window.from && day <= window.to ? 1 : 0) : 1
    const qualify = (!textActive || textMatch.score > 0)
      && (!themeActive || activeThemeMatch.score > 0)
      && (!window || timeScore > 0)
    const partial = 0.5 * textMatch.score + 0.3 * activeThemeMatch.score + 0.2 * timeScore
    const weight = stories.length === 0
      ? 0
      : !themeActive && !textActive && !window
        ? 1
        : qualify
          ? 0.45 + 0.55 * partial
          : Math.min(0.2, 0.04 + 0.16 * partial)
    const matchedTerms = themeActive
      ? [...new Set([...activeThemeMatch.matched, ...textMatch.matched])]
      : [...new Set(textMatch.matched)]
    return {
      story,
      index,
      point: pointFromCell(story.geo?.index),
      cell: story.geo?.index ?? null,
      day,
      themeScores,
      text: textMatch,
      qualify,
      weight,
      matchedTerms,
    }
  })

  const matched = details.filter((detail) => detail.qualify).length
  const total = stories.length
  const sparse = matched < SPARSE_THRESHOLD

  const nodeByStory = new Map<string, FabricNode>()
  for (const detail of details) {
    const themeIds = pack.themes
      .filter((candidate) => (detail.themeScores.get(candidate.id)?.score ?? 0) > 0)
      .map((candidate) => candidate.id)
    nodeByStory.set(detail.story.id, {
      storyId: detail.story.id,
      weight: Number(detail.weight.toFixed(3)),
      band: detail.qualify ? 'foreground' : 'context',
      point: detail.point,
      cell: detail.cell,
      ts: detail.story.ts || null,
      lang: detail.story.lang || null,
      author: detail.story.author_pseudonym,
      mediaKinds: [...new Set(detail.story.media.map((media) => media.kind))],
      themeIds,
      matchedTerms: detail.matchedTerms.slice(0, 8),
      excerpt: detail.story.text.slice(0, 140),
      noGeo: detail.point === null,
    })
  }

  const nodes = [...nodeByStory.values()].sort((a, b) => {
    if (a.band !== b.band) return a.band === 'foreground' ? -1 : 1
    return b.weight - a.weight || a.storyId.localeCompare(b.storyId)
  })

  const themesById = new Map(pack.themes.map((candidate) => [candidate.id, candidate]))
  const relationCounts = new Map<RelationType, number>()
  const candidates: FabricEdge[] = []
  for (let i = 0; i < details.length; i += 1) {
    for (let j = i + 1; j < details.length; j += 1) {
      const left = details[i]!
      const right = details[j]!
      const band = left.qualify && right.qualify ? 'foreground' : 'context'
      const add = (type: RelationType, weight: number, explanation: string) => {
        if (weight < 0.15) return
        relationCounts.set(type, (relationCounts.get(type) ?? 0) + 1)
        candidates.push({
          id: `${type}:${left.story.id}:${right.story.id}`,
          from: left.story.id,
          to: right.story.id,
          type,
          weight: Number(weight.toFixed(3)),
          band,
          explanation,
        })
      }

      if (left.point && right.point) {
        const meters = haversineMeters(left.point, right.point)
        if (meters <= pack.fabric.proximityMeters) {
          const weight = 0.35 + 0.65 * (1 - meters / pack.fabric.proximityMeters)
          add('proximity', weight, explainEdge({ type: 'proximity', meters, radiusM: pack.fabric.proximityMeters }, lang))
        }
      }
      if (left.cell && right.cell && left.cell === right.cell) {
        add('place', 0.9, explainEdge({ type: 'place', cell: left.cell }, lang))
      }
      const sharedTerms = [...left.index.tokens].filter((token) => right.index.tokens.has(token))
      const sharedEntities = [...left.index.entities].filter((entity) => right.index.entities.has(entity))
      if (sharedTerms.length >= 2 || sharedEntities.length >= 1) {
        const weight = Math.min(1, 0.3 + sharedTerms.length * 0.12 + (sharedEntities.length ? 0.15 : 0))
        add('cooccurrence', weight, explainEdge({ type: 'cooccurrence', sharedTerms: [...sharedEntities, ...sharedTerms].slice(0, 4) }, lang))
      }
      const leftThemes = [...left.themeScores.entries()].filter(([, value]) => value.score > 0).map(([id]) => id)
      const rightThemes = new Set([...right.themeScores.entries()].filter(([, value]) => value.score > 0).map(([id]) => id))
      const sharedThemes = leftThemes.filter((id) => rightThemes.has(id))
      if (sharedThemes.length) {
        const labels = sharedThemes.slice(0, 3).map((id) => localizedTheme(themesById.get(id), lang)).filter(Boolean)
        add('topic', Math.min(1, 0.4 + sharedThemes.length * 0.2), explainEdge({ type: 'topic', sharedThemes: labels }, lang))
      }
      if (left.story.author_pseudonym && left.story.author_pseudonym === right.story.author_pseudonym) {
        add('author_community', 0.75, explainEdge({ type: 'author_community' }, lang))
      }
    }
  }

  const sorted = candidates.sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id))
  const perNode = new Map<string, number>()
  const edges: FabricEdge[] = []
  for (const edge of sorted) {
    if (edges.length >= MAX_EDGES) break
    const leftCount = perNode.get(edge.from) ?? 0
    const rightCount = perNode.get(edge.to) ?? 0
    if (leftCount >= MAX_EDGES_PER_NODE || rightCount >= MAX_EDGES_PER_NODE) continue
    edges.push(edge)
    perNode.set(edge.from, leftCount + 1)
    perNode.set(edge.to, rightCount + 1)
  }

  const zoneMap = new Map<string, Omit<FabricZone, 'explanation'>>()
  for (const detail of details) {
    if (!detail.qualify || !detail.point || !detail.cell) continue
    const current = zoneMap.get(detail.cell)
    if (current) {
      current.count += 1
      current.weight = Number(Math.max(current.weight, detail.weight).toFixed(3))
    } else {
      zoneMap.set(detail.cell, {
        cell: detail.cell,
        center: detail.point,
        count: 1,
        weight: Number(detail.weight.toFixed(3)),
      })
    }
  }
  const zones = [...zoneMap.values()]
    .sort((a, b) => b.count - a.count || b.weight - a.weight)
    .slice(0, 24)
    .map((zone) => ({
      ...zone,
      explanation: lang === 'en'
        ? `${zone.count} relevant ${zone.count === 1 ? 'story' : 'stories'} in cell ${zone.cell}`
        : `${zone.count} storie rilevanti nella cella ${zone.cell}`,
    }))

  const suggestions: ThemeSuggestion[] = []
  if (matched === 0) {
    for (const candidate of pack.themes) {
      if (candidate.id === themeId) continue
      const count = details.filter((detail) => (detail.themeScores.get(candidate.id)?.score ?? 0) > 0).length
      if (count > 0) suggestions.push({ themeId: candidate.id, label: candidate.label, count })
    }
    suggestions.sort((a, b) => b.count - a.count)
    suggestions.splice(3)
  }

  const geoForeground = details.filter((detail) => detail.qualify && detail.point).length
  const degradedReasons: string[] = []
  if (total < SPARSE_THRESHOLD) degradedReasons.push('few_stories')
  if (matched < SPARSE_THRESHOLD) degradedReasons.push('few_foreground')
  if (matched > 0 && geoForeground === 0) degradedReasons.push('no_geo')
  if (matched <= 1) degradedReasons.push('single_story')
  if (edges.length === 0) degradedReasons.push('no_edges')

  const relations = RELATION_TYPES.map((type) => {
    if (type === 'semantic') {
      return { type, available: false, count: 0, reason: 'no_embeddings' }
    }
    const count = edges.filter((edge) => edge.type === type).length
    return { type, available: count > 0, count }
  })

  const resolvedFilter: ResolvedFilter = {
    places: [...new Set([dzId, pack.territoryId])].filter(Boolean),
    ...(theme ? { categories: [...theme.categories], themeId: theme.id } : {}),
    ...(window ? { timeWindow: window } : {}),
    ...(textActive ? { textMatch: text } : {}),
    radiusM: pack.fabric.proximityMeters,
    matchMode: themeActive || textActive || window ? 'lexical+entities' : 'ordinary',
    ...(event ? { eventId: event.templateId } : {}),
    notes,
  }

  const activeParts = (themeActive ? 1 : 0) + (textActive ? 1 : 0) + (window ? 1 : 0)
  const explanation = explainState({
    lang,
    query,
    themeLabel: localizedTheme(theme, lang),
    event: event ?? undefined,
    window: window && window.from !== '0000-01-01' && window.to !== '9999-12-31' ? window : undefined,
    matched,
    total,
    sparse,
    suggestions,
    activeParts,
  })

  const coverage: Coverage = { matched, total, sparse }

  return {
    query,
    resolvedFilter,
    stories: nodes,
    fabric: {
      modes: ['filaments', 'field'],
      excludedModes: ['weave'],
      nodes,
      edges,
      zones,
      indicators: {
        stories: total,
        foreground: matched,
        context: total - matched,
        edges: edges.length,
        sparse,
        degradedReasons,
      },
      relations,
    },
    explanation,
    coverage,
    suggestions,
    lang,
    computedAt: now.toISOString(),
  }
}

/** Re-exported so callers can declare the lexical mode next to the state. */
export const STATE_MATCH_MODE = 'lexical+entities' as const

export type { StoryTextIndex }
