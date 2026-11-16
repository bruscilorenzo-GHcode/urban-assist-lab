/** Pure media helpers for the upload pipeline (50 MB total budget per story).
 *  Media live in Netlify Blobs; files are stored under opaque ids — original
 *  filenames never leave the citizen's browser (filenames can carry PII). */

export const MEDIA_MAX_TOTAL = 50 * 1024 * 1024
export const MEDIA_MAX_PER_FILE = 50 * 1024 * 1024
export const CHUNK_SIZE = 4 * 1024 * 1024

export type MediaKind = 'image' | 'video' | 'audio' | 'text'

export function kindOf(contentType: string): MediaKind | null {
  if (contentType.startsWith('image/')) return 'image'
  if (contentType.startsWith('video/')) return 'video'
  if (contentType.startsWith('audio/')) return 'audio'
  if (contentType.startsWith('text/') || contentType === 'application/json') return 'text'
  return null
}

export function isAllowedType(contentType: string): boolean {
  return kindOf(contentType) !== null
}

export function validateMediaFile(contentType: string, size: number): { ok: true } | { ok: false, error: string } {
  if (!isAllowedType(contentType)) return { ok: false, error: `type not allowed: ${contentType}` }
  if (size > MEDIA_MAX_PER_FILE) return { ok: false, error: `file exceeds 50 MB` }
  return { ok: true }
}

export function chunksFor(size: number): number {
  return Math.max(1, Math.ceil(size / CHUNK_SIZE))
}

export function mediaId(): string {
  const b = new Uint8Array(9)
  crypto.getRandomValues(b)
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}
