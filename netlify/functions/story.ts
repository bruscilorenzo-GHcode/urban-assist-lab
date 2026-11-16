/** Netlify function: /api/story
 *
 *  POST   — publish one multimedia urban story and persist the sanitised
 *           record plus a private delete token in Netlify Blobs.
 *  GET    ?dz=<id> — the newest stored stories of one Dramaturgical Zone;
 *           the delete token is never returned.
 *  DELETE { id, dz, token } — the author (the browser that holds the token)
 *           removes their own story, with its media, from Blobs.
 *
 *  Only the sanitised record is stored: scrubbed text, anonymous cell (or no
 *  geo), pseudonym and opaque media ids. Exact coordinates never reach Blobs. */

import { getStore } from '@netlify/blobs'
import type { Config, Context } from '@netlify/functions'
import { publishStory, type PublishedStory } from '../../src/assist-urban/story.js'
import {
  MAX_STORED_STORIES,
  STORIES_STORE,
  newestFirst,
  normalizeDz,
  storyKey,
  storyPrefix,
} from './lib/stories.js'

type StoredStory = PublishedStory & { editToken?: string }

const MEDIA_STORE = 'assist-urban-media'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function makeDeleteToken(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export default async (req: Request, _ctx: Context): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  if (req.method === 'GET') {
    const dz = normalizeDz(new URL(req.url).searchParams.get('dz'))
    if (!dz) return json(400, { error: 'valid dz required' })
    try {
      const store = getStore(STORIES_STORE, { consistency: 'strong' })
      const listed = await store.list({ prefix: storyPrefix(dz) })
      const keys = listed.blobs.map((blob) => blob.key).slice(-MAX_STORED_STORIES)
      const stories: PublishedStory[] = []
      for (const key of keys) {
        const stored = await store.get(key, { type: 'json' }) as StoredStory | null
        if (stored && stored.dz === dz) {
          const { editToken: _editToken, ...story } = stored
          stories.push(story)
        }
      }
      return json(200, { stories: newestFirst(stories) })
    } catch (err) {
      return json(503, { error: 'story storage unavailable', detail: messageOf(err) })
    }
  }

  if (req.method === 'DELETE') {
    try {
      const body = await req.json() as { id?: unknown; dz?: unknown; token?: unknown }
      const id = typeof body.id === 'string' ? body.id : ''
      const dz = normalizeDz(body.dz)
      const token = typeof body.token === 'string' ? body.token : ''
      if (!/^st_[a-f0-9]{16}$/.test(id) || !dz || !token) return json(400, { error: 'id, dz and token required' })
      const store = getStore(STORIES_STORE, { consistency: 'strong' })
      const listed = await store.list({ prefix: storyPrefix(dz) })
      const key = listed.blobs.map((blob) => blob.key).find((candidate) => candidate.endsWith(`:${id}`))
      if (!key) return json(404, { error: 'story not found' })
      const stored = await store.get(key, { type: 'json' }) as StoredStory | null
      if (!stored || !stored.editToken || stored.editToken !== token) {
        return json(403, { error: 'not allowed' })
      }
      await store.delete(key)
      // Best effort: drop the author's media too. A missing blob never blocks
      // the deletion of the story record.
      if (stored.media.length > 0) {
        try {
          const mediaStore = getStore(MEDIA_STORE, { consistency: 'strong' })
          for (const media of stored.media) await mediaStore.delete(`media:${media.id}`)
        } catch {
          // The record is already gone; orphaned opaque media cannot be listed.
        }
      }
      return json(200, { deleted: true, id })
    } catch (err) {
      return json(500, { error: messageOf(err) })
    }
  }

  if (req.method !== 'POST') return json(405, { error: 'method not allowed' })
  try {
    const body = await req.json()
    const out = await publishStory((body as { note?: unknown })?.note, (body as { consent?: unknown })?.consent)
    const editToken = makeDeleteToken()
    // Persist best-effort: a storage hiccup must never lose the citizen's
    // submission response (the record is still returned to the client).
    await persistStory({ ...out.story, editToken }).catch(() => undefined)
    return json(200, { ...out, editToken })
  } catch (err) {
    const message = messageOf(err)
    const status = /consent|required|budget/i.test(message) ? 422 : 500
    return json(status, { error: message })
  }
}

async function persistStory(story: StoredStory): Promise<void> {
  const store = getStore(STORIES_STORE, { consistency: 'strong' })
  const dz = story.dz ?? 'none'
  await store.setJSON(storyKey(story), story)
  // Keep each DZ to the newest MAX_STORED_STORIES records.
  const listed = await store.list({ prefix: storyPrefix(dz) })
  const keys = listed.blobs.map((blob) => blob.key)
  const excess = keys.slice(0, Math.max(0, keys.length - MAX_STORED_STORIES))
  for (const key of excess) await store.delete(key)
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : 'story failure'
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

export const config: Config = { path: '/api/story' }
