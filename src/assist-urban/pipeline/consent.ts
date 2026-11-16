/** Consent gate — TS port. Exact coordinates never leave the gate:
 *  "exact" consent is downgraded to "grid" for dispatch, "none" refuses
 *  coordinates outright. */

export type GeoMode = 'none' | 'grid' | 'exact'

export const POLICY_VERSION = '1.0.0'
const POLICY_VERSIONS = new Set([POLICY_VERSION])

export interface Consent {
  geo_mode: GeoMode
  geo_resolution?: number
  policy_version?: string
  allow_archival?: boolean
  allow_dispatch: boolean
  /** Purpose-limitation: the metanarrative layer is a distinct purpose; only
   *  stories with this flag may enter LLM synthesis (EU open-source, EU-hosted).
   *  Production default should be false; the demo ships it on for usability. */
  allow_synthesis?: boolean
  redact_terms?: string[]
  granted_at?: string
}

export interface ConsentDecision {
  geoModeDispatch: 'none' | 'grid'
  accepted: boolean
  reason: string
}

export class ConsentError extends Error {}

export function validateConsent(
  hasExactCoords: boolean,
  consent: Consent,
): ConsentDecision {
  const policy = consent.policy_version ?? POLICY_VERSION
  if (!POLICY_VERSIONS.has(policy)) {
    return { geoModeDispatch: 'none', accepted: false, reason: `unsupported policy_version ${JSON.stringify(policy)}` }
  }
  if (!consent.allow_dispatch) {
    return { geoModeDispatch: 'none', accepted: false, reason: 'dispatch consent not granted' }
  }
  if (hasExactCoords) {
    if (consent.geo_mode === 'grid') return { geoModeDispatch: 'grid', accepted: true, reason: 'coordinates downgraded to grid' }
    if (consent.geo_mode === 'exact') return { geoModeDispatch: 'grid', accepted: true, reason: 'exact downgraded to grid for dispatch' }
    if (consent.geo_mode === 'none') {
      throw new ConsentError(
        "coordinates present but geo consent is 'none'; citizen must either grant grid consent or strip coordinates",
      )
    }
    return { geoModeDispatch: 'none', accepted: true, reason: `unknown geo_mode ${consent.geo_mode}` }
  }
  if (consent.geo_mode === 'grid') {
    return { geoModeDispatch: 'none', accepted: true, reason: 'grid consent granted but no coordinates supplied; dispatching non-georeferenced' }
  }
  return { geoModeDispatch: 'none', accepted: true, reason: 'non-georeferenced note' }
}
