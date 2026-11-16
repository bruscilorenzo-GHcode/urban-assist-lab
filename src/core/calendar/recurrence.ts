/** Deterministic recurrence resolution. Pure date arithmetic, no locale
 *  heuristics, no invented dates: a month-only rule yields a declared window
 *  whose instance stays `tbd` until someone confirms the edition. */

import type { CalendarSnapshot, EventInstance, EventTemplate } from './types.js'

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

/** Gregorian Easter Sunday (anonymous computus). */
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return { month, day }
}

function addDays(year: number, month: number, day: number, offset: number): { year: number; month: number; day: number } {
  const date = new Date(Date.UTC(year, month - 1, day + offset))
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

function nthWeekday(year: number, month: number, weekday: number, nth: number | 'last' | 'after', referenceDay = 1): number | null {
  const total = daysInMonth(year, month)
  if (nth === 'last') {
    const lastWeekday = weekdayOf(year, month, total)
    return total - ((lastWeekday - weekday + 7) % 7)
  }
  if (nth === 'after') {
    const ref = Math.min(Math.max(1, referenceDay), total)
    const refWeekday = weekdayOf(year, month, ref)
    return ref + ((weekday - refWeekday + 7) % 7)
  }
  const firstWeekday = weekdayOf(year, month, 1)
  const day = 1 + ((weekday - firstWeekday + 7) % 7) + (nth - 1) * 7
  return day <= total ? day : null
}

/** Resolve one template to the instance of a given year. */
export function resolveInstance(template: EventTemplate, year: number): EventInstance {
  const duration = Math.max(1, template.recurrence.durationDays ?? template.typicalDurationDays)
  const status = template.defaultStatus ?? 'tbd'
  let from = ''
  let to = ''

  if (template.recurrence.kind === 'annual_easter') {
    const easter = easterSunday(year)
    const start = addDays(year, easter.month, easter.day, -7)
    const end = addDays(year, easter.month, easter.day, duration - 8)
    from = iso(start.year, start.month, start.day)
    to = iso(end.year, end.month, end.day)
  } else if (template.recurrence.kind === 'annual_nth_weekday') {
    const month = template.recurrence.month
    const weekday = template.recurrence.weekday
    const nth = template.recurrence.nth
    if (month && weekday !== undefined && nth !== undefined) {
      const day = nthWeekday(year, month, weekday, nth, template.recurrence.referenceDay)
      if (day !== null && day >= 1 && day <= daysInMonth(year, month)) {
        const end = addDays(year, month, day, duration - 1)
        from = iso(year, month, day)
        to = iso(end.year, end.month, end.day)
      }
    }
  } else {
    const month = template.recurrence.month
    const day = template.recurrence.day ?? 1
    if (month && month >= 1 && month <= 12) {
      const start = addDays(year, month, Math.min(day, daysInMonth(year, month)), 0)
      const end = addDays(year, month, start.day, duration - 1)
      from = iso(start.year, start.month, start.day)
      to = iso(end.year, end.month, end.day)
    }
  }

  return {
    templateId: template.id,
    name: template.name,
    ...(template.nameEn ? { nameEn: template.nameEn } : {}),
    year,
    from,
    to,
    status: from ? status : 'tbd',
    rule: template.recurrence.rule,
    confidence: template.confidence,
    source: { ...template.source },
    category: template.category,
    scope: template.scope,
    ...(template.notes ? { notes: template.notes } : {}),
    ...(template.notesEn ? { notesEn: template.notesEn } : {}),
  }
}

/** Calendar for one territory: local templates, plus national ones only when
 *  the pack explicitly includes them (with their uncertainty notes). */
export function buildCalendar(
  templates: EventTemplate[],
  territoryId: string,
  year: number,
  includeNational: boolean,
  allowedEventIds?: string[],
): CalendarSnapshot {
  const allowed = allowedEventIds ? new Set(allowedEventIds) : null
  const permitted = (template: EventTemplate) => !allowed || allowed.has(template.id)
  const local = templates.filter((template) => template.scope === 'local' && template.territory === territoryId && permitted(template))
  const national = includeNational
    ? templates.filter((template) => template.scope === 'national' && permitted(template))
    : []
  const applicable = [...local, ...national]
  const instances = applicable
    .map((template) => resolveInstance(template, year))
    .sort((a, b) => (a.from || '9999').localeCompare(b.from || '9999'))
  return {
    territoryId,
    year,
    curated: local.length > 0,
    nationalIncluded: includeNational && national.length > 0,
    templates: applicable,
    instances,
  }
}
