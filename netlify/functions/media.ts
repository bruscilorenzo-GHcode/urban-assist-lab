/** Public read endpoint for stored media: GET /api/media?id=<id>. */

import { getStore } from '@netlify/blobs'
import type { Config, Context } from '@netlify/functions'

export default async (req: Request, _ctx: Context): Promise<Response> => {
  const cors = { 'Access-Control-Allow-Origin': '*' }
  if (req.method !== 'GET') return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } })
  const id = new URL(req.url).searchParams.get('id') ?? ''
  if (!/^[a-f0-9]{18}$/.test(id)) return new Response(JSON.stringify({ error: 'bad id' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
  const store = getStore('assist-urban-media', { consistency: 'strong' })
  const blob = await store.get(`media:${id}`, { type: 'arrayBuffer' })
  if (!blob) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } })
  // @netlify/blobs ≥ v10 returns { etag, metadata }; older versions returned
  // the metadata object itself. Support both shapes.
  const rawMeta = await store.getMetadata(`media:${id}`) as unknown
  const meta = (rawMeta && typeof rawMeta === 'object' && 'metadata' in rawMeta
    ? (rawMeta as { metadata?: { contentType?: string } }).metadata
    : rawMeta) as { contentType?: string } | null | undefined
  const contentType = meta?.contentType ?? 'application/octet-stream'
  return new Response(blob, {
    status: 200,
    headers: { ...cors, 'Content-Type': contentType, 'Cache-Control': 'public, max-age=31536000, immutable' },
  })
}

export const config: Config = { path: '/api/media' }
