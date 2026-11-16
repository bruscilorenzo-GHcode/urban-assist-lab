/** Netlify function: /api/state
 *
 *  GET  ?dz=&pack=&theme=&q=&event=&from=&to=&year=&lang=
 *  POST { dz, query, pack?, year?, lang? }   (local PM pack, not yet saved)
 *
 *  The State is computed here, server-side: the browser receives relevance
 *  weights, fabric edges and the template explanation already resolved. No
 *  semantic/relevance computation happens in the client.
 *
 *  No city, zone, theme or event id is hardcoded: packs and the calendar are
 *  data, resolved per territory. */

import { getStore } from '@netlify/blobs'
import type { Config, Context } from '@netlify/functions'
import { buildCalendar } from '../../src/core/calendar/recurrence.js'
import { EVENT_TEMPLATES } from '../../src/core/calendar/seeds.js'
import type { CalendarSnapshot } from '../../src/core/calendar/types.js'
import { findPack, resolvePackForZone } from '../../src/core/packs/registry.js'
import type { ProjectPack, ZoneLike } from '../../src/core/packs/types.js'
import { parseProjectPack } from '../../src/core/packs/validate.js'
import { computeState, type StateStory } from '../../src/core/state/compute.js'
import type { Query } from '../../src/core/state/types.js'
import { parseUrlParams } from '../../src/core/state/url.js'
import { SEED_ZONES, type DramaturgicalZone } from '../../src/assist-urban/pipeline/dramaturgical-zones.js'
import { MAX_STORED_STORIES, STORIES_STORE, normalizeDz, storyPrefix } from './lib/stories.js'

const PACKS_STORE = 'assist-urban-packs'
const ZONES_STORE = 'assist-urban-zones'
const PACK_KEY = 'pack:'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const ID_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_TEXT = 200

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : 'state failure'
}

async function storedPacks(): Promise<ProjectPack[]> {
  try {
    const store = getStore(PACKS_STORE, { consistency: 'strong' })
    const listed = await store.list({ prefix: PACK_KEY })
    const packs: ProjectPack[] = []
    for (const blob of listed.blobs) {
      const raw = await store.get(blob.key, { type: 'json' })
      const parsed = parseProjectPack(raw)
      if (parsed.ok) packs.push(parsed.pack)
    }
    return packs
  } catch {
    return []
  }
}

async function storedZones(): Promise<DramaturgicalZone[]> {
  try {
    const store = getStore(ZONES_STORE, { consistency: 'strong' })
    const listed = await store.list({ prefix: 'zone:' })
    const zones: DramaturgicalZone[] = []
    for (const blob of listed.blobs) {
      const zone = await store.get(blob.key, { type: 'json' }) as (DramaturgicalZone & { editToken?: string }) | null
      if (zone) zones.push(zone)
    }
    return zones
  } catch {
    return []
  }
}

function zoneLike(zone: DramaturgicalZone): ZoneLike {
  return {
    id: zone.id,
    name: zone.name,
    city: zone.city,
    center: zone.center,
    zoom: zone.zoom,
    focus: zone.focus,
  }
}

async function resolveZone(dz: string, pack?: ProjectPack): Promise<ZoneLike | null> {
  const zones = [...SEED_ZONES, ...(await storedZones())]
  const found = zones.find((zone) => zone.id === dz)
  if (found) return zoneLike(found)
  if (pack) {
    return {
      id: dz,
      name: pack.name,
      city: pack.territoryId,
      center: pack.territory.center,
      zoom: pack.territory.zoom,
      focus: pack.copy.title,
    }
  }
  return null
}

function queryFromRecord(raw: unknown): Query {
  const input = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const themeId = typeof input.themeId === 'string' && ID_RE.test(input.themeId) ? input.themeId : undefined
  const eventId = typeof input.eventId === 'string' && ID_RE.test(input.eventId) ? input.eventId : undefined
  const text = typeof input.text === 'string' ? input.text.trim().slice(0, MAX_TEXT) : ''
  const from = typeof input.from === 'string' && DAY_RE.test(input.from) ? input.from : undefined
  const to = typeof input.to === 'string' && DAY_RE.test(input.to) ? input.to : undefined
  const year = Number(input.year)
  const safeYear = Number.isInteger(year) && year >= 1900 && year <= 2200 ? year : undefined
  if (input.kind === 'theme' && themeId) return { kind: 'theme', themeId }
  if (input.kind === 'search' && text) return { kind: 'search', text }
  if (input.kind === 'event' && eventId) return { kind: 'event', eventId, ...(safeYear ? { year: safeYear } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) }
  return {
    kind: 'free',
    ...(text ? { text } : {}),
    ...(themeId ? { themeId } : {}),
    ...(eventId ? { eventId } : {}),
    ...(safeYear ? { year: safeYear } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  }
}

async function loadStories(dz: string): Promise<StateStory[]> {
  const store = getStore(STORIES_STORE, { consistency: 'strong' })
  const listed = await store.list({ prefix: storyPrefix(dz) })
  const keys = listed.blobs.map((blob) => blob.key).slice(-MAX_STORED_STORIES)
  const stories: StateStory[] = []
  for (const key of keys) {
    const stored = await store.get(key, { type: 'json' }) as StateStory | null
    if (stored && stored.dz === dz) stories.push(stored)
  }
  return stories
}

function calendarFor(pack: ProjectPack, year: number): CalendarSnapshot {
  // Territory templates travel with the pack (data, no deploy); pack entries
  // override a global template with the same id.
  const templates = new Map(EVENT_TEMPLATES.map((template) => [template.id, template]))
  for (const template of pack.eventTemplates) templates.set(template.id, template)
  return buildCalendar([...templates.values()], pack.territoryId, year, pack.includeNational, pack.events)
}

function langOf(value: unknown): 'it' | 'en' {
  return value === 'en' ? 'en' : 'it'
}

export default async (req: Request, _ctx: Context): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url)
      const parsed = parseUrlParams(url.search)
      const dz = normalizeDz(parsed.dz)
      if (!dz) return json(400, { error: 'valid dz required' })
      const packs = await storedPacks()
      const zone = await resolveZone(dz)
      if (!zone) return json(404, { error: 'zone not found' })
      let pack: ProjectPack
      if (parsed.pack) {
        const explicit = findPack(parsed.pack, packs)
        if (!explicit) return json(404, { error: 'pack not found' })
        pack = explicit
      } else {
        pack = resolvePackForZone(zone, { stored: packs })
      }
      const year = parsed.year ?? new Date().getUTCFullYear()
      const calendar = calendarFor(pack, year)
      const stories = await loadStories(dz)
      const state = computeState({
        stories,
        pack,
        calendar,
        query: parsed.query,
        options: { lang: langOf(url.searchParams.get('lang')), dzId: dz },
      })
      return json(200, { state, pack, calendar })
    }

    if (req.method !== 'POST') return json(405, { error: 'method not allowed' })
    const body = await req.json() as {
      dz?: unknown
      query?: unknown
      pack?: unknown
      year?: unknown
      lang?: unknown
    }
    const dz = normalizeDz(body.dz)
    if (!dz) return json(400, { error: 'valid dz required' })

    let pack: ProjectPack | null = null
    if (body.pack) {
      const parsed = parseProjectPack(body.pack)
      if (!parsed.ok) return json(400, { error: 'invalid pack', issues: parsed.issues })
      pack = parsed.pack
    }
    const zone = await resolveZone(dz, pack ?? undefined)
    if (!zone) return json(404, { error: 'zone not found' })
    if (!pack) {
      pack = resolvePackForZone(zone, { stored: await storedPacks() })
    }

    const yearRaw = Number(body.year)
    const year = Number.isInteger(yearRaw) && yearRaw >= 1900 && yearRaw <= 2200
      ? yearRaw
      : new Date().getUTCFullYear()
    const calendar = calendarFor(pack, year)
    const stories = await loadStories(dz)
    const state = computeState({
      stories,
      pack,
      calendar,
      query: queryFromRecord(body.query),
      options: { lang: langOf(body.lang), dzId: dz },
    })
    return json(200, { state, pack, calendar })
  } catch (err) {
    return json(503, { error: 'state unavailable', detail: messageOf(err) })
  }
}

export const config: Config = { path: '/api/state' }
