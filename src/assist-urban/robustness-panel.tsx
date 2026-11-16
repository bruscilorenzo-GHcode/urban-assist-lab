/** Small robustness chrome: build version, offline notice and the
 *  "report a problem" panel with attached technical context. Story text is
 *  never attached automatically. */

import { useState } from 'react'
import type { Strings } from './i18n'
import { APP_VERSION, shortVersion } from './version'
import { logTechnical, type TelemetryData } from './telemetry'

export function VersionBadge({ t }: { t: Strings }) {
  return (
    <span className="au-version" title={APP_VERSION} data-testid="build-version">
      {t.buildLabel} {shortVersion()}
    </span>
  )
}

export function OfflineBanner({ t, cachedAt }: { t: Strings; cachedAt: string | null }) {
  return (
    <div className="au-offline" role="status" data-testid="offline-banner">
      <b>{t.offlineBanner}</b>
      {cachedAt && <span> · {t.stateOffline.replace('{at}', cachedAt.slice(0, 16).replace('T', ' '))}</span>}
    </div>
  )
}

export interface ReportPanelProps {
  t: Strings
  context: TelemetryData
  onClose: () => void
}

export function ReportPanel({ t, context, onClose }: ReportPanelProps) {
  const [note, setNote] = useState('')
  const [sent, setSent] = useState(false)
  const [copied, setCopied] = useState(false)
  const contextText = JSON.stringify(context, null, 2)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(contextText)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const send = () => {
    logTechnical('problem.report', { ...context, ...(note.trim() ? { note: note.trim() } : {}) })
    setSent(true)
  }

  return (
    <section className="au-card au-report" data-testid="report-panel">
      <div className="au-project-head">
        <h2>{t.reportProblem}</h2>
        <button type="button" className="au-chip" onClick={onClose}>{t.projectClose}</button>
      </div>
      <p className="au-hint">{t.reportHint}</p>
      <label className="au-report-note">{t.reportNote}
        <textarea rows={3} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      <span className="au-media-label">{t.reportTechnical}</span>
      <pre className="au-json">{contextText}</pre>
      <div className="au-row">
        <button type="button" className="au-chip" onClick={() => void copy()}>{copied ? t.reportCopied : t.reportCopy}</button>
        <button type="button" className="au-submit" onClick={send} disabled={sent}>{sent ? t.reportSent : t.reportSend}</button>
      </div>
    </section>
  )
}
