/** Seed packs — data, not code paths. Adding a territory means adding a pack
 *  here (or exporting/importing one from the Project panel), never editing
 *  the state engine, the fabric or the API. */

import { DEFAULT_FABRIC, DEFAULT_THEMES } from './defaults.js'
import type { ProjectPack, ThemeDefinition } from './types.js'

function themes(): ThemeDefinition[] {
  return DEFAULT_THEMES.map((theme) => ({
    ...theme,
    label: { ...theme.label },
    categories: [...theme.categories],
    keywords: [...theme.keywords],
  }))
}

function fabric(): ProjectPack['fabric'] {
  return {
    ...DEFAULT_FABRIC,
    palette: { ...DEFAULT_FABRIC.palette, colors: [...DEFAULT_FABRIC.palette.colors] },
  }
}

export const SEED_PACKS: ProjectPack[] = [
  {
    id: 'scicli_demo',
    name: 'Scicli',
    territoryId: 'scicli',
    territory: { bbox: [36.72, 14.6, 36.86, 14.82], center: [36.7931, 14.7075], zoom: 14 },
    themes: themes(),
    eventTemplates: [],
    events: [
      'scicli_cavalcata_san_giuseppe',
      'scicli_settimana_santa',
      'scicli_madonna_milizie',
      'scicli_macc',
      'scicli_taranta_sicily_fest',
      'scicli_memorial_peppe_greco',
      'scicli_infiorata_cavallo',
    ],
    includeNational: false,
    fabric: fabric(),
    copy: {
      title: { it: 'Scicli', en: 'Scicli' },
      subtitle: {
        it: 'Le strade di Scicli, tra barocco, mare e vita quotidiana: una lettura per temi, date e relazioni.',
        en: 'The streets of Scicli, between baroque, sea and everyday life: a reading by themes, dates and relations.',
      },
      emptyState: {
        it: 'Nessuna storia di Scicli corrisponde a questo filtro. Il resto della zona resta visibile, attenuato.',
        en: 'No Scicli story matches this filter. The rest of the zone stays visible, attenuated.',
      },
      sparseState: {
        it: 'Poche storie a Scicli per questo stato: il fabric mostra ciò che può e dichiara l’insufficienza.',
        en: 'Few Scicli stories for this state: the fabric shows what it can and declares the shortfall.',
      },
    },
    defaults: {},
  },
  {
    id: 'beirut_demo',
    name: 'Beirut',
    territoryId: 'beirut',
    territory: { bbox: [33.82, 35.43, 33.96, 35.58], center: [33.8938, 35.5018], zoom: 13 },
    themes: themes(),
    eventTemplates: [],
    events: [
      'beirut_chants',
      'beirut_al_bustan',
      'beirut_spring_festival',
      'beirut_design_week',
      'beirut_fete_de_la_musique',
      'beirut_marathon',
      'beirut_jazz_festival',
      'national_baalbeck',
      'national_byblos',
      'national_beiteddine',
    ],
    includeNational: true,
    fabric: fabric(),
    copy: {
      title: { it: 'Beirut', en: 'Beirut' },
      subtitle: {
        it: 'Hamra, il porto e i quartieri di Beirut: una lettura per temi, date e relazioni.',
        en: 'Hamra, the port and Beirut’s neighbourhoods: a reading by themes, dates and relations.',
      },
      emptyState: {
        it: 'Nessuna storia di Beirut corrisponde a questo filtro. Il resto della zona resta visibile, attenuato.',
        en: 'No Beirut story matches this filter. The rest of the zone stays visible, attenuated.',
      },
      sparseState: {
        it: 'Poche storie a Beirut per questo stato: il fabric mostra ciò che può e dichiara l’insufficienza.',
        en: 'Few Beirut stories for this state: the fabric shows what it can and declares the shortfall.',
      },
    },
    defaults: {},
  },
  {
    id: 'napoli_est_demo',
    name: 'Napoli Est',
    territoryId: 'napoli_est',
    territory: { bbox: [40.78, 14.22, 40.91, 14.42], center: [40.8456, 14.3288], zoom: 13 },
    themes: themes(),
    eventTemplates: [],
    events: [],
    includeNational: false,
    fabric: fabric(),
    copy: {
      title: { it: 'Napoli Est', en: 'East Naples' },
      subtitle: {
        it: 'Barra, Ponticelli e San Giovanni a Teduccio: quartieri, attese e memorie.',
        en: 'Barra, Ponticelli and San Giovanni a Teduccio: districts, waiting and memories.',
      },
      emptyState: {
        it: 'Nessuna storia di Napoli Est corrisponde a questo filtro. Il resto della zona resta visibile, attenuato.',
        en: 'No East Naples story matches this filter. The rest of the zone stays visible, attenuated.',
      },
      sparseState: {
        it: 'Poche storie a Napoli Est per questo stato: il fabric mostra ciò che può e dichiara l’insufficienza.',
        en: 'Few East Naples stories for this state: the fabric shows what it can and declares the shortfall.',
      },
    },
    defaults: {},
  },
]

export const SEED_PACK_IDS = new Set(SEED_PACKS.map((pack) => pack.id))
