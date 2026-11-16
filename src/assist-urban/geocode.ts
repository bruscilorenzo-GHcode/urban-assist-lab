/** City-name geocoding for pilot Dramaturgical Zones.
 *
 *  The teller types a city (or district); we find the centre, so the creation
 *  form never asks for latitude/longitude. Photon/OpenStreetMap is public and
 *  CORS-enabled; the result is only a map centre, never stored as an exact
 *  citizen coordinate. */

export interface GeoPoint {
  lat: number
  lon: number
  label: string
}

interface PhotonFeature {
  geometry?: { coordinates?: unknown }
  properties?: { name?: string; city?: string; country?: string; state?: string }
}

export async function geocodePlace(query: string, fetcher: typeof fetch = fetch): Promise<GeoPoint | null> {
  const text = query.trim()
  if (text.length < 2) return null
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(text)}&limit=1`
  const response = await fetcher(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) return null
  const data = await response.json() as { features?: PhotonFeature[] }
  const feature = data.features?.[0]
  const coordinates = feature?.geometry?.coordinates
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null
  const lon = Number(coordinates[0])
  const lat = Number(coordinates[1])
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null
  const properties = feature?.properties ?? {}
  return {
    lat,
    lon,
    label: [properties.name, properties.city, properties.state, properties.country].filter(Boolean).join(', '),
  }
}


/** A Dramaturgical Zone lives inside a city: try "zone, city" first so Hamra
 *  and Downtown become two different zones in Beirut, then fall back to the
 *  city centre (or the zone name alone). */
export async function geocodePlaceInCity(name: string, city: string, fetcher: typeof fetch = fetch): Promise<GeoPoint | null> {
  const zone = name.trim()
  const town = city.trim()
  const candidates: string[] = []
  if (zone && town && zone.toLowerCase() !== town.toLowerCase()) candidates.push(`${zone}, ${town}`)
  if (town) candidates.push(town)
  if (zone) candidates.push(zone)
  for (const query of [...new Set(candidates)]) {
    try {
      const point = await geocodePlace(query, fetcher)
      if (point) return point
    } catch {
      // try the next candidate
    }
  }
  return null
}
