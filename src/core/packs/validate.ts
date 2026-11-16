/** Pack import/validation with readable, bilingual messages and hard limits:
 *  a project manager can customise the map but cannot break it. */

import type { EventConfidence, EventScope, EventStatus, EventTemplate, RecurrenceKind } from '../calendar/types.js'
import { asLocalized, type Lang, type Localized } from '../types.js'
import { DEFAULT_FABRIC, defaultCopy } from './defaults.js'
import { MAX_PALETTE_COLORS, MIN_PALETTE_COLORS, SAFE_PACK_COLORS, isSafeHexColor } from './presets.js'
import type { FabricPalette, PackIssue, PackParseResult, ProjectPack, ThemeDefinition } from './types.js'
import type { Query } from '../state/types.js'

const ID_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/
const MAX_THEMES = 24
const MAX_KEYWORDS = 32
const MAX_EVENTS = 100
const MAX_COPY = 400

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function cleanString(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function cleanList(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const text = entry.trim().slice(0, maxLen)
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(text)
    if (out.length >= maxItems) break
  }
  return out
}

function parseQuery(value: unknown, path: string, issues: PackIssue[]): Query | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    issues.push({ code: 'pack.defaults.query', path })
    return undefined
  }
  const kind = value.kind
  if (kind === 'theme' && typeof value.themeId === 'string') {
    return { kind: 'theme', themeId: value.themeId.trim().slice(0, 64) }
  }
  if (kind === 'search' && typeof value.text === 'string') {
    return { kind: 'search', text: value.text.slice(0, 200) }
  }
  if (kind === 'event' && typeof value.eventId === 'string') {
    const year = num(value.year)
    return { kind: 'event', eventId: value.eventId.trim().slice(0, 64), ...(year ? { year } : {}) }
  }
  if (kind === 'free') {
    const text = typeof value.text === 'string' ? value.text.slice(0, 200) : undefined
    const themeId = typeof value.themeId === 'string' ? value.themeId.trim().slice(0, 64) : undefined
    const eventId = typeof value.eventId === 'string' ? value.eventId.trim().slice(0, 64) : undefined
    const year = num(value.year)
    return { kind: 'free', ...(text ? { text } : {}), ...(themeId ? { themeId } : {}), ...(eventId ? { eventId } : {}), ...(year ? { year } : {}) }
  }
  issues.push({ code: 'pack.defaults.query', path })
  return undefined
}

function parseTheme(value: unknown, index: number, issues: PackIssue[]): ThemeDefinition | null {
  const path = `themes[${index}]`
  if (!isRecord(value)) {
    issues.push({ code: 'pack.theme.object', path })
    return null
  }
  const id = cleanString(value.id, 64)
  if (!ID_RE.test(id)) issues.push({ code: 'pack.theme.id', path: `${path}.id` })
  const label = asLocalized(value.label)
  if (!label.it.trim() || !label.en.trim()) issues.push({ code: 'pack.theme.label', path: `${path}.label` })
  const categories = cleanList(value.categories, 12, 80)
  const keywords = cleanList(value.keywords, MAX_KEYWORDS, 80)
  if (!keywords.length && !categories.length) issues.push({ code: 'pack.theme.vocabulary', path, params: { index } })
  return {
    id,
    label: { it: label.it.slice(0, 80), en: label.en.slice(0, 80) },
    categories,
    keywords,
  }
}

function parsePalette(value: unknown, issues: PackIssue[], path: string): FabricPalette {
  const raw = isRecord(value) ? value : {}
  const name = cleanString(raw.name, 40) || 'custom'
  const colorsRaw = Array.isArray(raw.colors) ? raw.colors : []
  const colors: string[] = []
  for (const color of colorsRaw) {
    if (typeof color !== 'string') continue
    const hex = color.trim()
    if (!isSafeHexColor(hex)) {
      issues.push({ code: 'pack.fabric.palette.hex', path: `${path}.colors`, params: { color: hex.slice(0, 10) } })
    } else if (!SAFE_PACK_COLORS.has(hex.toUpperCase())) {
      issues.push({ code: 'pack.fabric.palette.unsafe', path: `${path}.colors`, params: { color: hex.slice(0, 10) } })
    } else {
      colors.push(hex.toUpperCase())
    }
  }
  if (colors.length < MIN_PALETTE_COLORS) issues.push({ code: 'pack.fabric.palette.min', path: `${path}.colors`, params: { min: MIN_PALETTE_COLORS } })
  if (colors.length > MAX_PALETTE_COLORS) issues.push({ code: 'pack.fabric.palette.max', path: `${path}.colors`, params: { max: MAX_PALETTE_COLORS } })
  return { name, colors: colors.slice(0, MAX_PALETTE_COLORS) }
}

const RECURRENCE_KINDS: RecurrenceKind[] = ['annual_month', 'annual_easter', 'annual_nth_weekday', 'fixed']
const CONFIDENCES: EventConfidence[] = ['verified', 'approximate', 'client']
const STATUSES: EventStatus[] = ['expected', 'confirmed', 'cancelled', 'tbd']
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

function parseEventTemplate(value: unknown, index: number, issues: PackIssue[]): EventTemplate | null {
  const path = `eventTemplates[${index}]`
  if (!isRecord(value)) {
    issues.push({ code: 'pack.event.object', path })
    return null
  }
  const id = cleanString(value.id, 64)
  if (!ID_RE.test(id)) issues.push({ code: 'pack.event.id', path: `${path}.id` })
  const name = cleanString(value.name, 120)
  if (name.length < 2) issues.push({ code: 'pack.event.name', path: `${path}.name` })
  const territory = cleanString(value.territory, 64)
  if (!ID_RE.test(territory)) issues.push({ code: 'pack.event.territory', path: `${path}.territory` })
  const scope: EventScope = value.scope === 'national' ? 'national' : 'local'
  if (value.scope !== 'local' && value.scope !== 'national') issues.push({ code: 'pack.event.scope', path: `${path}.scope` })
  const category = cleanString(value.category, 60)
  if (!category) issues.push({ code: 'pack.event.category', path: `${path}.category` })

  const recurrenceRaw = isRecord(value.recurrence) ? value.recurrence : {}
  const kind = RECURRENCE_KINDS.includes(recurrenceRaw.kind as RecurrenceKind)
    ? recurrenceRaw.kind as RecurrenceKind
    : null
  if (!kind) issues.push({ code: 'pack.event.recurrence', path: `${path}.recurrence.kind` })
  const rule = cleanString(recurrenceRaw.rule, 200)
  if (rule.length < 3) issues.push({ code: 'pack.event.rule', path: `${path}.recurrence.rule` })
  const month = num(recurrenceRaw.month)
  if (recurrenceRaw.month !== undefined && (month === null || month < 1 || month > 12)) {
    issues.push({ code: 'pack.event.month', path: `${path}.recurrence.month` })
  }
  const day = num(recurrenceRaw.day)
  if (recurrenceRaw.day !== undefined && (day === null || day < 1 || day > 31)) {
    issues.push({ code: 'pack.event.day', path: `${path}.recurrence.day` })
  }
  const weekday = num(recurrenceRaw.weekday)
  if (recurrenceRaw.weekday !== undefined && (weekday === null || weekday < 0 || weekday > 6)) {
    issues.push({ code: 'pack.event.weekday', path: `${path}.recurrence.weekday` })
  }
  const nthRaw = recurrenceRaw.nth
  const nth = typeof nthRaw === 'number' && nthRaw >= 1 && nthRaw <= 5
    ? nthRaw
    : nthRaw === 'last' || nthRaw === 'after' ? nthRaw : undefined
  if (nthRaw !== undefined && nth === undefined) issues.push({ code: 'pack.event.nth', path: `${path}.recurrence.nth` })
  const referenceDay = num(recurrenceRaw.referenceDay)
  const duration = num(recurrenceRaw.durationDays)
  if (recurrenceRaw.durationDays !== undefined && (duration === null || duration < 1 || duration > 365)) {
    issues.push({ code: 'pack.event.duration', path: `${path}.recurrence.durationDays` })
  }
  const typical = num(value.typicalDurationDays)
  if (typical === null || typical < 1 || typical > 365) issues.push({ code: 'pack.event.duration', path: `${path}.typicalDurationDays` })

  const sourceRaw = isRecord(value.source) ? value.source : {}
  const url = cleanString(sourceRaw.url, 300)
  const retrievedAt = cleanString(sourceRaw.retrievedAt, 10)
  if (!/^https?:\/\//.test(url)) issues.push({ code: 'pack.event.source', path: `${path}.source.url` })
  if (!DAY_RE.test(retrievedAt)) issues.push({ code: 'pack.event.retrieved', path: `${path}.source.retrievedAt` })
  const confidence = CONFIDENCES.includes(value.confidence as EventConfidence)
    ? value.confidence as EventConfidence
    : 'approximate'
  if (!CONFIDENCES.includes(value.confidence as EventConfidence)) {
    issues.push({ code: 'pack.event.confidence', path: `${path}.confidence` })
  }
  const defaultStatus = STATUSES.includes(value.defaultStatus as EventStatus)
    ? value.defaultStatus as EventStatus
    : undefined

  return {
    id,
    name,
    ...(typeof value.nameEn === 'string' && value.nameEn.trim() ? { nameEn: value.nameEn.trim().slice(0, 120) } : {}),
    territory,
    scope,
    recurrence: {
      kind: kind ?? 'fixed',
      rule,
      ...(month !== null ? { month } : {}),
      ...(day !== null ? { day } : {}),
      ...(weekday !== null ? { weekday } : {}),
      ...(nth !== undefined ? { nth } : {}),
      ...(referenceDay !== null ? { referenceDay } : {}),
      ...(duration !== null ? { durationDays: duration } : {}),
    },
    typicalDurationDays: typical !== null && typical >= 1 && typical <= 365 ? Math.round(typical) : 1,
    category: category || 'cultura',
    source: { url, retrievedAt },
    confidence,
    ...(typeof value.notes === 'string' && value.notes.trim() ? { notes: value.notes.trim().slice(0, 400) } : {}),
    ...(typeof value.notesEn === 'string' && value.notesEn.trim() ? { notesEn: value.notesEn.trim().slice(0, 400) } : {}),
    ...(defaultStatus ? { defaultStatus } : {}),
  }
}

/** Parse + normalise any pack-shaped JSON (exported pack, PM import, API body). */
export function parseProjectPack(raw: unknown): PackParseResult {
  const issues: PackIssue[] = []
  if (!isRecord(raw)) return { ok: false, pack: null, issues: [{ code: 'pack.not_object', path: '' }] }

  const id = cleanString(raw.id, 64)
  if (!ID_RE.test(id)) issues.push({ code: 'pack.id', path: 'id' })
  const name = cleanString(raw.name, 80)
  if (name.length < 2) issues.push({ code: 'pack.name', path: 'name' })
  const territoryId = cleanString(raw.territoryId, 64)
  if (!ID_RE.test(territoryId)) issues.push({ code: 'pack.territory_id', path: 'territoryId' })

  const territoryRaw = isRecord(raw.territory) ? raw.territory : {}
  const bboxRaw = Array.isArray(territoryRaw.bbox) ? territoryRaw.bbox : []
  const bboxNums = bboxRaw.map((entry) => num(entry))
  const bboxOk = bboxNums.length === 4
    && bboxNums.every((entry): entry is number => entry !== null)
    && bboxNums[0]! >= -90 && bboxNums[2]! <= 90 && bboxNums[1]! >= -180 && bboxNums[3]! <= 180
    && bboxNums[0]! < bboxNums[2]! && bboxNums[1]! < bboxNums[3]!
  if (!bboxOk) issues.push({ code: 'pack.bbox', path: 'territory.bbox' })
  const centerRaw = Array.isArray(territoryRaw.center) ? territoryRaw.center : []
  const centerNums = centerRaw.map((entry) => num(entry))
  const centerOk = centerNums.length === 2
    && centerNums.every((entry): entry is number => entry !== null)
    && Math.abs(centerNums[0]!) <= 90 && Math.abs(centerNums[1]!) <= 180
  if (!centerOk) issues.push({ code: 'pack.center', path: 'territory.center' })
  const zoomRaw = num(territoryRaw.zoom)
  if (zoomRaw === null || zoomRaw < 1 || zoomRaw > 19) issues.push({ code: 'pack.zoom', path: 'territory.zoom' })

  const themesRaw = Array.isArray(raw.themes) ? raw.themes : []
  if (!themesRaw.length || themesRaw.length > MAX_THEMES) {
    issues.push({ code: 'pack.themes', path: 'themes', params: { max: MAX_THEMES } })
  }
  const themes: ThemeDefinition[] = []
  const themeIds = new Set<string>()
  themesRaw.slice(0, MAX_THEMES).forEach((entry, index) => {
    const theme = parseTheme(entry, index, issues)
    if (!theme) return
    if (themeIds.has(theme.id)) issues.push({ code: 'pack.theme.duplicate', path: `themes[${index}].id`, params: { id: theme.id } })
    themeIds.add(theme.id)
    themes.push(theme)
  })

  const eventsRaw = Array.isArray(raw.events) ? raw.events : []
  const events: string[] = []
  eventsRaw.slice(0, MAX_EVENTS).forEach((entry, index) => {
    if (typeof entry !== 'string' || !ID_RE.test(entry.trim())) {
      issues.push({ code: 'pack.events.id', path: `events[${index}]` })
      return
    }
    const eventId = entry.trim()
    if (!events.includes(eventId)) events.push(eventId)
  })
  if (eventsRaw.length > MAX_EVENTS) issues.push({ code: 'pack.events.max', path: 'events', params: { max: MAX_EVENTS } })

  const templatesRaw = Array.isArray(raw.eventTemplates) ? raw.eventTemplates : []
  if (templatesRaw.length > 60) issues.push({ code: 'pack.events.templates_max', path: 'eventTemplates', params: { max: 60 } })
  const eventTemplates: EventTemplate[] = []
  const templateIds = new Set<string>()
  templatesRaw.slice(0, 60).forEach((entry, index) => {
    const template = parseEventTemplate(entry, index, issues)
    if (!template) return
    if (templateIds.has(template.id)) {
      issues.push({ code: 'pack.event.duplicate', path: `eventTemplates[${index}].id`, params: { id: template.id } })
      return
    }
    templateIds.add(template.id)
    if (template.scope === 'local' && template.territory !== territoryId) {
      issues.push({
        code: 'pack.event.territory_mismatch',
        path: `eventTemplates[${index}].territory`,
        params: { territory: template.territory, pack: territoryId },
      })
    }
    eventTemplates.push(template)
  })

  const fabricRaw = isRecord(raw.fabric) ? raw.fabric : {}
  const mode = fabricRaw.defaultMode === 'field' ? 'field' : fabricRaw.defaultMode === 'filaments' ? 'filaments' : null
  if (!mode) issues.push({ code: 'pack.fabric.mode', path: 'fabric.defaultMode' })
  const opacity = num(fabricRaw.defaultOpacity)
  if (opacity === null || opacity < 0 || opacity > 1) issues.push({ code: 'pack.fabric.opacity', path: 'fabric.defaultOpacity' })
  const curvature = num(fabricRaw.curvature)
  if (curvature === null || curvature < 0 || curvature > 1) issues.push({ code: 'pack.fabric.curvature', path: 'fabric.curvature' })
  const thickness = num(fabricRaw.thickness)
  if (thickness === null || thickness < 0.5 || thickness > 6) issues.push({ code: 'pack.fabric.thickness', path: 'fabric.thickness' })
  const halo = num(fabricRaw.halo)
  if (halo === null || halo < 0 || halo > 1) issues.push({ code: 'pack.fabric.halo', path: 'fabric.halo' })
  const nodeScale = num(fabricRaw.nodeScale)
  if (nodeScale === null || nodeScale < 0.4 || nodeScale > 2.5) issues.push({ code: 'pack.fabric.node_scale', path: 'fabric.nodeScale' })
  const labelZoom = num(fabricRaw.labelZoom)
  if (labelZoom === null || labelZoom < 10 || labelZoom > 19) issues.push({ code: 'pack.fabric.label_zoom', path: 'fabric.labelZoom' })
  const fieldBandMeters = num(fabricRaw.fieldBandMeters)
  if (fieldBandMeters === null || fieldBandMeters < 100 || fieldBandMeters > 5000) issues.push({ code: 'pack.fabric.band_meters', path: 'fabric.fieldBandMeters' })
  const fieldBandMinutes = num(fabricRaw.fieldBandMinutes)
  if (fieldBandMinutes === null || fieldBandMinutes < 1 || fieldBandMinutes > 240) issues.push({ code: 'pack.fabric.band_minutes', path: 'fabric.fieldBandMinutes' })
  const proximityMeters = num(fabricRaw.proximityMeters ?? DEFAULT_FABRIC.proximityMeters)
  if (proximityMeters === null || proximityMeters < 100 || proximityMeters > 3000) issues.push({ code: 'pack.fabric.proximity', path: 'fabric.proximityMeters' })
  const palette = parsePalette(fabricRaw.palette, issues, 'fabric')

  const copyRaw = isRecord(raw.copy) ? raw.copy : {}
  const fallbackCopy = defaultCopy(
    { it: name || 'territorio', en: name || 'territory' },
    { it: 'lettura del territorio', en: 'reading of the territory' },
  )
  const copy = {
    title: asLocalized(copyRaw.title, fallbackCopy.title.it),
    subtitle: asLocalized(copyRaw.subtitle, fallbackCopy.subtitle.it),
    emptyState: asLocalized(copyRaw.emptyState, fallbackCopy.emptyState.it),
    sparseState: asLocalized(copyRaw.sparseState, fallbackCopy.sparseState.it),
  }
  for (const [key, value] of Object.entries(copy)) {
    if (!value.it.trim() || !value.en.trim()) issues.push({ code: 'pack.copy', path: `copy.${key}` })
    if (value.it.length > MAX_COPY || value.en.length > MAX_COPY) issues.push({ code: 'pack.copy.length', path: `copy.${key}`, params: { max: MAX_COPY } })
  }

  const defaultsRaw = isRecord(raw.defaults) ? raw.defaults : {}
  const defaultsQuery = parseQuery(defaultsRaw.query, 'defaults.query', issues)
  const defaultOpacity = num(defaultsRaw.opacity)
  if (defaultsRaw.opacity !== undefined && (defaultOpacity === null || defaultOpacity < 0 || defaultOpacity > 1)) {
    issues.push({ code: 'pack.fabric.opacity', path: 'defaults.opacity' })
  }
  const defaultMode = defaultsRaw.mode === 'field' || defaultsRaw.mode === 'filaments' ? defaultsRaw.mode : undefined
  if (defaultsRaw.mode !== undefined && !defaultMode) issues.push({ code: 'pack.fabric.mode', path: 'defaults.mode' })

  if (issues.length > 0) return { ok: false, pack: null, issues }

  const pack: ProjectPack = {
    id,
    name,
    territoryId,
    territory: {
      bbox: [bboxNums[0]!, bboxNums[1]!, bboxNums[2]!, bboxNums[3]!],
      center: [centerNums[0]!, centerNums[1]!],
      zoom: Math.round(zoomRaw!),
    },
    themes,
    events,
    eventTemplates,
    includeNational: raw.includeNational === true,
    fabric: {
      defaultMode: mode!,
      defaultOpacity: clamp(opacity!, 0, 1),
      palette,
      curvature: clamp(curvature!, 0, 1),
      fieldBandMeters: Math.round(fieldBandMeters!),
      fieldBandMinutes: Math.round(fieldBandMinutes!),
      nodeScale: clamp(nodeScale!, 0.4, 2.5),
      thickness: clamp(thickness!, 0.5, 6),
      halo: clamp(halo!, 0, 1),
      labelZoom: Math.round(labelZoom!),
      proximityMeters: Math.round(proximityMeters!),
    },
    copy,
    defaults: {
      ...(defaultsQuery ? { query: defaultsQuery } : {}),
      ...(defaultOpacity !== null ? { opacity: defaultOpacity } : {}),
      ...(defaultMode ? { mode: defaultMode } : {}),
    },
  }
  return { ok: true, pack, issues: [] }
}

export function parsePackJson(text: string): PackParseResult {
  try {
    return parseProjectPack(JSON.parse(text) as unknown)
  } catch {
    return { ok: false, pack: null, issues: [{ code: 'pack.not_json', path: '' }] }
  }
}

export function serializePack(pack: ProjectPack): string {
  return JSON.stringify(pack, null, 2)
}

const ISSUE_MESSAGES: Record<string, Localized> = {
  'pack.not_object': { it: 'Il pack deve essere un oggetto JSON.', en: 'The pack must be a JSON object.' },
  'pack.not_json': { it: 'JSON non valido.', en: 'Invalid JSON.' },
  'pack.id': { it: 'Id pack non valido (a–z, 0–9, - o _; 2–64 caratteri).', en: 'Invalid pack id (a–z, 0–9, - or _; 2–64 chars).' },
  'pack.name': { it: 'Il nome del pack è troppo corto.', en: 'The pack name is too short.' },
  'pack.territory_id': { it: 'territoryId mancante o non valido.', en: 'territoryId missing or invalid.' },
  'pack.bbox': { it: 'bbox non valido: usa [sud, ovest, nord, est] con sud < nord e ovest < est.', en: 'Invalid bbox: use [south, west, north, east] with south < north and west < east.' },
  'pack.center': { it: 'Centro non valido: [lat, lon].', en: 'Invalid centre: [lat, lon].' },
  'pack.zoom': { it: 'Zoom fuori intervallo (1–19).', en: 'Zoom out of range (1–19).' },
  'pack.themes': { it: 'Servono da 1 a {max} temi.', en: 'Between 1 and {max} themes are required.' },
  'pack.theme.object': { it: 'Tema non valido.', en: 'Invalid theme.' },
  'pack.theme.id': { it: 'Id tema non valido.', en: 'Invalid theme id.' },
  'pack.theme.label': { it: 'Etichetta del tema mancante in IT o EN.', en: 'Theme label missing in IT or EN.' },
  'pack.theme.vocabulary': { it: 'Il tema {index} non ha categorie né parole chiave.', en: 'Theme {index} has no categories or keywords.' },
  'pack.theme.duplicate': { it: 'Tema duplicato: {id}.', en: 'Duplicate theme: {id}.' },
  'pack.events.id': { it: 'Id evento non valido.', en: 'Invalid event id.' },
  'pack.events.max': { it: 'Massimo {max} eventi per pack.', en: 'At most {max} events per pack.' },
  'pack.events.templates_max': { it: 'Massimo {max} template evento nel pack.', en: 'At most {max} event templates in the pack.' },
  'pack.event.object': { it: 'Template evento non valido.', en: 'Invalid event template.' },
  'pack.event.id': { it: 'Id evento non valido.', en: 'Invalid event id.' },
  'pack.event.name': { it: 'Nome evento troppo corto.', en: 'Event name is too short.' },
  'pack.event.territory': { it: 'Territorio evento non valido.', en: 'Invalid event territory.' },
  'pack.event.scope': { it: 'Ambito evento non valido (local/national).', en: 'Invalid event scope (local/national).' },
  'pack.event.category': { it: 'Categoria evento mancante.', en: 'Event category is missing.' },
  'pack.event.recurrence': { it: 'Tipo di ricorrenza non valido.', en: 'Invalid recurrence kind.' },
  'pack.event.rule': { it: 'Regola di ricorrenza mancante.', en: 'Recurrence rule is missing.' },
  'pack.event.month': { it: 'Mese della ricorrenza non valido (1–12).', en: 'Invalid recurrence month (1–12).' },
  'pack.event.day': { it: 'Giorno della ricorrenza non valido (1–31).', en: 'Invalid recurrence day (1–31).' },
  'pack.event.weekday': { it: 'Giorno della settimana non valido (0–6).', en: 'Invalid weekday (0–6).' },
  'pack.event.nth': { it: 'Regola nth non valida.', en: 'Invalid nth rule.' },
  'pack.event.source': { it: 'Fonte evento mancante (URL).', en: 'Event source missing (URL).' },
  'pack.event.retrieved': { it: 'Data di recupero della fonte non valida.', en: 'Invalid source retrieval date.' },
  'pack.event.confidence': { it: 'Confidenza evento non valida.', en: 'Invalid event confidence.' },
  'pack.event.duplicate': { it: 'Evento duplicato: {id}.', en: 'Duplicate event: {id}.' },
  'pack.event.territory_mismatch': { it: 'Evento locale del territorio {territory}, ma il pack è {pack}.', en: 'Local event for territory {territory}, but the pack is {pack}.' },
  'pack.event.duration': { it: 'Durata evento fuori intervallo (1–365 giorni).', en: 'Event duration out of range (1–365 days).' },
  'pack.fabric.mode': { it: 'Modalità fabric non valida: filaments o field (weave è esclusa).', en: 'Invalid fabric mode: filaments or field (weave is excluded).' },
  'pack.fabric.opacity': { it: 'Opacità fuori intervallo (0–1).', en: 'Opacity out of range (0–1).' },
  'pack.fabric.curvature': { it: 'Curvatura fuori intervallo (0–1).', en: 'Curvature out of range (0–1).' },
  'pack.fabric.thickness': { it: 'Spessore fuori intervallo (0.5–6).', en: 'Thickness out of range (0.5–6).' },
  'pack.fabric.halo': { it: 'Alone fuori intervallo (0–1).', en: 'Halo out of range (0–1).' },
  'pack.fabric.node_scale': { it: 'Scala nodi fuori intervallo (0.4–2.5).', en: 'Node scale out of range (0.4–2.5).' },
  'pack.fabric.label_zoom': { it: 'Soglia etichette fuori intervallo (10–19).', en: 'Label zoom out of range (10–19).' },
  'pack.fabric.band_meters': { it: 'Banda del campo fuori intervallo (100–5000 m).', en: 'Field band out of range (100–5000 m).' },
  'pack.fabric.band_minutes': { it: 'Banda temporale fuori intervallo (1–240 min).', en: 'Time band out of range (1–240 min).' },
  'pack.fabric.proximity': { it: 'Raggio di prossimità fuori intervallo (100–3000 m).', en: 'Proximity radius out of range (100–3000 m).' },
  'pack.fabric.palette.hex': { it: 'Colore non valido: {color} (usa #RRGGBB).', en: 'Invalid colour: {color} (use #RRGGBB).' },
  'pack.fabric.palette.unsafe': { it: 'Colore {color} fuori dalle palette sicure: usa i preset (deuteranopia/protanopia, max 7).', en: 'Colour {color} is outside the safe palettes: use the presets (deuteranopia/protanopia, max 7).' },
  'pack.fabric.palette.min': { it: 'La palette richiede almeno {min} colori.', en: 'The palette needs at least {min} colours.' },
  'pack.fabric.palette.max': { it: 'La palette ammette al massimo {max} colori (niente arcobaleno).', en: 'The palette allows at most {max} colours (no rainbow).' },
  'pack.copy': { it: 'Testo del pack mancante in IT o EN.', en: 'Pack copy missing in IT or EN.' },
  'pack.copy.length': { it: 'Testo del pack troppo lungo (max {max}).', en: 'Pack copy too long (max {max}).' },
  'pack.defaults.query': { it: 'Query di default non valida.', en: 'Invalid default query.' },
}

export function describePackIssue(issue: PackIssue, lang: Lang): string {
  const template = ISSUE_MESSAGES[issue.code] ?? { it: issue.code, en: issue.code }
  let text = lang === 'en' ? template.en : template.it
  for (const [key, value] of Object.entries(issue.params ?? {})) {
    text = text.replaceAll(`{${key}}`, String(value))
  }
  return issue.path ? `${issue.path}: ${text}` : text
}
