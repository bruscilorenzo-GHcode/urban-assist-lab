/** Netlify function: /api/packs
 *
 *  GET  — seed packs plus PM-saved packs (no edit tokens).
 *  POST { pack, token? } — validate and save a PM pack; seed ids are
 *         read-only, so a curated pack is duplicated under a new id.
 *
 *  Packs are data: saving one requires no deploy. Edit tokens stay private,
 *  mirroring the pilot-zone flow. */

import { getStore } from '@netlify/blobs'
import type { Config, Context } from '@netlify/functions'
import { SEED_PACK_IDS, SEED_PACKS } from '../../src/core/packs/seeds.js'
import type { ProjectPack } from '../../src/core/packs/types.js'
import { parseProjectPack } from '../../src/core/packs/validate.js'

const STORE = 'assist-urban-packs'
const PREFIX = 'pack:'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function token(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

type StoredPack = ProjectPack & { editToken?: string }

async function listStored(): Promise<StoredPack[]> {
  const store = getStore(STORE, { consistency: 'strong' })
  const listed = await store.list({ prefix: PREFIX })
  const packs: StoredPack[] = []
  for (const blob of listed.blobs) {
    const raw = await store.get(blob.key, { type: 'json' }) as StoredPack | null
    if (!raw) continue
    const parsed = parseProjectPack(raw)
    if (parsed.ok) packs.push({ ...parsed.pack, ...(raw.editToken ? { editToken: raw.editToken } : {}) })
  }
  return packs
}

export default async (req: Request, _ctx: Context): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  if (req.method === 'GET') {
    try {
      const stored = await listStored()
      const id = new URL(req.url).searchParams.get('id')
      const publicPacks = [...SEED_PACKS, ...stored.map(({ editToken: _editToken, ...pack }) => pack)]
      if (id) {
        const match = publicPacks.find((pack) => pack.id === id)
        return match ? json(200, { pack: match }) : json(404, { error: 'pack not found' })
      }
      return json(200, { packs: publicPacks })
    } catch (err) {
      return json(503, { error: err instanceof Error ? err.message : 'pack storage failure' })
    }
  }

  if (req.method !== 'POST') return json(405, { error: 'method not allowed' })

  try {
    const body = await req.json() as { pack?: unknown; token?: unknown }
    const parsed = parseProjectPack(body.pack)
    if (!parsed.ok) return json(400, { error: 'invalid pack', issues: parsed.issues })
    const pack = parsed.pack
    if (SEED_PACK_IDS.has(pack.id)) {
      return json(409, { error: 'seed pack is read-only: duplicate it under a new id' })
    }

    const store = getStore(STORE, { consistency: 'strong' })
    const key = `${PREFIX}${pack.id}`
    const existing = await store.get(key, { type: 'json' }) as StoredPack | null
    const supplied = typeof body.token === 'string' ? body.token : ''
    if (existing?.editToken && existing.editToken !== supplied) return json(403, { error: 'not allowed' })

    const editToken = existing?.editToken ?? token()
    await store.setJSON(key, { ...pack, editToken })
    return json(200, { pack, editToken })
  } catch (err) {
    return json(503, { error: err instanceof Error ? err.message : 'pack storage failure' })
  }
}

export const config: Config = { path: '/api/packs' }
