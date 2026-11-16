/** DRAMATURGICAL ZONES (DZ) — the unit of a storytelling campaign.
 *
 *  A DZ is a place-bound campaign: a city, a map centre and a dramaturgical
 *  focus. Pilot-collaborators can create their own DZ (persisted locally, no
 *  account) so they can concentrate a specific storytelling campaign in one
 *  area. Scicli and Napoli Est ship as curated zones; Montréal is deliberately
 *  absent — this app is about urban storytelling, not transport simulation.
 *
 *  The core pipeline stays purpose- and city-agnostic: a story always carries
 *  the DZ it belongs to, and the map/wall show only that DZ's stories. */

export type ZoneOrigin = 'curated' | 'pilot'
export type ZoneStatus = 'active' | 'coming'

export interface ZoneCopy {
  it: string
  en: string
}

export interface ZonePreset {
  label: string
  lang: string
  text: string
}

export interface DramaturgicalZone {
  id: string
  name: string
  label: string
  status: ZoneStatus
  city: string
  origin: ZoneOrigin
  focus: ZoneCopy
  center: [number, number]
  zoom: number
  themeHint: ZoneCopy
  presets: ZonePreset[]
  createdAt?: string
}

export interface PilotZoneInput {
  name: string
  city: string
  focusIt: string
  focusEn: string
  themeIt: string
  themeEn: string
  lat: number | string
  lon: number | string
  zoom: number | string
}

export const PILOT_ZONES_KEY = 'assist-urban.dramaturgical-zones.v1'
export const PILOT_MODE_KEY = 'assist-urban.pilot-mode.v1'
export const ACTIVE_ZONE_KEY = 'assist-urban.active-zone.v1'

/** Curated DZ seeds. Order is the order shown in the switcher. */
export const SEED_ZONES: DramaturgicalZone[] = [
  {
    id: 'scicli',
    name: 'Scicli',
    label: 'Scicli',
    status: 'active',
    city: 'Scicli',
    origin: 'curated',
    focus: {
      it: 'le strade di Scicli, tra barocco, mare e vita quotidiana',
      en: 'the streets of Scicli, between baroque, sea and everyday life',
    },
    center: [36.7931, 14.7075],
    zoom: 15,
    themeHint: {
      it: 'i vicoli del centro storico, la costa e i luoghi che chiedono di essere raccontati',
      en: 'the alleys of the old town, the coast and the places asking to be told',
    },
    presets: [
      {
        label: 'IT · il centro storico', lang: 'it',
        text: 'Nel centro storico di Scicli, tra i vicoli e le facciate barocche, c\'è un angolo che nessuno attraversa più. Da bambino ci passavo ogni giorno: oggi chiedo cosa lo abbia fatto diventare invisibile.',
      },
      {
        label: 'IT · la costa', lang: 'it',
        text: 'La strada verso la costa di Scicli cambia a ogni stagione: d\'estate è piena di gente, d\'inverno resta un nastro vuoto. Chi la abita tutto l\'anno sa cosa manca.',
      },
      {
        label: 'EN · a street memory', lang: 'en',
        text: 'There is a street in Scicli where the same three neighbours have met every evening for forty years. The benches are gone now. The conversation is not.',
      },
    ],
  },
  {
    id: 'napoli_est',
    name: 'Napoli Est',
    label: 'Napoli Est',
    status: 'active',
    city: 'Napoli',
    origin: 'curated',
    focus: {
      it: 'Barra, Ponticelli e San Giovanni a Teduccio: quartieri, attese e memorie',
      en: 'Barra, Ponticelli and San Giovanni a Teduccio: districts, waiting and memories',
    },
    center: [40.8456, 14.3288],
    zoom: 13,
    themeHint: {
      it: 'la vita quotidiana di Napoli Est tra stazioni, strade e luoghi di ritrovo',
      en: 'everyday life in East Naples between stations, streets and meeting places',
    },
    presets: [
      {
        label: 'IT · la stazione', lang: 'it',
        text: 'Alla stazione di Barra, la mattina, ci si riconosce tutti. Il treno che non arriva non è solo un ritardo: è il tempo che si porta via dalla giornata di chi lavora.',
      },
      {
        label: 'IT · il quartiere', lang: 'it',
        text: 'A Ponticelli c\'è un cortile dove i bambini giocano finché non si accendono i lampioni. Da quando hanno chiuso il centro sociale, quello spazio resta l\'unico posto dove incontrarsi.',
      },
      {
        label: 'EN · east Naples', lang: 'en',
        text: 'San Giovanni a Teduccio has changed fast. The sea is still there at the end of the street, but the way people reach it has changed. I want to remember the old path.',
      },
    ],
  },
  {
    id: 'beirut',
    name: 'Beirut',
    label: 'Beirut',
    status: 'active',
    city: 'Beirut',
    origin: 'curated',
    focus: {
      it: 'Hamra, il porto e i quartieri di Beirut, tra Mediterraneo, ricostruzione e memoria',
      en: 'Hamra, the port and the neighborhoods of Beirut, between the Mediterranean, reconstruction and memory',
    },
    center: [33.8938, 35.5018],
    zoom: 13,
    themeHint: {
      it: 'la vita quotidiana a Beirut tra strade, caffè, cantieri e luoghi che chiedono di essere raccontati',
      en: 'everyday life in Beirut between streets, cafés, construction sites and places asking to be told',
    },
    presets: [
      {
        label: 'IT · Hamra', lang: 'it',
        text: 'A Hamra, la sera, i tavolini invadono il marciapiede e le lingue si mescolano. La città che ricostruisce si riconosce da come occupa la strada: chi resta, chi torna, chi passa.',
      },
      {
        label: 'EN · the port', lang: 'en',
        text: 'Near the port the sea is still the same sea, but the street no longer leads to it the way it used to. I keep the old route in my memory; I want to know who walks it now.',
      },
      {
        label: 'FR · la mémoire du quartier', lang: 'fr',
        text: 'Dans mon quartier, les façades gardent les traces des années. On dirait que la ville se souvient à voix basse: chaque fissure est une date, chaque balcon une histoire.',
      },
    ],
  },
]

const SEED_IDS = new Set(SEED_ZONES.map((zone) => zone.id))

/** Pilots can create zones but can never shadow a curated one. */
export function mergeZones(pilotZones: DramaturgicalZone[]): DramaturgicalZone[] {
  const clean = pilotZones.filter((zone) =>
    zone && typeof zone.id === 'string' && !SEED_IDS.has(zone.id) && zone.id !== 'montreal')
  return [...SEED_ZONES, ...clean]
}

export function makeZoneId(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32) || 'zone'
  const bytes = new Uint8Array(2)
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  const suffix = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `dz_${slug}_${suffix}`
}

const MAX_NAME = 60
const MAX_COPY = 160

/** Returns an error code understood by the UI, or null when valid. */
export function validateZoneInput(input: PilotZoneInput): 'name' | 'city' | 'focus' | 'center' | 'zoom' | null {
  if (input.name.trim().length < 2 || input.name.trim().length > MAX_NAME) return 'name'
  if (input.city.trim().length < 2 || input.city.trim().length > MAX_NAME) return 'city'
  if (input.focusIt.trim().length < 4 || input.focusEn.trim().length < 4) return 'focus'
  const lat = Number(input.lat)
  const lon = Number(input.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return 'center'
  const zoom = Number(input.zoom)
  if (!Number.isFinite(zoom) || zoom < 1 || zoom > 19) return 'zoom'
  return null
}

export function createPilotZone(input: PilotZoneInput): DramaturgicalZone {
  const error = validateZoneInput(input)
  if (error) throw new Error(`invalid zone: ${error}`)
  const name = input.name.trim()
  const city = input.city.trim()
  const focusIt = input.focusIt.trim().slice(0, MAX_COPY)
  const focusEn = input.focusEn.trim().slice(0, MAX_COPY)
  const themeIt = input.themeIt.trim().slice(0, MAX_COPY) || focusIt
  const themeEn = input.themeEn.trim().slice(0, MAX_COPY) || focusEn
  return {
    id: makeZoneId(name),
    name,
    label: city && city.toLowerCase() !== name.toLowerCase() ? `${name} · ${city}` : name,
    status: 'active',
    city,
    origin: 'pilot',
    focus: { it: focusIt, en: focusEn },
    center: [Number(input.lat), Number(input.lon)],
    zoom: Math.round(Number(input.zoom)),
    themeHint: { it: themeIt, en: themeEn },
    presets: [],
    createdAt: new Date().toISOString(),
  }
}

type ReadStorage = Pick<Storage, 'getItem'>
type WriteStorage = Pick<Storage, 'setItem'>

export function loadPilotZones(storage: ReadStorage | null | undefined): DramaturgicalZone[] {
  if (!storage) return []
  try {
    const raw = storage.getItem(PILOT_ZONES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((zone): zone is DramaturgicalZone => {
      if (!zone || typeof zone !== 'object') return false
      const z = zone as Partial<DramaturgicalZone>
      return typeof z.id === 'string'
        && typeof z.name === 'string'
        && typeof z.label === 'string'
        && typeof z.city === 'string'
        && z.origin === 'pilot'
        && (z.status === 'active' || z.status === 'coming')
        && Array.isArray(z.center) && z.center.length === 2
        && z.center.every((value) => typeof value === 'number' && Number.isFinite(value))
        && typeof z.zoom === 'number'
        && !!z.focus && typeof z.focus.it === 'string' && typeof z.focus.en === 'string'
        && !!z.themeHint && typeof z.themeHint.it === 'string' && typeof z.themeHint.en === 'string'
        && Array.isArray(z.presets)
    })
  } catch {
    return []
  }
}

export function savePilotZones(zones: DramaturgicalZone[], storage: WriteStorage | null | undefined): void {
  if (!storage) return
  try {
    storage.setItem(PILOT_ZONES_KEY, JSON.stringify(zones.filter((zone) => zone.origin === 'pilot')))
  } catch {
    // Quota or privacy mode: the session still works, persistence is optional.
  }
}

export function loadPilotMode(storage: ReadStorage | null | undefined): boolean {
  if (!storage) return false
  try {
    return storage.getItem(PILOT_MODE_KEY) === '1'
  } catch {
    return false
  }
}

export function savePilotMode(on: boolean, storage: WriteStorage | null | undefined): void {
  if (!storage) return
  try {
    storage.setItem(PILOT_MODE_KEY, on ? '1' : '0')
  } catch {
    // ignore
  }
}

export function zoneById(zones: DramaturgicalZone[], id: string): DramaturgicalZone {
  return zones.find((zone) => zone.id === id) ?? zones[0]!
}

/** Remember the DZ the pilot was working in, so a reload returns to it. */
export function loadActiveZoneId(storage: ReadStorage | null | undefined, zones: DramaturgicalZone[]): string | null {
  if (!storage) return null
  try {
    const saved = storage.getItem(ACTIVE_ZONE_KEY)
    return saved && zones.some((zone) => zone.id === saved) ? saved : null
  } catch {
    return null
  }
}

export function saveActiveZoneId(id: string, storage: WriteStorage | null | undefined): void {
  if (!storage) return
  try {
    storage.setItem(ACTIVE_ZONE_KEY, id)
  } catch {
    // ignore
  }
}

export function zoneCityKey(zone: DramaturgicalZone): string {
  return zone.city.trim()
}

/** City names that contain at least one zone, sorted for the switcher. */
export function cityNamesOf(zones: DramaturgicalZone[]): string[] {
  const names = new Set<string>()
  for (const zone of zones) {
    const key = zoneCityKey(zone)
    if (key) names.add(key)
  }
  return [...names].sort((a, b) => a.localeCompare(b))
}

/** The zones visible while `city` is active: its own zones only. Records with
 *  no city (legacy) stay visible so they never disappear from the app. */
export function zonesInCity(zones: DramaturgicalZone[], city: string): DramaturgicalZone[] {
  const key = city.trim().toLowerCase()
  return zones.filter((zone) => {
    const own = zoneCityKey(zone).toLowerCase()
    return own === '' || own === key
  })
}
