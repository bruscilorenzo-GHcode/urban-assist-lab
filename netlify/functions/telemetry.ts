/** Netlify function: /api/telemetry
 *
 *  POST { event, data } — technical signal only (build, timings, HTTP status,
 *  network kind, dz id). The allow-list makes it impossible for story text or
 *  citizen data to enter the log by accident; a PM problem report carries only
 *  the note the person chose to write. */

import { getStore } from '@netlify/blobs'
import type { Config, Context } from '@netlify/functions'

const STORE = 'assist-urban-telemetry'
const PREFIX = 'ev:'
const MAX_EVENTS = 500
const MAX_STRING = 200
const EVENT_RE = /^[a-z][a-z0-9_.-]{2,40}$/

const ALLOWED_KEYS = new Set([
  'build', 'route', 'status', 'durationMs', 'kind', 'network', 'dz', 'error',
  'count', 'note', 'online', 'pack', 'mode', 'queryKind', 'matched', 'total',
])

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function cleanData(raw: unknown): Record<string, string | number | boolean> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!ALLOWED_KEYS.has(key)) continue
    if (typeof value === 'string') out[key] = value.slice(0, MAX_STRING)
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value
    else if (typeof value === 'boolean') out[key] = value
  }
  return out
}

function eventKey(): string {
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  const suffix = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${PREFIX}${String(Date.now()).padStart(13, '0')}:${suffix}`
}

export default async (req: Request, _ctx: Context): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' })

  try {
    const body = await req.json() as { event?: unknown; data?: unknown }
    const event = typeof body.event === 'string' ? body.event : ''
    if (!EVENT_RE.test(event)) return json(400, { error: 'valid event required' })
    const data = cleanData(body.data)
    const store = getStore(STORE, { consistency: 'strong' })
    await store.setJSON(eventKey(), { event, data, at: new Date().toISOString() })

    const listed = await store.list({ prefix: PREFIX })
    const keys = listed.blobs.map((blob) => blob.key)
    const excess = keys.slice(0, Math.max(0, keys.length - MAX_EVENTS))
    for (const key of excess) await store.delete(key)
    return json(202, { accepted: true })
  } catch {
    // Telemetry must never break the app: fail silently with a 202.
    return json(202, { accepted: false })
  }
}

export const config: Config = { path: '/api/telemetry' }
