/** Shared primitives for the emergent-state core.
 *
 *  Nothing in `src/core/state`, in the fabric or in `/api/state` may name a
 *  city, a zone, a theme or an event: those are data (packs, calendar seeds)
 *  loaded per territory. The generic test enforces this. */

export type Lang = 'it' | 'en'

/** Every human-readable pack string is bilingual; the brief writes `string`,
 *  the project requires IT/EN parity, so packs store both and imports accept
 *  a plain string (normalised to both languages). */
export interface Localized {
  it: string
  en: string
}

export function pickLocalized(value: Localized, lang: Lang): string {
  return lang === 'en' ? value.en : value.it
}

export function asLocalized(value: unknown, fallback = ''): Localized {
  if (typeof value === 'string') return { it: value, en: value }
  if (value && typeof value === 'object') {
    const raw = value as { it?: unknown; en?: unknown }
    const it = typeof raw.it === 'string' ? raw.it : fallback
    const en = typeof raw.en === 'string' ? raw.en : it
    return { it, en }
  }
  return { it: fallback, en: fallback }
}
