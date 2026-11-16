/** Templates, not global lists: the brief's themes are a starting point for a
 *  new territory, and a pilot DZ without a curated pack gets these defaults. */

import type { Localized } from '../types.js'
import { PALETTE_PRESETS } from './presets.js'
import type { FabricPackConfig, PackCopy, ThemeDefinition } from './types.js'

export const DEFAULT_THEMES: ThemeDefinition[] = [
  {
    id: 'mobilita',
    label: { it: 'mobilità', en: 'mobility' },
    categories: ['mobilità', 'trasporti', 'strade', 'traffico'],
    keywords: ['bici', 'ciclabile', 'autobus', 'treno', 'strada', 'traffico', 'parcheggio', 'marciapiede', 'bus', 'traffic', 'bike', 'street', 'train', 'parking'],
  },
  {
    id: 'accessibilita',
    label: { it: 'accessibilità', en: 'accessibility' },
    categories: ['accessibilità', 'barriere', 'disabilità'],
    keywords: ['accesso', 'accessibile', 'disabile', 'sedia a rotelle', 'rampa', 'ascensore', 'barriera', 'gradini', 'wheelchair', 'ramp', 'stairs', 'accessible'],
  },
  {
    id: 'sicurezza',
    label: { it: 'sicurezza percepita', en: 'perceived safety' },
    categories: ['sicurezza percepita', 'illuminazione'],
    keywords: ['sicurezza', 'paura', 'buio', 'illuminazione', 'lampioni', 'notte', 'sicuro', 'safety', 'dark', 'lights', 'night', 'unsafe'],
  },
  {
    id: 'commercio',
    label: { it: 'commercio', en: 'commerce' },
    categories: ['commercio', 'negozi', 'mercato'],
    keywords: ['negozio', 'mercato', 'bottega', 'vendita', 'commercianti', 'shop', 'market', 'store', 'business'],
  },
  {
    id: 'cultura',
    label: { it: 'cultura', en: 'culture' },
    categories: ['cultura', 'patrimonio', 'festa'],
    keywords: ['cultura', 'teatro', 'festival', 'festa', 'musica', 'chiesa', 'monumento', 'culture', 'music', 'church'],
  },
  {
    id: 'servizi',
    label: { it: 'servizi pubblici', en: 'public services' },
    categories: ['servizi pubblici', 'sanità', 'scuola'],
    keywords: ['servizi', 'scuola', 'ospedale', 'medico', 'ufficio', 'posta', 'biblioteca', 'school', 'hospital', 'service', 'clinic'],
  },
  {
    id: 'memoria',
    label: { it: 'memoria', en: 'memory' },
    categories: ['memoria', 'storia', 'passato'],
    keywords: ['memoria', 'ricordo', 'passato', 'storia', 'prima', 'memory', 'remember', 'past', 'history', 'once'],
  },
  {
    id: 'acqua',
    label: { it: 'acqua', en: 'water' },
    categories: ['acqua', 'mare', 'costa'],
    keywords: ['acqua', 'mare', 'costa', 'spiaggia', 'porto', 'fontana', 'water', 'sea', 'coast', 'port', 'beach'],
  },
  {
    id: 'lavoro',
    label: { it: 'lavoro', en: 'work' },
    categories: ['lavoro', 'occupazione'],
    keywords: ['lavoro', 'disoccupazione', 'turno', 'stipendio', 'work', 'job', 'shift', 'salary', 'unemployment'],
  },
]

export const DEFAULT_FABRIC: FabricPackConfig = {
  defaultMode: 'filaments',
  defaultOpacity: 0.55,
  palette: PALETTE_PRESETS[1]!,
  curvature: 0.35,
  fieldBandMeters: 450,
  fieldBandMinutes: 8,
  nodeScale: 1,
  thickness: 1,
  halo: 0.4,
  labelZoom: 16,
  proximityMeters: 450,
}

export function defaultCopy(title: Localized, subtitle: Localized): PackCopy {
  return {
    title,
    subtitle,
    emptyState: {
      it: 'Nessuna storia su questo filtro in quest’area: il vuoto è un dato, non una mappa vuota.',
      en: 'No story matches this filter in this area: the gap is data, not an empty map.',
    },
    sparseState: {
      it: 'Poche storie per questo stato: il fabric mostra ciò che può e dichiara l’insufficienza.',
      en: 'Few stories for this state: the fabric shows what it can and declares the shortfall.',
    },
  }
}
