import { describe, expect, it } from 'vitest'
import { buildCalendar } from '../src/core/calendar/recurrence'
import { computeState } from '../src/core/state/compute'
import type { Query } from '../src/core/state/types'
import { TESTVILLE_EVENTS, TESTVILLE_PACK, TESTVILLE_STORIES } from './fixtures/testville'

const calendar = buildCalendar(TESTVILLE_EVENTS, 'testville', 2026, false, TESTVILLE_PACK.events)
const NOW = new Date('2026-11-14T10:00:00Z')

function state(query: Query) {
  return computeState({
    stories: TESTVILLE_STORIES,
    pack: TESTVILLE_PACK,
    calendar,
    query,
    options: { lang: 'it', dzId: 'testville', now: NOW },
  })
}

describe('emergent state · server-side model', () => {
  it('keeps the whole corpus and attenuates context instead of filtering it out', () => {
    const filtered = state({ kind: 'theme', themeId: 'acqua' })
    expect(filtered.coverage.total).toBe(TESTVILLE_STORIES.length)
    expect(filtered.stories).toHaveLength(TESTVILLE_STORIES.length)
    expect(filtered.coverage.matched).toBe(4)
    expect(filtered.fabric.indicators.context).toBe(2)

    const context = filtered.stories.filter((story) => story.band === 'context')
    const foreground = filtered.stories.filter((story) => story.band === 'foreground')
    expect(context.map((story) => story.storyId).sort()).toEqual(['st_tv04', 'st_tv06'])
    expect(Math.max(...context.map((story) => story.weight))).toBeLessThan(Math.min(...foreground.map((story) => story.weight)))
    expect(filtered.resolvedFilter.matchMode).toBe('lexical+entities')
    expect(filtered.resolvedFilter.notes?.join(' ')).toContain('nessun embedding')
  })

  it('combines theme AND text AND event, never overwriting one with another', () => {
    const combined = state({
      kind: 'free',
      themeId: 'acqua',
      text: 'riva',
      eventId: 'testville_festa_fiume',
      year: 2026,
    })
    expect(combined.coverage.total).toBe(6)
    expect(combined.coverage.matched).toBe(2)
    expect(combined.stories.filter((story) => story.band === 'foreground').map((story) => story.storyId).sort())
      .toEqual(['st_tv01', 'st_tv02'])
    expect(combined.resolvedFilter.timeWindow).toEqual({ from: '2026-06-01', to: '2026-06-02' })
    expect(combined.explanation).toContain('criteri combinati in AND')
  })

  it('treats an empty query as the ordinary state (everything visible)', () => {
    const ordinary = state({ kind: 'free' })
    expect(ordinary.coverage.matched).toBe(6)
    expect(ordinary.coverage.sparse).toBe(false)
    expect(ordinary.resolvedFilter.matchMode).toBe('ordinary')
    expect(ordinary.stories.every((story) => story.weight === 1 && story.band === 'foreground')).toBe(true)
    expect(ordinary.explanation).toContain('Stato ordinario')
  })

  it('emits an explicit zero-result state with nearby-theme suggestions', () => {
    const empty = state({ kind: 'search', text: 'astronauti' })
    expect(empty.coverage.matched).toBe(0)
    expect(empty.coverage.total).toBe(6)
    expect(empty.stories).toHaveLength(6)
    expect(empty.suggestions.length).toBeGreaterThan(0)
    expect(empty.explanation).toContain('Nessuna storia corrisponde')
    expect(empty.explanation).toContain('Temi vicini con storie')
    expect(empty.fabric.indicators.sparse).toBe(true)
  })

  it('resolves an event to its rule, status and yearly window', () => {
    const event = state({ kind: 'event', eventId: 'testville_festa_fiume', year: 2026 })
    expect(event.resolvedFilter.eventId).toBe('testville_festa_fiume')
    expect(event.resolvedFilter.timeWindow).toEqual({ from: '2026-06-01', to: '2026-06-02' })
    expect(event.explanation).toContain('Evento «Festa del Fiume» (2026)')
    expect(event.explanation).toContain('stato: atteso')
    expect(event.coverage.matched).toBe(3)
  })

  it('builds a fabric with weighted edges and an explicit semantic gap', () => {
    const ordinary = state({ kind: 'free' })
    expect(ordinary.fabric.modes).toEqual(['filaments', 'field'])
    expect(ordinary.fabric.excludedModes).toEqual(['weave'])
    expect(ordinary.fabric.edges.length).toBeGreaterThan(0)
    expect(ordinary.fabric.edges.every((edge) => edge.band === 'foreground')).toBe(true)
    expect(ordinary.fabric.edges.every((edge) => edge.explanation.length > 3)).toBe(true)
    const semantic = ordinary.fabric.relations.find((relation) => relation.type === 'semantic')
    expect(semantic?.available).toBe(false)
    expect(semantic?.reason).toBe('no_embeddings')
    expect(ordinary.fabric.zones.length).toBeGreaterThan(0)

    const filtered = state({ kind: 'theme', themeId: 'acqua' })
    const byId = new Map(filtered.stories.map((story) => [story.storyId, story.band]))
    for (const edge of filtered.fabric.edges) {
      const expected = byId.get(edge.from) === 'foreground' && byId.get(edge.to) === 'foreground' ? 'foreground' : 'context'
      expect(edge.band).toBe(expected)
    }
  })

  it('declares insufficiency with three stories instead of hiding the map', () => {
    const sparse = computeState({
      stories: TESTVILLE_STORIES.slice(0, 3),
      pack: TESTVILLE_PACK,
      calendar,
      query: { kind: 'free' },
      options: { lang: 'it', dzId: 'testville', now: NOW },
    })
    expect(sparse.coverage.sparse).toBe(true)
    expect(sparse.fabric.indicators.degradedReasons).toContain('few_stories')
    expect(sparse.stories).toHaveLength(3)
    expect(sparse.explanation).toContain('insufficienza')
  })
})
