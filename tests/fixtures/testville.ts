/** A third, entirely synthetic city (`testville`) used by the mandatory
 *  genericity test. Nothing here is a real place: the source URL is a
 *  declared fictional reference. If the generic paths start depending on
 *  Scicli/Beirut, this fixture no longer produces a full State. */

import { DEFAULT_FABRIC } from '../../src/core/packs/defaults.js'
import { PALETTE_PRESETS } from '../../src/core/packs/presets.js'
import type { ProjectPack } from '../../src/core/packs/types.js'
import type { EventTemplate } from '../../src/core/calendar/types.js'
import type { StateStory } from '../../src/core/state/compute.js'

export const TESTVILLE_EVENTS: EventTemplate[] = [
  {
    id: 'testville_festa_fiume',
    name: 'Festa del Fiume',
    nameEn: 'River Festival',
    territory: 'testville',
    scope: 'local',
    recurrence: { kind: 'annual_month', rule: 'primo fine settimana di giugno (fixture)', month: 6, day: 1, durationDays: 2 },
    typicalDurationDays: 2,
    category: 'cultura',
    source: { url: 'https://example.invalid/testville/festa-del-fiume', retrievedAt: '2026-11-14' },
    confidence: 'client',
    notes: 'Fonte fittizia dichiarata: fixture sintetica, nessun evento reale.',
    notesEn: 'Declared fictional source: synthetic fixture, no real event.',
    defaultStatus: 'expected',
  },
]

export const TESTVILLE_PACK: ProjectPack = {
  id: 'testville_demo',
  name: 'Testville',
  territoryId: 'testville',
  territory: { bbox: [10, 20, 10.2, 20.2], center: [10.05, 20.05], zoom: 14 },
  themes: [
    {
      id: 'acqua',
      label: { it: 'acqua', en: 'water' },
      categories: ['acqua', 'fiume'],
      keywords: ['fiume', 'acqua', 'riva', 'ponte'],
    },
    {
      id: 'lavoro',
      label: { it: 'lavoro', en: 'work' },
      categories: ['lavoro', 'occupazione'],
      keywords: ['lavoro', 'ufficio', 'turno'],
    },
  ],
  events: ['testville_festa_fiume'],
  eventTemplates: TESTVILLE_EVENTS,
  includeNational: false,
  fabric: {
    ...DEFAULT_FABRIC,
    palette: PALETTE_PRESETS[0]!,
    defaultOpacity: 0.5,
    proximityMeters: 500,
  },
  copy: {
    title: { it: 'Testville', en: 'Testville' },
    subtitle: { it: 'città sintetica di prova', en: 'synthetic test city' },
    emptyState: { it: 'Nessuna storia a Testville per questo filtro.', en: 'No Testville story for this filter.' },
    sparseState: { it: 'Poche storie a Testville: insufficienza dichiarata.', en: 'Few Testville stories: shortfall declared.' },
  },
  defaults: {},
}


function cell(lat: number, lon: number): { index: string; res: number } {
  return { index: `gr_r8_${lat.toFixed(4)}_${lon.toFixed(4)}`, res: 8 }
}

export const TESTVILLE_STORIES: StateStory[] = [
  {
    id: 'st_tv01',
    text: 'Il fiume è tornato accessibile: la riva nuova è piena di gente ogni sera.',
    ts: '2026-06-01T09:00:00Z',
    lang: 'it',
    dz: 'testville',
    geo: cell(10.0505, 20.0505),
    author_pseudonym: 'anon_tv_a',
    media: [{ kind: 'image', caption: 'La riva del fiume' }],
  },
  {
    id: 'st_tv02',
    text: 'La riva del fiume è piena di plastica dopo la festa: serve una pulizia.',
    ts: '2026-06-02T10:00:00Z',
    lang: 'it',
    dz: 'testville',
    geo: cell(10.0506, 20.0506),
    author_pseudonym: 'anon_tv_b',
    media: [],
  },
  {
    id: 'st_tv03',
    text: 'Acqua potabile chiusa in via del ponte: le famiglie aspettano da giorni.',
    ts: '2026-06-02T18:00:00Z',
    lang: 'it',
    dz: 'testville',
    geo: cell(10.0510, 20.0510),
    author_pseudonym: 'anon_tv_a',
    media: [{ kind: 'audio' }],
  },
  {
    id: 'st_tv04',
    text: 'Il mercato del lavoro qui è cambiato: nuovi uffici e turni lunghi.',
    ts: '2026-05-20T08:00:00Z',
    lang: 'it',
    dz: 'testville',
    geo: cell(10.0520, 20.0520),
    author_pseudonym: 'anon_tv_c',
    media: [],
  },
  {
    id: 'st_tv05',
    text: 'Il ponte sul fiume cade a pezzi e nessuno lo ripara: paura a attraversarlo.',
    ts: '2026-06-03T07:30:00Z',
    lang: 'it',
    dz: 'testville',
    geo: cell(10.0508, 20.0508),
    author_pseudonym: 'anon_tv_d',
    media: [{ kind: 'video' }],
  },
  {
    id: 'st_tv06',
    text: 'Cerco lavoro nel nuovo ufficio comunale: il turno è ancora scoperto.',
    ts: '2026-05-22T12:00:00Z',
    lang: 'it',
    dz: 'testville',
    geo: null,
    author_pseudonym: 'anon_tv_e',
    media: [],
  },
]

/** Deliberately a second pack for the same territory, to prove export/import
 *  of a renamed copy without touching code. */
export function cloneAsImported(pack: ProjectPack, id: string): ProjectPack {
  return { ...pack, id, name: `${pack.name} (copy)` }
}
