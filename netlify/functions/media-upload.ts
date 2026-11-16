/** Media storage on Netlify Blobs (chunked upload, 50 MB budget per story).
 *
 *  POST /api/media-upload  JSON  { init: { contentType, size } }
 *      -> { id, chunkSize, chunks }   (opaque id; the original filename
 *         never leaves the browser)
 *  POST /api/media-upload  binary body, headers: x-media-id, x-chunk-index,
 *      x-chunk-total  -> { received, done } ; the final chunk triggers the
 *      server-side assembly (chunks are concatenated, size-validated and
 *      stored as a single immutable blob).
 *  GET  /api/media?id=<id> -> bytes with the stored content type.
 */

import { getStore } from '@netlify/blobs'
import type { Config, Context } from '@netlify/functions'
import { CHUNK_SIZE, MEDIA_MAX_TOTAL, chunksFor, kindOf, mediaId, validateMediaFile } from './lib/media.js'

export default async (req: Request, _ctx: Context): Promise<Response> => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-media-id, x-chunk-index, x-chunk-total',
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

  const store = getStore('assist-urban-media', { consistency: 'strong' })

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url)
      // Resumable upload: which chunks already arrived for this session.
      const session = url.searchParams.get('session')
      if (session !== null) {
        if (!/^[a-f0-9]{18}$/.test(session)) return json(400, { error: 'bad session' }, cors)
        const init = await store.get(`init:${session}`, { type: 'json' }) as { chunks: number } | null
        if (!init) return json(404, { error: 'upload session not found' }, cors)
        const listed = await store.list({ prefix: `chunk:${session}:` })
        const received = listed.blobs
          .map((blob) => Number(blob.key.split(':').at(-1)))
          .filter((index) => Number.isInteger(index) && index >= 0 && index < init.chunks)
          .sort((a, b) => a - b)
        return json(200, { id: session, chunks: init.chunks, received }, cors)
      }
      const id = url.searchParams.get('id')
      if (!id || !/^[a-f0-9]{18}$/.test(id)) return json(400, { error: 'bad id' }, cors)
      const blob = await store.get(`media:${id}`, { type: 'arrayBuffer' })
      if (!blob) return json(404, { error: 'not found' }, cors)
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

    if (req.method !== 'POST') return json(405, { error: 'method not allowed' }, cors)

    const contentTypeHeader = req.headers.get('content-type') ?? ''

    // -- init --------------------------------------------------------------
    if (contentTypeHeader.includes('application/json')) {
      const body = await req.json() as { init?: { contentType?: string, size?: number } }
      const init = body?.init
      if (!init || typeof init.contentType !== 'string' || typeof init.size !== 'number') {
        return json(400, { error: 'expected { init: { contentType, size } }' }, cors)
      }
      const check = validateMediaFile(init.contentType, init.size)
      if (!check.ok) return json(415, { error: check.error }, cors)
      const id = mediaId()
      await store.setJSON(`init:${id}`, {
        contentType: init.contentType,
        size: init.size,
        chunks: chunksFor(init.size),
      })
      return json(200, { id, chunkSize: CHUNK_SIZE, chunks: chunksFor(init.size) }, cors)
    }

    // -- chunk upload --------------------------------------------------------
    const id = req.headers.get('x-media-id') ?? ''
    const index = Number(req.headers.get('x-chunk-index') ?? '0')
    const total = Number(req.headers.get('x-chunk-total') ?? '0')
    if (!/^[a-f0-9]{18}$/.test(id) || !Number.isInteger(index) || index < 0 || !Number.isInteger(total) || total < 1) {
      return json(400, { error: 'bad chunk headers' }, cors)
    }
    const initRaw = await store.get(`init:${id}`, { type: 'json' }) as { contentType: string, size: number, chunks: number } | null
    if (!initRaw) return json(404, { error: 'upload session not found' }, cors)
    if (total !== initRaw.chunks) return json(400, { error: 'chunk count mismatch' }, cors)

    const bytes = new Uint8Array(await req.arrayBuffer())
    if (bytes.byteLength > CHUNK_SIZE) return json(413, { error: 'chunk too large' }, cors)
    await store.set(`chunk:${id}:${index}`, bytes.buffer as ArrayBuffer)

    if (index < total - 1) return json(200, { received: index + 1, done: false }, cors)

    // -- final chunk: assemble ------------------------------------------------
    const parts: Uint8Array[] = []
    let assembled = 0
    for (let i = 0; i < total; i++) {
      const chunk = await store.get(`chunk:${id}:${i}`, { type: 'arrayBuffer' })
      if (!chunk) return json(400, { error: `missing chunk ${i}` }, cors)
      parts.push(new Uint8Array(chunk))
      assembled += chunk.byteLength
    }
    if (assembled !== initRaw.size || assembled > MEDIA_MAX_TOTAL) {
      return json(400, { error: 'assembled size mismatch / over budget' }, cors)
    }
    const blobData = new Uint8Array(assembled)
    let offset = 0
    for (const part of parts) { blobData.set(part, offset); offset += part.byteLength }
    await store.set(`media:${id}`, blobData.buffer as ArrayBuffer, {
      metadata: { contentType: initRaw.contentType, size: assembled },
    })
    for (let i = 0; i < total; i++) await store.delete(`chunk:${id}:${i}`)
    await store.delete(`init:${id}`)
    return json(200, { id, done: true, kind: kindOf(initRaw.contentType) }, cors)
  } catch (err) {
    return json(500, { error: err instanceof Error ? err.message : 'media upload failure' }, cors)
  }
}

function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

export const config: Config = { path: '/api/media-upload' }
