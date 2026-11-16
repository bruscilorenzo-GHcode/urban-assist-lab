/** Netlify function: /api/cities
 *
 *  GET  — the shared cities created by pilot-collaborators.
 *  POST { city: { name, lat, lon, zoom } } — create a city once (deduplicated
 *           by name). Zones then live inside it.
 *
 *  The client geocodes the city name; this function validates and persists the
 *  centre, so every collaborator can pick the city in the zone form. */

import { getStore } from '@netlify/blobs'
import type { Config, Context } from '@netlify/functions'
import { makeCityId, type City } from '../../src/assist-urban/cities.js'

const STORE = 'assist-urban-cities'
const PREFIX = 'city:'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default async (req: Request, _ctx: Context): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  try {
    const store = getStore(STORE, { consistency: 'strong' })

    if (req.method === 'GET') {
      const listed = await store.list({ prefix: PREFIX })
      const cities: City[] = []
      for (const blob of listed.blobs) {
        const city = await store.get(blob.key, { type: 'json' }) as City | null
        if (city) cities.push(city)
      }
      cities.sort((a, b) => a.name.localeCompare(b.name))
      return json(200, { cities })
    }

    if (req.method !== 'POST') return json(405, { error: 'method not allowed' })
    const body = await req.json() as { city?: { name?: unknown; lat?: unknown; lon?: unknown; zoom?: unknown } }
    const raw = body.city ?? {}
    const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 60) : ''
    const lat = Number(raw.lat)
    const lon = Number(raw.lon)
    const zoom = Number(raw.zoom)
    if (name.length < 2) return json(400, { error: 'city name required' })
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return json(400, { error: 'valid city coordinates required' })
    }
    const listed = await store.list({ prefix: PREFIX })
    for (const blob of listed.blobs) {
      const existing = await store.get(blob.key, { type: 'json' }) as City | null
      if (existing && existing.name.toLowerCase() === name.toLowerCase()) return json(200, { city: existing })
    }
    const city: City = {
      id: makeCityId(name),
      name,
      center: [lat, lon],
      zoom: Number.isFinite(zoom) ? Math.min(16, Math.max(6, Math.round(zoom))) : 12,
      createdAt: new Date().toISOString(),
    }
    await store.setJSON(`${PREFIX}${city.id}`, city)
    return json(200, { city })
  } catch (err) {
    return json(503, { error: err instanceof Error ? err.message : 'city storage failure' })
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

export const config: Config = { path: '/api/cities' }
