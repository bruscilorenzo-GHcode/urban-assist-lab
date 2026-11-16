/** PII sanitisation, pseudonymisation and spatial obfuscation — TS port.
 *  Deterministic regex scrubbing; HMAC-SHA256 pseudonyms via WebCrypto
 *  (available in browsers and Node ≥ 18); deg-grid obfuscation matching the
 *  Python pipeline byte-for-byte (H3 pluggable where the `h3` package exists).
 *  Exact points are discarded; only the cell index may be serialised onward. */

const RE_EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g
const RE_PHONE = /(?:(?:\+\d{1,3}[ .-]?)?(?:\(?\d{2,4}\)?[ .-]?){2,4}\d{2,4})(?!\d)/g
const RE_URL = /https?:\/\/\S+|www\.\S+/gi
const RE_PLATE = /\b[A-Z]{2}[- ]?\d{3}[- ]?[A-Z0-9]{2,3}\b|\b[A-Z]{2}\d{4,6}\b/g
const RE_HANDLE = /(^|[\s(])@[\w.]{2,30}/g
const RE_STREET = /\b(\d{1,4}\s*(?:rue|avenue|av\.|boulevard|blvd|via|viale|strada|street|st\.|weg)\s+[\w'-]+(?:\s+[\w'-]+){0,3})/gi
const RE_STREET_NAME = /\b(?:[Rr]ue|[Aa]venue|[Aa]v\.|[Bb]oulevard|[Bb]lvd|[Vv]ia|[Vv]iale|[Ss]trada|[Ss]treet|[Ss]t\.|[Ww]eg)\s+[A-Z][\w'-]+(?:\s+[A-Z][\w'-]+){0,3}/g

const REDACT = '\u2588'

export function scrubText(text: string, extraTerms: string[] = []): { text: string, removed: number } {
  let removed = 0
  const sub = () => { removed += 1; return REDACT }
  let out = text.replace(RE_URL, sub)
    .replace(RE_EMAIL, sub)
    .replace(RE_PHONE, sub)
    .replace(RE_PLATE, sub)
  out = out.replace(RE_HANDLE, (m) => { removed += 1; return m.startsWith(' ') ? ' ' + REDACT : REDACT })
  out = out.replace(RE_STREET, sub)
  out = out.replace(RE_STREET_NAME, sub)
  for (const term of extraTerms) {
    if (!term) continue
    const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    out = out.replace(re, sub)
  }
  return { text: out, removed }
}

/** Deployment salt. In production the citizen-owned edge device generates and
 *  guards its own rotating salt (see the Python pipeline); the hosted demo
 *  uses a per-deployment constant so pseudonyms stay stable per day. */
type EnvLike = { process?: { env?: Record<string, string | undefined> } }
const SALT: string = (globalThis as unknown as EnvLike).process?.env?.PSEUDONYM_SALT
  ?? 'assist-urban-demo-salt-v1'

async function hmac(message: string): Promise<ArrayBuffer> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(SALT), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  return crypto.subtle.sign('HMAC', key, enc.encode(message))
}

const toHex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')

export async function pseudonym(seed: string, day?: string): Promise<string> {
  const d = day ?? new Date().toISOString().slice(0, 10)
  return 'anon_' + toHex(await hmac(`${seed}|${d}`)).slice(0, 16)
}

export async function textHash(text: string): Promise<string> {
  return 'sha256:' + toHex(await hmac(text)).slice(0, 24)
}

/** Deg-grid cell sizes per resolution (degrees latitude), tuned to H3 scale. */
const GRID_DEG: Record<number, number> = { 5: 0.08, 6: 0.03, 7: 0.012, 8: 0.005, 9: 0.002 }

export function obfuscatePoint(lat: number, lon: number, resolution = 8): { index: string, kind: 'grid' } {
  const side = GRID_DEG[resolution] ?? 0.005
  const nlat = Math.floor(lat / side) * side + side / 2
  const nlon = Math.floor(lon / side) * side + side / 2
  return { index: `gr_r${resolution}_${nlat.toFixed(4)}_${nlon.toFixed(4)}`, kind: 'grid' }
}
