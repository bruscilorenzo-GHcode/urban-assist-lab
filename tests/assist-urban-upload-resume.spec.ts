import { afterEach, describe, expect, it, vi } from 'vitest'
import { uploadFile } from '../src/assist-urban/media-upload'

const SESSION = 'a'.repeat(18)

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('client chunk upload · resume', () => {
  it('skips the chunks the server already holds', async () => {
    const calls: Array<{ url: string; index: string | null }> = []
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if ((init?.method ?? 'GET') === 'GET') {
        calls.push({ url, index: null })
        return json(200, { id: SESSION, chunks: 3, received: [0, 2] })
      }
      const headers = new Headers(init?.headers)
      calls.push({ url, index: headers.get('x-chunk-index') })
      return json(200, { received: 1, done: true })
    })
    vi.stubGlobal('fetch', fetcher)

    const file = new File([new Uint8Array(9 * 1024 * 1024)], 'video', { type: 'video/mp4' })
    const result = await uploadFile(file, undefined, { id: SESSION })
    expect(result).toEqual({ id: SESSION, kind: 'video', size: file.size })
    const posts = calls.filter((call) => call.index !== null)
    expect(posts).toHaveLength(1)
    expect(posts[0]!.index).toBe('1')
  })

  it('starts a new session when none exists and reports chunk progress', async () => {
    const session = 'b'.repeat(18)
    const chunks: string[] = []
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if ((init?.method ?? 'GET') === 'GET') return json(404, { error: 'missing session' })
      if (url.endsWith('/api/media-upload') && (init?.headers as Record<string, string>)?.['Content-Type'] === 'application/json') {
        return json(200, { id: session, chunks: 2 })
      }
      const headers = new Headers(init?.headers)
      chunks.push(headers.get('x-chunk-index') ?? '?')
      return json(200, { received: chunks.length, done: chunks.length === 2 })
    })
    vi.stubGlobal('fetch', fetcher)

    const file = new File([new Uint8Array(5 * 1024 * 1024)], 'clip', { type: 'audio/webm' })
    const progress: number[] = []
    const result = await uploadFile(file, (pct) => progress.push(pct), { id: session })
    expect(result.kind).toBe('audio')
    expect(chunks).toEqual(['0', '1'])
    expect(progress.at(-1)).toBe(100)
  })
})
