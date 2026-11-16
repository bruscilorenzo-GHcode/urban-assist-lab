/** Emergent-state controls: theme chips, free search, recurring-event picker,
 *  removable active chips and the explanation of why this state. */

import { useEffect, useMemo, useState } from 'react'
import type { CalendarSnapshot } from '../core/calendar/types.js'
import type { ProjectPack } from '../core/packs/types.js'
import type { Query, State } from '../core/state/types.js'
import { composeQuery, type QueryParts } from '../core/state/url.js'
import type { Strings, UiLang } from './i18n'

export interface StatePanelProps {
  ui: UiLang
  t: Strings
  pack: ProjectPack | null
  calendar: CalendarSnapshot | null
  state: State | null
  loading: boolean
  error: string | null
  query: Query
  year: number
  onQuery: (query: Query) => void
  onYear: (year: number) => void
  onSelectStory: (storyId: string) => void
}

function partsOf(query: Query): QueryParts {
  const themeId = query.kind === 'theme' ? query.themeId : query.kind === 'free' ? query.themeId : undefined
  const text = query.kind === 'search' ? query.text : query.kind === 'free' ? query.text ?? '' : ''
  const eventId = query.kind === 'event' ? query.eventId : query.kind === 'free' ? query.eventId : undefined
  const year = query.kind === 'event' ? query.year : query.kind === 'free' ? query.year : undefined
  const from = query.kind === 'event' || query.kind === 'free' ? query.from : undefined
  const to = query.kind === 'event' || query.kind === 'free' ? query.to : undefined
  return { ...(themeId ? { themeId } : {}), ...(text ? { text } : {}), ...(eventId ? { eventId } : {}), ...(year ? { year } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) }
}

function statusLabel(t: Strings, status: string): string {
  if (status === 'confirmed') return t.statusConfirmed
  if (status === 'cancelled') return t.statusCancelled
  if (status === 'tbd') return t.statusTbd
  return t.statusExpected
}

function confidenceLabel(t: Strings, confidence: string): string {
  if (confidence === 'verified') return t.confidenceVerified
  if (confidence === 'client') return t.confidenceClient
  return t.confidenceApproximate
}

export default function StatePanel(props: StatePanelProps) {
  const { ui, t, pack, calendar, state, loading, error, query, year, onQuery, onYear, onSelectStory } = props
  const parts = useMemo(() => partsOf(query), [query])
  const currentText = parts.text ?? ''
  const [draft, setDraft] = useState(currentText)

  useEffect(() => {
    setDraft(currentText)
  }, [currentText])

  // Always carry the text currently in the field: clicking a theme or an
  // event must not discard uncommitted typing. Explicit overrides win.
  const commit = (override: QueryParts = {}) => {
    onQuery(composeQuery({ ...parts, text: draft.trim() || undefined, ...override }))
  }

  const activeTheme = pack?.themes.find((theme) => theme.id === parts.themeId) ?? null
  const selectedInstance = calendar?.instances.find((instance) => instance.templateId === parts.eventId) ?? null
  const foreground = state?.stories.filter((story) => story.band === 'foreground') ?? []
  const contextCount = state?.stories.filter((story) => story.band === 'context').length ?? 0
  const calendarNotCurated = !!calendar && !calendar.curated

  return (
    <section className="au-state" data-testid="state-panel">
      <div className="au-state-head">
        <h3>{t.stateTitle}</h3>
        <span className="au-media-label">{t.stateHint}</span>
      </div>

      <div className="au-state-themes">
        <span className="au-media-label">{t.themesLabel}</span>
        {(pack?.themes ?? []).map((theme) => (
          <button
            key={theme.id}
            type="button"
            className={`au-chip${parts.themeId === theme.id ? ' on' : ''}`}
            aria-pressed={parts.themeId === theme.id}
            onClick={() => commit({ themeId: parts.themeId === theme.id ? undefined : theme.id })}
          >
            {theme.label[ui]}
          </button>
        ))}
      </div>

      <form
        className="au-search"
        onSubmit={(event) => {
          event.preventDefault()
          commit({ text: draft })
        }}
      >
        <label>
          <span className="au-media-label">{t.searchLabel}</span>
          <input
            type="search"
            value={draft}
            maxLength={200}
            placeholder={t.searchPlaceholder}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => { if (draft !== currentText) commit({ text: draft }) }}
          />
        </label>
        <button type="submit" className="au-chip">{t.searchAction}</button>
      </form>

      <div className="au-state-events">
        <label>
          <span className="au-media-label">{t.eventsLabel}</span>
          <select
            value={parts.eventId ?? ''}
            disabled={calendarNotCurated}
            onChange={(event) => commit({ eventId: event.target.value || undefined })}
          >
            <option value="">{t.eventNone}</option>
            {(calendar?.instances ?? []).map((instance) => (
              <option key={instance.templateId} value={instance.templateId}>
                {(ui === 'en' ? instance.nameEn ?? instance.name : instance.name)} · {statusLabel(t, instance.status)}
              </option>
            ))}
          </select>
        </label>
        <label className="au-state-year">
          <span className="au-media-label">{t.calendarYear}</span>
          <select value={year} onChange={(event) => onYear(Number(event.target.value))}>
            {[year - 1, year, year + 1, year + 2].map((candidate) => (
              <option key={candidate} value={candidate}>{candidate}</option>
            ))}
          </select>
        </label>
      </div>

      {calendarNotCurated && <p className="au-hint au-state-empty">{t.calendarNotCurated}</p>}

      {selectedInstance && (
        <div className="au-event-detail">
          <p><b>{ui === 'en' ? selectedInstance.nameEn ?? selectedInstance.name : selectedInstance.name}</b> · {selectedInstance.rule}</p>
          <p className="au-meta">
            {t.eventWindow}: {selectedInstance.from || t.eventNoWindow} → {selectedInstance.to || t.eventNoWindow} · {t.eventStatus}: {statusLabel(t, selectedInstance.status)} · {t.eventConfidence}: {confidenceLabel(t, selectedInstance.confidence)}
          </p>
          <p className="au-hint">
            {t.eventSource}: <a href={selectedInstance.source.url} target="_blank" rel="noreferrer">{selectedInstance.source.url}</a> · {selectedInstance.source.retrievedAt}
          </p>
          <p className={`au-hint${selectedInstance.status === 'tbd' ? ' au-event-warning' : ''}`}>{t.eventConfirm}</p>
        </div>
      )}

      <div className="au-state-active">
        <span className="au-media-label">{t.activeFilters}</span>
        {activeTheme && (
          <button type="button" className="au-chip on" onClick={() => commit({ themeId: undefined })}>
            {activeTheme.label[ui]} ×<span className="au-sr">{t.removeFilter}</span>
          </button>
        )}
        {currentText && (
          <button type="button" className="au-chip on" onClick={() => { setDraft(''); commit({ text: undefined }) }}>
            “{currentText}” ×<span className="au-sr">{t.removeFilter}</span>
          </button>
        )}
        {selectedInstance && (
          <button type="button" className="au-chip on" onClick={() => commit({ eventId: undefined, from: undefined, to: undefined })}>
            {(ui === 'en' ? selectedInstance.nameEn ?? selectedInstance.name : selectedInstance.name)} ×<span className="au-sr">{t.removeFilter}</span>
          </button>
        )}
        {(parts.from || parts.to) && (
          <button type="button" className="au-chip" onClick={() => commit({ from: undefined, to: undefined })}>
            {parts.from ?? '…'} → {parts.to ?? '…'} ×<span className="au-sr">{t.removeFilter}</span>
          </button>
        )}
        {!activeTheme && !currentText && !selectedInstance && !parts.from && !parts.to && (
          <span className="au-hint">{t.stateCacheNote}</span>
        )}
      </div>

      {loading && <p className="au-hint" data-testid="state-loading">{t.stateLoading}</p>}
      {error && <p className="au-error">{t.stateError}: {error}</p>}

      {state && (
        <div className="au-state-result">
          <p className="au-state-explanation" data-testid="state-explanation">{state.explanation}</p>
          <p className="au-hint">
            {t.matchedStories(state.coverage.matched, state.coverage.total)} · {t.contextStories(contextCount)}
          </p>
          {state.coverage.matched === 0 && (
            <div className="au-state-empty">
              <p>{pack?.copy.emptyState[ui] ?? t.stateError}</p>
              {state.suggestions.length > 0 && (
                <>
                  <span className="au-media-label">{t.suggestionsLabel}</span>
                  <div className="au-state-suggestions">
                    {state.suggestions.map((suggestion) => (
                      <button
                        key={suggestion.themeId}
                        type="button"
                        className="au-chip"
                        onClick={() => commit({ themeId: suggestion.themeId })}
                      >
                        {suggestion.label[ui]} ({suggestion.count})
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {state.coverage.matched > 0 && state.coverage.sparse && (
            <p className="au-hint au-state-sparse">{pack?.copy.sparseState[ui] ?? t.fabricSparse}</p>
          )}

          {foreground.length > 0 && (
            <>
              <span className="au-media-label">{t.foregroundLabel}</span>
              <ol className="au-state-list">
                {foreground.slice(0, 8).map((story) => (
                  <li key={story.storyId}>
                    <button type="button" className="au-state-story" onClick={() => onSelectStory(story.storyId)}>
                      <span className="au-state-weight" aria-hidden="true">
                        <span style={{ width: `${Math.round(story.weight * 100)}%` }} />
                      </span>
                      <span className="au-state-excerpt">{story.excerpt}</span>
                      <small>
                        {t.weightLabel} {story.weight.toFixed(2)}
                        {story.matchedTerms.length > 0 ? ` · ${t.whyThis}: ${story.matchedTerms.join(', ')}` : ''}
                      </small>
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )}
          <p className="au-hint au-state-note">{t.fallbackNote}</p>
        </div>
      )}
    </section>
  )
}
