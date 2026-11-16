/** Project panel, reachable only from `?pm=1`: choose a pack, change palette
 *  and fabric parameters, set the default theme, copy the state URL, export /
 *  import JSON and save a shared pack. A PM customises data, never code. */

import { useEffect, useMemo, useRef, useState } from 'react'
import { PALETTE_PRESETS } from '../core/packs/presets.js'
import { SEED_PACK_IDS } from '../core/packs/seeds.js'
import type { ProjectPack } from '../core/packs/types.js'
import { describePackIssue, parsePackJson, parseProjectPack, serializePack } from '../core/packs/validate.js'
import type { Query } from '../core/state/types.js'
import type { Strings, UiLang } from './i18n'

export const PACK_TOKENS_KEY = 'assist-urban.pack-tokens.v1'

type PackTokens = Record<string, string>

function loadTokens(): PackTokens {
  try {
    const raw = window.localStorage.getItem(PACK_TOKENS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as PackTokens : {}
  } catch {
    return {}
  }
}

function saveTokens(tokens: PackTokens): void {
  try {
    window.localStorage.setItem(PACK_TOKENS_KEY, JSON.stringify(tokens))
  } catch {
    // private mode: the save still works for this session
  }
}

export interface ProjectPanelProps {
  ui: UiLang
  t: Strings
  pack: ProjectPack
  library: ProjectPack[]
  shareUrl: string
  onApply: (pack: ProjectPack) => void
  onSaved: (pack: ProjectPack) => void
  onApplyDefaults: (query: Query | undefined) => void
  onClose: () => void
}

export default function ProjectPanel(props: ProjectPanelProps) {
  const { ui, t, pack, library, shareUrl, onApply, onSaved, onApplyDefaults, onClose } = props
  const [draft, setDraft] = useState<ProjectPack>(pack)
  const [newId, setNewId] = useState(pack.id)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileInput = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setDraft(pack)
    setNewId(SEED_PACK_IDS.has(pack.id) ? `${pack.id}_copy` : pack.id)
  }, [pack.id])

  const parsed = useMemo(() => parseProjectPack(draft), [draft])
  const issues = parsed.ok ? [] : parsed.issues

  const update = (next: ProjectPack) => {
    setDraft(next)
    setStatus(null)
    setError(null)
    onApply(next)
  }

  const applyPack = (candidate: ProjectPack) => {
    setDraft(candidate)
    setNewId(SEED_PACK_IDS.has(candidate.id) ? `${candidate.id}_copy` : candidate.id)
    setStatus(null)
    setError(null)
    onApply(candidate)
  }

  const choosePack = (id: string) => {
    const found = library.find((candidate) => candidate.id === id)
    if (found) applyPack(found)
  }

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setStatus(t.projectCopied)
    } catch {
      setCopied(false)
      setError(t.stateError)
    }
  }

  const exportPack = () => {
    const blob = new Blob([serializePack(draft)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${draft.id}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const importPack = async (file: File | undefined) => {
    if (!file) return
    const text = await file.text()
    const result = parsePackJson(text)
    if (!result.ok) {
      setError(`${t.projectImportErrors}: ${result.issues.slice(0, 3).map((issue) => describePackIssue(issue, ui)).join(' · ')}`)
      return
    }
    applyPack(result.pack)
    setStatus(`${t.projectApply}: ${result.pack.name}`)
  }

  const saveShared = async () => {
    setError(null)
    setStatus(null)
    const targetId = SEED_PACK_IDS.has(draft.id) ? newId.trim() : draft.id
    const candidate: ProjectPack = { ...draft, id: targetId }
    const check = parseProjectPack(candidate)
    if (!check.ok) {
      setError(check.issues.slice(0, 4).map((issue) => describePackIssue(issue, ui)).join(' · '))
      return
    }
    setSaving(true)
    try {
      const tokens = loadTokens()
      const res = await fetch('/api/packs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack: check.pack, ...(tokens[targetId] ? { token: tokens[targetId] } : {}) }),
      })
      const body = await res.json().catch(() => ({})) as { pack?: ProjectPack; editToken?: string; error?: string; issues?: unknown }
      if (!res.ok || !body.pack) {
        setError(body.error ?? `HTTP ${res.status}`)
        return
      }
      if (body.editToken) {
        saveTokens({ ...tokens, [body.pack.id]: body.editToken })
      }
      applyPack(body.pack)
      onSaved(body.pack)
      setStatus(t.projectSaved)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.projectSaveFailed)
    } finally {
      setSaving(false)
    }
  }

  const seedSelected = SEED_PACK_IDS.has(draft.id)
  const paletteName = PALETTE_PRESETS.find((preset) => preset.colors.join() === draft.fabric.palette.colors.join())?.name ?? 'custom'
  const defaultThemeId = draft.defaults.query
    ? (draft.defaults.query.kind === 'theme' ? draft.defaults.query.themeId : draft.defaults.query.kind === 'free' ? draft.defaults.query.themeId : undefined)
    : undefined

  return (
    <section className="au-card au-project" data-testid="project-panel">
      <div className="au-project-head">
        <h2>{t.projectTitle}</h2>
        <span className="au-badge">{t.projectPmOnly}</span>
        <button type="button" className="au-chip" onClick={onClose}>{t.projectClose}</button>
      </div>
      <p className="au-hint">{t.projectHint}</p>

      <div className="au-project-grid">
        <label>{t.projectPack}
          <select value={draft.id} onChange={(event) => choosePack(event.target.value)}>
            {!library.some((candidate) => candidate.id === draft.id) && (
              <option value={draft.id}>{draft.id} (local)</option>
            )}
            {library.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.id}</option>
            ))}
          </select>
        </label>

        <label>{t.projectPalette}
          <select
            value={paletteName}
            onChange={(event) => {
              const preset = PALETTE_PRESETS.find((candidate) => candidate.name === event.target.value)
              if (!preset) return
              update({ ...draft, fabric: { ...draft.fabric, palette: { ...preset, colors: [...preset.colors] } } })
            }}
          >
            {paletteName === 'custom' && <option value="custom">custom</option>}
            {PALETTE_PRESETS.map((preset) => (
              <option key={preset.name} value={preset.name}>{preset.name} · {preset.colors.length}</option>
            ))}
          </select>
        </label>

        <label>{t.projectMode}
          <select
            value={draft.fabric.defaultMode}
            onChange={(event) => update({
              ...draft,
              fabric: { ...draft.fabric, defaultMode: event.target.value === 'field' ? 'field' : 'filaments' },
            })}
          >
            <option value="filaments">{t.fabricFilaments}</option>
            <option value="field">{t.fabricField}</option>
          </select>
        </label>

        <label>{t.projectDefaultTheme}
          <select
            value={defaultThemeId ?? ''}
            onChange={(event) => update({
              ...draft,
              defaults: {
                ...draft.defaults,
                query: event.target.value ? { kind: 'theme', themeId: event.target.value } : undefined,
              },
            })}
          >
            <option value="">—</option>
            {draft.themes.map((theme) => (
              <option key={theme.id} value={theme.id}>{theme.label[ui]}</option>
            ))}
          </select>
        </label>

        <label>{t.projectOpacity} · {Math.round(draft.fabric.defaultOpacity * 100)}%
          <input
            type="range" min={0} max={100} step={1}
            value={Math.round(draft.fabric.defaultOpacity * 100)}
            onChange={(event) => update({ ...draft, fabric: { ...draft.fabric, defaultOpacity: Number(event.target.value) / 100 } })}
          />
        </label>

        <label>{t.projectCurvature} · {Math.round(draft.fabric.curvature * 100)}%
          <input
            type="range" min={0} max={100} step={1}
            value={Math.round(draft.fabric.curvature * 100)}
            onChange={(event) => update({ ...draft, fabric: { ...draft.fabric, curvature: Number(event.target.value) / 100 } })}
          />
        </label>

        <label>{t.fabricThickness} · {draft.fabric.thickness.toFixed(1)}
          <input
            type="range" min={5} max={60} step={1}
            value={Math.round(draft.fabric.thickness * 10)}
            onChange={(event) => update({ ...draft, fabric: { ...draft.fabric, thickness: Number(event.target.value) / 10 } })}
          />
        </label>

        <label>{t.fabricHalo} · {Math.round(draft.fabric.halo * 100)}%
          <input
            type="range" min={0} max={100} step={1}
            value={Math.round(draft.fabric.halo * 100)}
            onChange={(event) => update({ ...draft, fabric: { ...draft.fabric, halo: Number(event.target.value) / 100 } })}
          />
        </label>
      </div>

      {issues.length > 0 && (
        <ul className="au-project-issues" data-testid="project-issues">
          {issues.slice(0, 5).map((issue, index) => (
            <li key={`${issue.code}-${index}`}>{describePackIssue(issue, ui)}</li>
          ))}
        </ul>
      )}

      {seedSelected && <p className="au-hint">{t.projectSeedReadOnly}</p>}
      {seedSelected && (
        <label className="au-project-newid">{t.projectNewId}
          <input value={newId} onChange={(event) => setNewId(event.target.value)} />
        </label>
      )}

      <div className="au-project-actions">
        <button type="button" className="au-chip" onClick={() => void copyUrl()}>{copied ? t.projectCopied : t.projectCopyUrl}</button>
        <button type="button" className="au-chip" onClick={exportPack}>{t.projectExport}</button>
        <button type="button" className="au-chip" onClick={() => fileInput.current?.click()}>{t.projectImport}</button>
        <button type="button" className="au-chip" onClick={() => onApplyDefaults(draft.defaults.query)}>{t.projectApply} {t.projectDefaultTheme.toLowerCase()}</button>
        <button type="button" className="au-chip" onClick={() => applyPack(pack)}>{t.projectReset}</button>
        <button type="button" className="au-submit" disabled={saving || issues.length > 0} onClick={() => void saveShared()}>
          {saving ? t.submitting : t.projectSave}
        </button>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(event) => { void importPack(event.target.files?.[0]); event.target.value = '' }} />
      </div>

      <label className="au-project-url">{t.projectCopyUrl}
        <input readOnly value={shareUrl} onFocus={(event) => event.currentTarget.select()} />
      </label>
      {status && <p className="au-hint au-zone-notice">{status}</p>}
      {error && <p className="au-error">{error}</p>}
      <p className="au-hint">{seedSelected ? t.projectLocalNote : t.projectServerNote} · {t.projectTokenNote}</p>
    </section>
  )
}
