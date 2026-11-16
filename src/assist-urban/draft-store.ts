/** Persistent capture draft.
 *
 *  The written draft (text, language, consent mode, anchor) survives a refresh
 *  in localStorage. Attached media survive in IndexedDB as opaque blobs, so a
 *  chunked upload can resume after a reload; filenames are never stored. */

export const DRAFT_KEY_PREFIX = 'assist-urban.draft.v1:'

export interface DraftFields {
  text: string
  lang: string
  comparative: boolean
  geoMode: 'grid' | 'none'
  point: [number, number] | null
  savedAt: string
}

type ReadStorage = Pick<Storage, 'getItem'>
type WriteStorage = Pick<Storage, 'setItem'> & Pick<Storage, 'removeItem'>

export function loadDraft(storage: ReadStorage | null | undefined, dz: string): DraftFields | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(`${DRAFT_KEY_PREFIX}${dz}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<DraftFields> | null
    if (!parsed || typeof parsed.text !== 'string') return null
    return {
      text: parsed.text,
      lang: typeof parsed.lang === 'string' ? parsed.lang : 'it',
      comparative: parsed.comparative === true,
      geoMode: parsed.geoMode === 'none' ? 'none' : 'grid',
      point: Array.isArray(parsed.point) && parsed.point.length === 2
        ? [Number(parsed.point[0]), Number(parsed.point[1])]
        : null,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export function saveDraft(storage: WriteStorage | null | undefined, dz: string, fields: Omit<DraftFields, 'savedAt'>): void {
  if (!storage) return
  if (!fields.text.trim()) {
    clearDraft(storage, dz)
    return
  }
  try {
    storage.setItem(`${DRAFT_KEY_PREFIX}${dz}`, JSON.stringify({ ...fields, savedAt: new Date().toISOString() }))
  } catch {
    // Quota / private mode: the in-memory draft still works.
  }
}

export function clearDraft(storage: WriteStorage | null | undefined, dz: string): void {
  if (!storage) return
  try {
    storage.removeItem(`${DRAFT_KEY_PREFIX}${dz}`)
  } catch {
    // ignore
  }
}

export type QueueStatus = 'pending' | 'uploading' | 'done' | 'error'

export interface QueueItem {
  id: string
  dz: string
  blob: Blob
  type: string
  size: number
  timeline: string
  caption: string
  status: QueueStatus
  progress: number
  uploadId?: string
  kind?: 'image' | 'video' | 'audio' | 'text'
  received: number[]
  createdAt: string
}

const DB_NAME = 'assist-urban-drafts'
const DB_VERSION = 1
const STORE = 'media'

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined'
}

function openDb(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return Promise.resolve(null)
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' })
          store.createIndex('dz', 'dz', { unique: false })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => resolve()
    transaction.onabort = () => resolve()
  })
}

export function makeQueueId(): string {
  const bytes = new Uint8Array(6)
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) crypto.getRandomValues(bytes)
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256)
  return `q_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

export async function saveQueueItem(item: QueueItem): Promise<void> {
  const db = await openDb()
  if (!db) return
  const transaction = db.transaction(STORE, 'readwrite')
  transaction.objectStore(STORE).put(item)
  await done(transaction)
  db.close()
}

export async function listQueue(dz: string): Promise<QueueItem[]> {
  const db = await openDb()
  if (!db) return []
  const transaction = db.transaction(STORE, 'readonly')
  const store = transaction.objectStore(STORE)
  const items = await new Promise<QueueItem[]>((resolve) => {
    const request = store.index('dz').getAll(dz)
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result as QueueItem[] : [])
    request.onerror = () => resolve([])
  })
  await done(transaction)
  db.close()
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function deleteQueueItem(id: string): Promise<void> {
  const db = await openDb()
  if (!db) return
  const transaction = db.transaction(STORE, 'readwrite')
  transaction.objectStore(STORE).delete(id)
  await done(transaction)
  db.close()
}

export async function clearQueue(dz: string): Promise<void> {
  const db = await openDb()
  if (!db) return
  const transaction = db.transaction(STORE, 'readwrite')
  const store = transaction.objectStore(STORE)
  const cursorRequest = store.index('dz').openKeyCursor(dz)
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result
    if (!cursor) return
    store.delete(cursor.primaryKey)
    cursor.continue()
  }
  await done(transaction)
  db.close()
}
