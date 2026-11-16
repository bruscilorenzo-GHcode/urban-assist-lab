/** Recurring event templates + yearly instances. A single date is never
 *  stored alone: every event keeps its recurrence rule, its source and its
 *  confidence, and an uncertain edition is `tbd` — never invented. */

export type EventScope = 'local' | 'national'
export type EventConfidence = 'verified' | 'approximate' | 'client'
export type EventStatus = 'expected' | 'confirmed' | 'cancelled' | 'tbd'

export type RecurrenceKind = 'annual_month' | 'annual_easter' | 'annual_nth_weekday' | 'fixed'

export interface EventSource {
  url: string
  retrievedAt: string
}

export interface Recurrence {
  kind: RecurrenceKind
  /** Human-readable rule, shown to everyone. */
  rule: string
  month?: number
  day?: number
  /** 0 = Sunday … 6 = Saturday. */
  weekday?: number
  nth?: number | 'last' | 'after'
  referenceDay?: number
  durationDays?: number
}

export interface EventTemplate {
  id: string
  name: string
  nameEn?: string
  territory: string
  scope: EventScope
  recurrence: Recurrence
  typicalDurationDays: number
  category: string
  source: EventSource
  confidence: EventConfidence
  notes?: string
  notesEn?: string
  /** Status of an uncontested yearly instance; uncertain ones default to tbd. */
  defaultStatus?: EventStatus
}

export interface EventInstance {
  templateId: string
  name: string
  nameEn?: string
  year: number
  /** YYYY-MM-DD; empty when the rule cannot produce a date (status is tbd). */
  from: string
  to: string
  status: EventStatus
  rule: string
  confidence: EventConfidence
  source: EventSource
  category: string
  scope: EventScope
  notes?: string
  notesEn?: string
}

export interface CalendarSnapshot {
  territoryId: string
  year: number
  /** false = "calendar not curated yet", declared — never a silent empty list. */
  curated: boolean
  nationalIncluded: boolean
  templates: EventTemplate[]
  instances: EventInstance[]
}
