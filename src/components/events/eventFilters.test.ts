import { describe, expect, it } from 'vitest'
import type { EventItem } from '../../types'
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  decodeRegion,
  encodeRegion,
  filterAndSort,
  regionGroups,
  sanitizeFilters,
  type EventFilters,
} from './eventFilters'

// 2027-01-10 12:00 JST
const NOW = new Date('2027-01-10T03:00:00Z')

function ev(id: string, p: Partial<EventItem> = {}): EventItem {
  return {
    id,
    isSample: false,
    title: id,
    works: ['genshin'],
    type: 'popup',
    country: '일본',
    city: '도쿄',
    venue: '',
    address: '',
    startDate: null,
    endDate: null,
    timezone: 'Asia/Tokyo',
    reservationRequired: 'unknown',
    reservationStart: null,
    reservationEnd: null,
    officialUrl: '',
    reservationUrl: '',
    lastCheckedDate: null,
    memo: '',
    createdAt: '',
    updatedAt: '',
    ...p,
  }
}

const f = (p: Partial<EventFilters> = {}): EventFilters => ({ ...DEFAULT_FILTERS, ...p })

const events = [
  ev('ended', { startDate: '2026-12-01', endDate: '2026-12-31' }),
  ev('unknown', { startDate: null, endDate: null, works: ['starrail'] }),
  ev('upcoming-late', { startDate: '2027-02-01', endDate: '2027-02-10', type: 'cafe', city: '오사카' }),
  ev('ongoing', { startDate: '2027-01-01', endDate: '2027-01-20', works: ['starrail', 'zzz'], venue: '시부야 매장' }),
  ev('upcoming-soon', { startDate: '2027-01-12', endDate: '2027-01-15', country: '한국', city: '서울' }),
  ev('ended-older', { startDate: '2026-10-01', endDate: '2026-10-10' }),
]

const ids = (filters: EventFilters) => filterAndSort(events, filters, NOW).items.map((x) => x.event.id)

describe('filterAndSort', () => {
  it('hides ended by default and sorts ongoing/upcoming → unknown', () => {
    const r = filterAndSort(events, f(), NOW)
    expect(r.items.map((x) => x.event.id)).toEqual(['ongoing', 'upcoming-soon', 'upcoming-late', 'unknown'])
    expect(r.hiddenEnded).toBe(2)
  })

  it('puts ended last, most recent first', () => {
    expect(ids(f({ hideEnded: false }))).toEqual(['ongoing', 'upcoming-soon', 'upcoming-late', 'unknown', 'ended', 'ended-older'])
  })

  it('filters works with OR', () => {
    expect(ids(f({ works: ['zzz', 'starrail'] }))).toEqual(['ongoing', 'unknown'])
  })

  it('filters region by country and city', () => {
    expect(ids(f({ country: '한국', city: null }))).toEqual(['upcoming-soon'])
    expect(ids(f({ country: '일본', city: '오사카' }))).toEqual(['upcoming-late'])
  })

  it('filters date overlap, keeping unknown-period events', () => {
    expect(ids(f({ from: '2027-01-14', to: '2027-01-31' }))).toEqual(['ongoing', 'upcoming-soon', 'unknown'])
    expect(ids(f({ from: '2027-02-05' }))).toEqual(['upcoming-late', 'unknown'])
  })

  it('ignores an inverted date range', () => {
    expect(ids(f({ from: '2027-03-01', to: '2027-01-01' }))).toHaveLength(4)
  })

  it('searches title/venue with all tokens', () => {
    expect(ids(f({ q: '시부야' }))).toEqual(['ongoing'])
    expect(ids(f({ q: '시부야 없음' }))).toEqual([])
  })
})

describe('helpers', () => {
  it('counts active filters', () => {
    expect(activeFilterCount(f())).toBe(0)
    expect(activeFilterCount(f({ works: ['zzz'], from: '2027-01-01', hideEnded: false }))).toBe(2)
  })

  it('sanitizes stored filters', () => {
    expect(sanitizeFilters(null)).toEqual(DEFAULT_FILTERS)
    expect(sanitizeFilters({ works: ['genshin', 'nope'], types: ['cafe', 1], from: 'bad', hideEnded: false, city: 'x' })).toEqual({
      ...DEFAULT_FILTERS,
      works: ['genshin'],
      types: ['cafe'],
      hideEnded: false,
    })
  })

  it('round-trips region values', () => {
    expect(decodeRegion(encodeRegion('일본', '도쿄'))).toEqual({ country: '일본', city: '도쿄' })
    expect(decodeRegion(encodeRegion('', null))).toEqual({ country: '', city: null })
    expect(decodeRegion('')).toEqual({ country: null, city: null })
    expect(decodeRegion('garbage')).toEqual({ country: null, city: null })
  })

  it('groups regions', () => {
    const g = regionGroups([...events, ev('blank', { country: '', city: '' })])
    expect(g.map((x) => x.country)).toEqual(['일본', '한국', ''])
    expect(g[0].cities.map((c) => c.city)).toEqual(['도쿄', '오사카'])
  })
})
