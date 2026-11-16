/** Explanations and justifications from template strings only. There is no
 *  language model anywhere in this path: every sentence is built from counts,
 *  pack labels and calendar rules. */

import type { Lang } from '../types.js'
import type { EventInstance } from '../calendar/types.js'
import type { Query, ThemeSuggestion } from './types.js'

export interface ExplanationInput {
  lang: Lang
  query: Query
  themeLabel?: string
  event?: EventInstance
  window?: { from: string; to: string }
  matched: number
  total: number
  sparse: boolean
  suggestions: ThemeSuggestion[]
  activeParts: number
}

function windowLabel(window: { from: string; to: string }): string {
  if (!window.from || !window.to) return '—'
  return window.from === window.to ? window.from : `${window.from} → ${window.to}`
}

export function explainState(input: ExplanationInput): string {
  const { lang, query, matched, total, sparse, suggestions } = input
  const parts: string[] = []

  if (query.kind === 'theme' && input.themeLabel) {
    parts.push(lang === 'en'
      ? `Theme “${input.themeLabel}”`
      : `Tema «${input.themeLabel}»`)
  }
  if ((query.kind === 'search' || query.kind === 'free') && query.text?.trim()) {
    const text = query.text.trim().slice(0, 60)
    parts.push(lang === 'en' ? `Search “${text}”` : `Ricerca «${text}»`)
  }
  if ((query.kind === 'event' || query.kind === 'free') && query.eventId && input.event) {
    const name = lang === 'en' ? input.event.nameEn ?? input.event.name : input.event.name
    const status = lang === 'en'
      ? input.event.status
      : ({ expected: 'atteso', confirmed: 'confermato', cancelled: 'annullato', tbd: 'da confermare' } as Record<string, string>)[input.event.status] ?? input.event.status
    parts.push(lang === 'en'
      ? `Event “${name}” (${input.event.year}) · rule: ${input.event.rule} · status: ${status}`
      : `Evento «${name}» (${input.event.year}) · regola: ${input.event.rule} · stato: ${status}`)
  } else if ((query.kind === 'event' || query.kind === 'free') && query.eventId) {
    parts.push(lang === 'en' ? 'Event selected · window not resolvable' : 'Evento selezionato · finestra non calcolabile')
  }
  if (input.window) {
    parts.push(lang === 'en'
      ? `window ${windowLabel(input.window)}`
      : `finestra ${windowLabel(input.window)}`)
  }

  if (!parts.length) {
    const base = lang === 'en'
      ? `Ordinary state · ${total} stories in the corpus · no active filter.`
      : `Stato ordinario · ${total} storie nel corpus · nessun filtro attivo.`
    return sparse
      ? `${base} ${lang === 'en' ? 'Few stories: the fabric declares the shortfall.' : 'Poche storie: il fabric dichiara l’insufficienza.'}`
      : base
  }

  const coverage = lang === 'en'
    ? `${matched} of ${total} stories relevant`
    : `${matched} storie rilevanti su ${total}`
  let out = `${parts.join(' · ')} · ${coverage}`
  if (input.activeParts > 1) out += lang === 'en' ? ' · criteria combined with AND' : ' · criteri combinati in AND'
  out += lang === 'en'
    ? ' · lexical + entity fallback (no embeddings)'
    : ' · fallback lessicale + entità (nessun embedding)'

  if (matched === 0) {
    const base = lang === 'en'
      ? `No story matches all criteria; the other ${total} remain in the attenuated context.`
      : `Nessuna storia corrisponde a tutti i criteri; le altre ${total} restano nel contesto attenuato.`
    const hint = suggestions.length
      ? (lang === 'en'
        ? ` Nearby themes with stories: ${suggestions.map((item) => `${lang === 'en' ? item.label.en : item.label.it} (${item.count})`).join(', ')}.`
        : ` Temi vicini con storie: ${suggestions.map((item) => item.label.it).join(', ')}.`)
      : (lang === 'en'
        ? ' No nearby theme has matching stories yet: the gap is data.'
        : ' Nessun tema vicino ha ancora storie: il vuoto è un dato.')
    return `${out} · ${base}${hint}`
  }
  if (sparse) {
    out += lang === 'en'
      ? ' · Few stories for this state: declared in the fabric.'
      : ' · Poche storie per questo stato: dichiarato nel fabric.'
  }
  return out
}

export interface EdgeFacts {
  type: string
  cell?: string | null
  meters?: number
  sharedTerms?: string[]
  sharedThemes?: string[]
  radiusM?: number
}

export function explainEdge(facts: EdgeFacts, lang: Lang): string {
  const en = lang === 'en'
  switch (facts.type) {
    case 'proximity':
      return en
        ? `≈ ${Math.round((facts.meters ?? 0) / 10) * 10} m · proximity (radius ${facts.radiusM ?? 0} m)`
        : `≈ ${Math.round((facts.meters ?? 0) / 10) * 10} m · prossimità (raggio ${facts.radiusM ?? 0} m)`
    case 'place':
      return en
        ? `Same anonymous cell ${facts.cell ?? '—'} · shared place`
        : `Stessa cella anonima ${facts.cell ?? '—'} · luogo condiviso`
    case 'cooccurrence': {
      const terms = (facts.sharedTerms ?? []).slice(0, 2).map((term) => `«${term}»`).join(', ')
      return en
        ? `${facts.sharedTerms?.length ?? 0} shared terms${terms ? `: ${terms}` : ''}`
        : `${facts.sharedTerms?.length ?? 0} termini in comune${terms ? `: ${terms}` : ''}`
    }
    case 'topic': {
      const themes = (facts.sharedThemes ?? []).join(', ')
      return en ? `Shared themes: ${themes}` : `Temi in comune: ${themes}`
    }
    case 'author_community':
      return en ? 'Recurring pseudonym · same anonymous voice' : 'Pseudonimo ricorrente · stessa voce anonima'
    default:
      return en ? 'Relation available' : 'Relazione disponibile'
  }
}
