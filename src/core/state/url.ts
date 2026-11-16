/** Reproducible state in the URL: `?theme=&q=&event=&from=&to=&dz=&pack=&pm=1`
 *  (plus optional fabric params). A project manager can send the link to an
 *  assessor and the server rebuilds the same State. */

import type { Query } from './types.js'

export interface UrlFabricParams {
  on?: boolean
  mode?: 'filaments' | 'field'
  /** 0..1 */
  opacity?: number
  /** Palette preset name (colour-blind-safe presets only). */
  palette?: string
  curvature?: number
  thickness?: number
  halo?: number
}

export interface UrlParams {
  dz?: string
  pack?: string
  pm: boolean
  query: Query
  fabric: UrlFabricParams
  year?: number
}

const ID_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/

function cleanId(value: string | null): string | undefined {
  return value && ID_RE.test(value) ? value : undefined
}

function cleanText(value: string | null): string | undefined {
  if (!value) return undefined
  const text = value.trim().slice(0, 200)
  return text || undefined
}

function cleanDay(value: string | null): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined
}

function cleanYear(value: string | null): number | undefined {
  const year = Number(value)
  return Number.isInteger(year) && year >= 1900 && year <= 2200 ? year : undefined
}

export interface QueryParts {
  themeId?: string
  text?: string
  eventId?: string
  year?: number
  from?: string
  to?: string
}

/** Compose the one Query model from independent controls (AND semantics). */
export function composeQuery(parts: QueryParts): Query {
  const themeId = parts.themeId?.trim() || undefined
  const eventId = parts.eventId?.trim() || undefined
  const text = parts.text?.trim() || undefined
  const from = parts.from?.trim() || undefined
  const to = parts.to?.trim() || undefined
  if (themeId && !text && !eventId && !from && !to) return { kind: 'theme', themeId }
  if (eventId && !text && !themeId && !from && !to) {
    return { kind: 'event', eventId, ...(parts.year ? { year: parts.year } : {}) }
  }
  if (text && !themeId && !eventId && !from && !to) return { kind: 'search', text }
  return {
    kind: 'free',
    ...(themeId ? { themeId } : {}),
    ...(eventId ? { eventId } : {}),
    ...(text ? { text } : {}),
    ...(parts.year ? { year: parts.year } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  }
}

export function parseUrlParams(search: string): UrlParams {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const themeId = cleanId(params.get('theme'))
  const text = cleanText(params.get('q'))
  const eventId = cleanId(params.get('event'))
  const from = cleanDay(params.get('from'))
  const to = cleanDay(params.get('to'))
  const year = cleanYear(params.get('year'))
  const dz = cleanId(params.get('dz'))
  const pack = cleanId(params.get('pack'))
  const pm = params.get('pm') === '1'
  const opacityRaw = Number(params.get('fo'))
  const curvatureRaw = Number(params.get('cur'))
  const thicknessRaw = Number(params.get('th'))
  const haloRaw = Number(params.get('hal'))
  const palette = params.get('pal')
  const fabric: UrlFabricParams = {
    ...(params.get('fab') === '1' ? { on: true } : {}),
    ...(params.get('fm') === 'field' || params.get('fm') === 'filaments' ? { mode: params.get('fm') as 'field' | 'filaments' } : {}),
    ...(Number.isFinite(opacityRaw) && params.get('fo') !== null ? { opacity: Math.min(1, Math.max(0, opacityRaw / 100)) } : {}),
    ...(palette && /^[a-z0-9_]{2,30}$/.test(palette) ? { palette } : {}),
    ...(Number.isFinite(curvatureRaw) && params.get('cur') !== null ? { curvature: Math.min(1, Math.max(0, curvatureRaw / 100)) } : {}),
    ...(Number.isFinite(thicknessRaw) && params.get('th') !== null ? { thickness: Math.min(6, Math.max(0.5, thicknessRaw / 10)) } : {}),
    ...(Number.isFinite(haloRaw) && params.get('hal') !== null ? { halo: Math.min(1, Math.max(0, haloRaw / 100)) } : {}),
  }

  const query: Query = composeQuery({ ...(themeId ? { themeId } : {}), ...(text ? { text } : {}), ...(eventId ? { eventId } : {}), ...(year ? { year } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) })

  return { ...(dz ? { dz } : {}), ...(pack ? { pack } : {}), pm, query, fabric, ...(year ? { year } : {}) }
}

export function serializeUrlParams(input: UrlParams): string {
  const params = new URLSearchParams()
  const query = input.query
  const themeId = query.kind === 'theme' ? query.themeId : query.kind === 'free' ? query.themeId : undefined
  const text = query.kind === 'search' ? query.text : query.kind === 'free' ? query.text : undefined
  const eventId = query.kind === 'event' ? query.eventId : query.kind === 'free' ? query.eventId : undefined
  const year = input.year ?? (query.kind === 'event' ? query.year : query.kind === 'free' ? query.year : undefined)
  const from = query.kind === 'free' || query.kind === 'event' ? query.from : undefined
  const to = query.kind === 'free' || query.kind === 'event' ? query.to : undefined
  if (themeId) params.set('theme', themeId)
  if (text) params.set('q', text)
  if (eventId) params.set('event', eventId)
  if (year) params.set('year', String(year))
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  if (input.dz) params.set('dz', input.dz)
  if (input.pack) params.set('pack', input.pack)
  if (input.pm) params.set('pm', '1')
  if (input.fabric.on) params.set('fab', '1')
  if (input.fabric.mode) params.set('fm', input.fabric.mode)
  if (input.fabric.opacity !== undefined) params.set('fo', String(Math.round(input.fabric.opacity * 100)))
  if (input.fabric.palette) params.set('pal', input.fabric.palette)
  if (input.fabric.curvature !== undefined) params.set('cur', String(Math.round(input.fabric.curvature * 100)))
  if (input.fabric.thickness !== undefined) params.set('th', String(Math.round(input.fabric.thickness * 10)))
  if (input.fabric.halo !== undefined) params.set('hal', String(Math.round(input.fabric.halo * 100)))
  const text_ = params.toString()
  return text_ ? `?${text_}` : ''
}

/** Query string for `GET /api/state` (same keys as the shareable URL + lang). */
export function stateRequestParams(input: {
  dz: string
  packId?: string
  query: Query
  year?: number
  lang: 'it' | 'en'
}): string {
  const params = new URLSearchParams(serializeUrlParams({
    dz: input.dz,
    ...(input.packId ? { pack: input.packId } : {}),
    pm: false,
    query: input.query,
    fabric: {},
    ...(input.year ? { year: input.year } : {}),
  }).replace(/^\?/, ''))
  params.set('lang', input.lang)
  return params.toString()
}
