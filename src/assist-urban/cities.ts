/** A city is the parent of one or more Dramaturgical Zones.
 *
 *  Pilot-collaborators create the city once (geocoded from its name); zones
 *  then live inside it. The city record is shared, so every collaborator can
 *  pick it when creating a zone. */

export interface City {
  id: string
  name: string
  /** [lat, lon] of the city centre, found by the geocoder. */
  center: [number, number]
  zoom: number
  createdAt: string
}

export function makeCityId(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32) || 'city'
  const bytes = new Uint8Array(2)
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) crypto.getRandomValues(bytes)
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256)
  return `city_${slug}_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}
