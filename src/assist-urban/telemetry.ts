/** Technical telemetry only. The allow-list below is the same one enforced by
 *  /api/telemetry: story text, captions and free narration never enter a log.
 *  A problem report adds only the note the person explicitly writes. */

import { APP_VERSION } from './version'

const ALLOWED_KEYS = new Set([
  'build', 'status', 'durationMs', 'kind', 'network', 'dz', 'error',
  'count', 'note', 'online', 'pack', 'mode', 'queryKind', 'matched', 'total',
])

export type TelemetryData = Record<string, string | number | boolean | undefined>

function networkKind(): string {
  if (typeof navigator === 'undefined') return 'unknown'
  if (navigator.onLine === false) return 'offline'
  const connection = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection
  return connection?.effectiveType ?? 'unknown'
}

export function technicalContext(extra: TelemetryData = {}): TelemetryData {
  return {
    build: APP_VERSION,
    network: networkKind(),
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    ...extra,
  }
}

export function logTechnical(event: string, data: TelemetryData = {}): void {
  if (typeof fetch !== 'function' || !/^[a-z][a-z0-9_.-]{2,40}$/.test(event)) return
  const clean: TelemetryData = {}
  for (const [key, value] of Object.entries({ ...technicalContext(), ...data })) {
    if (!ALLOWED_KEYS.has(key)) continue
    if (typeof value === 'string') clean[key] = value.slice(0, 200)
    else if (typeof value === 'number' && Number.isFinite(value)) clean[key] = value
    else if (typeof value === 'boolean') clean[key] = value
  }
  try {
    void fetch('/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ event, data: clean }),
    }).catch(() => undefined)
  } catch {
    // Telemetry must never break the page.
  }
}

/** Error name only: messages may contain citizen text, so they are dropped. */
export function installTelemetry(): () => void {
  if (typeof window === 'undefined') return () => undefined
  const onError = (event: ErrorEvent) => {
    logTechnical('window.error', { error: event.error?.name ?? 'Error', route: 'app' })
  }
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason as { name?: unknown } | null
    logTechnical('promise.rejection', { error: typeof reason?.name === 'string' ? reason.name : 'Rejection', route: 'app' })
  }
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
  }
}
