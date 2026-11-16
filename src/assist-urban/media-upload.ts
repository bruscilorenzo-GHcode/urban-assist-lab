/** Client-side chunked media uploader (50 MB total budget per story).
 *  Files go to Netlify Blobs through /api/media-upload; the original
 *  filename never leaves the browser — only kind, size and an opaque id. */

import { CHUNK_SIZE, chunksFor, kindOf, validateMediaFile } from '../../netlify/functions/lib/media.js'

export interface UploadResult {
  id: string
  kind: 'image' | 'video' | 'audio' | 'text'
  size: number
}

export const MEDIA_TOTAL_BUDGET = 50 * 1024 * 1024

export function totalSize(files: File[]): number {
  return files.reduce((n, f) => n + f.size, 0)
}

export function validateBudget(files: File[]): string | null {
  if (totalSize(files) > MEDIA_TOTAL_BUDGET) return 'budget'
  for (const f of files) {
    const type = f.type || guessMediaType(f.name)
    if (!validateMediaFile(type, f.size).ok) return 'type'
  }
  return null
}

export function guessMediaType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'heic', 'heif'].includes(ext)) return 'image/*'
  if (['mp4', 'mov', 'webm', 'avi', 'mkv', '3gp'].includes(ext)) return 'video/*'
  if (['mp3', 'wav', 'm4a', 'ogg', 'aac', 'flac'].includes(ext)) return 'audio/*'
  if (['txt', 'md', 'csv'].includes(ext)) return 'text/plain'
  return 'application/octet-stream'
}

async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit, attempts = 3): Promise<Response> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(input, init)
      if (response.ok || response.status < 500) return response
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)))
  }
  throw lastError instanceof Error ? lastError : new Error('upload failed')
}

export interface UploadSession {
  id: string
  chunks: number
  received: number[]
}

export interface UploadOptions {
  /** Resume an existing server session instead of starting a new one. */
  id?: string
  onChunk?: (state: { id: string; chunks: number; received: number[] }) => void
}

async function fetchSession(id: string): Promise<UploadSession | null> {
  try {
    const res = await fetchWithRetry(`/api/media-upload?session=${encodeURIComponent(id)}`)
    if (!res.ok) return null
    const body = await res.json() as { id?: unknown; chunks?: unknown; received?: unknown }
    if (typeof body.id !== 'string' || typeof body.chunks !== 'number' || !Array.isArray(body.received)) return null
    return {
      id: body.id,
      chunks: body.chunks,
      received: body.received.filter((index): index is number => typeof index === 'number'),
    }
  } catch {
    return null
  }
}

export async function uploadFile(file: File, onProgress?: (pct: number) => void, options: UploadOptions = {}): Promise<UploadResult> {
  const contentType = file.type || guessMediaType(file.name)
  const check = validateMediaFile(contentType, file.size)
  if (!check.ok) throw new Error(check.error)

  let session = options.id ? await fetchSession(options.id) : null
  if (!session) {
    const init = await fetchWithRetry('/api/media-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ init: { contentType, size: file.size } }),
    })
    if (!init.ok) throw new Error(`init failed (${init.status})`)
    const body = await init.json() as { id: string, chunks: number }
    session = { id: body.id, chunks: body.chunks, received: [] }
  }

  const received = new Set(session.received)
  let done = received.size
  onProgress?.(Math.round((done / session.chunks) * 100))
  options.onChunk?.({ id: session.id, chunks: session.chunks, received: [...received] })

  for (let index = 0; index < session.chunks; index += 1) {
    if (received.has(index)) continue
    const offset = index * CHUNK_SIZE
    const slice = file.slice(offset, Math.min(offset + CHUNK_SIZE, file.size))
    const bytes = new Uint8Array(await slice.arrayBuffer())
    const res = await fetchWithRetry('/api/media-upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'x-media-id': session.id, 'x-chunk-index': String(index), 'x-chunk-total': String(session.chunks),
      },
      body: bytes,
    })
    if (!res.ok) throw new Error(`chunk ${index} failed (${res.status})`)
    received.add(index)
    done += 1
    onProgress?.(Math.round((done / session.chunks) * 100))
    options.onChunk?.({ id: session.id, chunks: session.chunks, received: [...received] })
  }

  const kind = kindOf(contentType) ?? 'text'
  return { id: session.id, kind, size: file.size }
}

/** Convenience: uploads every file and reports per-file progress. */
export async function uploadAll(files: File[], onProgress?: (pct: number) => void): Promise<UploadResult[]> {
  const results: UploadResult[] = []
  const per = files.length ? 100 / files.length : 100
  for (let i = 0; i < files.length; i++) {
    results.push(await uploadFile(files[i], (p) => onProgress?.(Math.round(i * per + p / files.length))))
  }
  return results
}

export { chunksFor }
