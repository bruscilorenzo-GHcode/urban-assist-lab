/** Palette presets. Every preset is a subset of the Okabe–Ito
 *  colour-blind-safe palette (deuteranopia / protanopia) plus at most one
 *  neutral ink. No preset exceeds 7 colours and none is a rainbow. */

import type { FabricPalette } from './types.js'

export const PALETTE_PRESETS: FabricPalette[] = [
  {
    name: 'okabe_ito',
    colors: ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#56B4E9', '#D55E00', '#000000'],
  },
  {
    name: 'ocean_ink',
    colors: ['#0072B2', '#56B4E9', '#009E73', '#000000'],
  },
  {
    name: 'warm_signal',
    colors: ['#E69F00', '#D55E00', '#CC79A7', '#000000'],
  },
  {
    name: 'field_soft',
    colors: ['#009E73', '#56B4E9', '#E69F00', '#999999'],
  },
  {
    name: 'mono_ink',
    colors: ['#000000', '#4A4A4A', '#0072B2'],
  },
]

export const MIN_PALETTE_COLORS = 2
export const MAX_PALETTE_COLORS = 7

/** Union of the preset colours: the only colours a pack may declare. This is
 *  what makes "no rainbow" and colour-blind safety enforceable on import. */
export const SAFE_PACK_COLORS = new Set(
  PALETTE_PRESETS.flatMap((preset) => preset.colors.map((color) => color.toUpperCase())),
)

export function paletteByName(name: string): FabricPalette | null {
  return PALETTE_PRESETS.find((preset) => preset.name === name) ?? null
}

export function isSafeHexColor(color: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(color)
}
