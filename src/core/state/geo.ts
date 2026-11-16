/** Geometry on the anonymous grid only: the cell centre is the most precise
 *  point the platform ever knows. No exact citizen coordinate is recovered. */

const CELL_RE = /^gr_r(\d)_(-?\d+(?:\.\d+)?)_(-?\d+(?:\.\d+)?)$/

export function pointFromCell(index: string | null | undefined): [number, number] | null {
  if (!index) return null
  const match = index.match(CELL_RE)
  if (!match) return null
  const lat = Number.parseFloat(match[2]!)
  const lon = Number.parseFloat(match[3]!)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null
  return [lat, lon]
}

export function haversineMeters(a: [number, number], b: [number, number]): number {
  const R = 6_371_000
  const toRad = (value: number) => (value * Math.PI) / 180
  const dLat = toRad(b[0] - a[0])
  const dLon = toRad(b[1] - a[1])
  const lat1 = toRad(a[0])
  const lat2 = toRad(b[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function storyDay(ts: string | null | undefined): string | null {
  if (typeof ts !== 'string') return null
  const match = ts.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1]! : null
}

export function withinWindow(day: string | null, window: { from: string; to: string } | undefined): boolean | null {
  if (!window) return null
  if (!day) return false
  return day >= window.from && day <= window.to
}
