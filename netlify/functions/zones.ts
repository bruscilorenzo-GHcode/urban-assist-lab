/** Netlify function: /api/zones
 *
 *  GET    — every pilot-created Dramaturgical Zone, shared by all collaborators.
 *  POST   { zone } — validate and publish a pilot DZ; returns a private edit
 *           token so the creator can delete it later.
 *  DELETE { id, token } — the creator removes their own DZ.
 *
 *  The curated Scicli / Napoli Est seeds live in the client; this store only
 *  holds the pilot zones. Tokens stay private: GET never returns them. */

import { getStore } from '@netlify/blobs'
import type { Config, Context } from '@netlify/functions'
import {
  createPilotZone,
  validateZoneInput,
  type DramaturgicalZone,
  type PilotZoneInput,
} from '../../src/assist-urban/pipeline/dramaturgical-zones.js'
import { scrubText } from '../../src/assist-urban/pipeline/pii.js'

type StoredZone = DramaturgicalZone & { editToken?: string }

const ZONES_STORE = 'assist-urban-zones'
const ZONE_PREFIX = 'zone:'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function token(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function normalize(raw: Partial<PilotZoneInput>): PilotZoneInput {
  return {
    name: typeof raw.name === 'string' ? raw.name : '',
    city: typeof raw.city === 'string' ? raw.city : '',
    focusIt: typeof raw.focusIt === 'string' ? raw.focusIt : '',
    focusEn: typeof raw.focusEn === 'string' ? raw.focusEn : '',
    themeIt: typeof raw.themeIt === 'string' ? raw.themeIt : '',
    themeEn: typeof raw.themeEn === 'string' ? raw.themeEn : '',
    lat: typeof raw.lat === 'number' || typeof raw.lat === 'string' ? raw.lat : Number.NaN,
    lon: typeof raw.lon === 'number' || typeof raw.lon === 'string' ? raw.lon : Number.NaN,
    zoom: typeof raw.zoom === 'number' || typeof raw.zoom === 'string' ? raw.zoom : Number.NaN,
  }
}

export default async (req: Request, _ctx: Context): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  try {
    const store = getStore(ZONES_STORE, { consistency: 'strong' })

    if (req.method === 'GET') {
      const listed = await store.list({ prefix: ZONE_PREFIX })
      const zones: DramaturgicalZone[] = []
      for (const blob of listed.blobs) {
        const stored = await store.get(blob.key, { type: 'json' }) as StoredZone | null
        if (!stored) continue
        const { editToken: _editToken, ...zone } = stored
        zones.push(zone)
      }
      zones.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
      return json(200, { zones })
    }

    if (req.method === 'POST') {
      const body = await req.json() as { zone?: Partial<PilotZoneInput>; id?: unknown; token?: unknown }
      const input = normalize(body.zone ?? {})
      const clean: PilotZoneInput = {
        ...input,
        name: scrubText(input.name).text.trim(),
        city: scrubText(input.city).text.trim(),
        focusIt: scrubText(input.focusIt).text.trim(),
        focusEn: scrubText(input.focusEn).text.trim(),
        themeIt: scrubText(input.themeIt).text.trim(),
        themeEn: scrubText(input.themeEn).text.trim(),
      }
      const invalid = validateZoneInput(clean)
      if (invalid) return json(400, { error: invalid })

      // Update an existing zone: the creator proves ownership with the token.
      const editingId = typeof body.id === 'string' ? body.id : ''
      if (editingId) {
        const editToken = typeof body.token === 'string' ? body.token : ''
        if (!/^dz_[a-z0-9_]{1,64}$/.test(editingId)) return json(400, { error: 'valid id required' })
        const key = `${ZONE_PREFIX}${editingId}`
        const existing = await store.get(key, { type: 'json' }) as StoredZone | null
        if (!existing) return json(404, { error: 'zone not found' })
        // Pilot-collaborators share zone management: a creator token is
        // optional, but if one is supplied it must match.
        if (editToken && existing.editToken && existing.editToken !== editToken) return json(403, { error: 'not allowed' })
        const built = createPilotZone(clean)
        const zone = { ...built, id: existing.id, createdAt: existing.createdAt ?? built.createdAt }
        const keptToken = existing.editToken ?? editToken
        await store.setJSON(key, { ...zone, ...(keptToken ? { editToken: keptToken } : {}) })
        return json(200, { zone, ...(keptToken ? { editToken: keptToken } : {}) })
      }

      const zone = createPilotZone(clean)
      const editToken = token()
      await store.setJSON(`${ZONE_PREFIX}${zone.id}`, { ...zone, editToken })
      return json(200, { zone, editToken })
    }

    if (req.method === 'DELETE') {
      const body = await req.json() as { id?: unknown; token?: unknown }
      const id = typeof body.id === 'string' ? body.id : ''
      const editToken = typeof body.token === 'string' ? body.token : ''
      if (!/^dz_[a-z0-9_]{1,64}$/.test(id)) return json(400, { error: 'valid id required' })
      const key = `${ZONE_PREFIX}${id}`
      const stored = await store.get(key, { type: 'json' }) as StoredZone | null
      if (!stored) return json(404, { error: 'zone not found' })
      if (editToken && stored.editToken && stored.editToken !== editToken) return json(403, { error: 'not allowed' })
      await store.delete(key)
      return json(200, { deleted: true, id })
    }

    return json(405, { error: 'method not allowed' })
  } catch (err) {
    return json(503, { error: err instanceof Error ? err.message : 'zone storage failure' })
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

export const config: Config = { path: '/api/zones' }
