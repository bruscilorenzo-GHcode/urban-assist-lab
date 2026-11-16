/** Build version shown in small print and attached to technical signals.
 *  Defined at build time by vite.config.ts; the test runner falls back to
 *  `dev` so unit tests never depend on git. */

const RAW = (import.meta.env?.VITE_BUILD_VERSION as string | undefined) ?? 'dev'

export const APP_VERSION = RAW

export function shortVersion(version = APP_VERSION): string {
  return version.length > 28 ? `${version.slice(0, 28)}…` : version
}
