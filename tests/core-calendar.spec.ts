import { describe, expect, it } from 'vitest'
import { buildCalendar, easterSunday, resolveInstance } from '../src/core/calendar/recurrence'
import { EVENT_TEMPLATES } from '../src/core/calendar/seeds'
import type { EventTemplate } from '../src/core/calendar/types'
import { SEED_PACKS } from '../src/core/packs/seeds'

function template(id: string): EventTemplate {
  const found = EVENT_TEMPLATES.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`missing template ${id}`)
  return found
}

describe('recurring calendar', () => {
  it('computes Easter and the rule-based instances', () => {
    expect(easterSunday(2026)).toEqual({ month: 4, day: 5 })
    expect(easterSunday(2025)).toEqual({ month: 4, day: 20 })

    const holyWeek = resolveInstance(template('scicli_settimana_santa'), 2026)
    expect(holyWeek.from).toBe('2026-03-29')
    expect(holyWeek.to).toBe('2026-04-06')

    const cavalcade = resolveInstance(template('scicli_cavalcata_san_giuseppe'), 2026)
    expect(cavalcade.from).toBe('2026-03-21')
    expect(cavalcade.to).toBe('2026-03-21')

    const milizie = resolveInstance(template('scicli_madonna_milizie'), 2026)
    expect(milizie.from).toBe('2026-05-30')
  })

  it('keeps every template as a rule with a source, a confidence and no invented certainty', () => {
    expect(EVENT_TEMPLATES.length).toBeGreaterThan(10)
    for (const event of EVENT_TEMPLATES) {
      expect(event.source.url).toMatch(/^https:\/\//)
      expect(event.source.retrievedAt).toBe('2026-11-14')
      expect(['verified', 'approximate', 'client']).toContain(event.confidence)
      expect(event.recurrence.rule.length).toBeGreaterThan(3)
      expect(event.defaultStatus).not.toBe('confirmed')
    }
    const marathon = resolveInstance(template('beirut_marathon'), 2026)
    expect(marathon.status).toBe('tbd')
    expect(marathon.notes).toContain('divergono')

    const national = resolveInstance(template('national_baalbeck'), 2026)
    expect(national.status).toBe('tbd')
    expect(national.notes).toContain('rinviata o cancellata')
  })

  it('shows only the territory calendar and national events only when included', () => {
    const scicliPack = SEED_PACKS.find((pack) => pack.id === 'scicli_demo')!
    const beirutPack = SEED_PACKS.find((pack) => pack.id === 'beirut_demo')!

    const scicli = buildCalendar(EVENT_TEMPLATES, 'scicli', 2026, scicliPack.includeNational, scicliPack.events)
    expect(scicli.curated).toBe(true)
    expect(scicli.instances).toHaveLength(7)
    expect(scicli.instances.every((instance) => instance.source.url.length > 8)).toBe(true)
    expect(scicli.instances.every((instance) => instance.from !== '')).toBe(true)
    expect(scicli.nationalIncluded).toBe(false)

    const beirut = buildCalendar(EVENT_TEMPLATES, 'beirut', 2026, beirutPack.includeNational, beirutPack.events)
    expect(beirut.nationalIncluded).toBe(true)
    expect(beirut.instances.some((instance) => instance.templateId === 'national_baalbeck')).toBe(true)
    expect(beirut.instances.every((instance) => instance.templateId.startsWith('beirut_') || instance.templateId.startsWith('national_'))).toBe(true)

    const empty = buildCalendar(EVENT_TEMPLATES, 'nowhere_synthetic', 2026, false, [])
    expect(empty.curated).toBe(false)
    expect(empty.instances).toEqual([])
  })

  it('marks uncertain editions as tbd and never asserts a confirmed date', () => {
    const pack = SEED_PACKS.find((candidate) => candidate.id === 'scicli_demo')!
    const calendar = buildCalendar(EVENT_TEMPLATES, 'scicli', 2026, false, pack.events)
    const uncertain = calendar.instances.filter((instance) => instance.status === 'tbd')
    expect(uncertain.length).toBeGreaterThan(0)
    for (const instance of calendar.instances) {
      if (instance.status === 'confirmed') throw new Error('no edition is confirmed by this dataset')
      if (instance.from) expect(instance.from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})
