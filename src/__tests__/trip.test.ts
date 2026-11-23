import { describe, expect, it } from 'vitest'
import type { EventItem, ItineraryItem, Trip } from '../types'
import {
  getAddWarnings,
  hasDuplicateEvent,
  isDateInEventPeriod,
  itemsByDate,
  itemsOutsideTrip,
  tripDates,
  tripDatesWithinEvent,
} from '../lib/trip'

const T = '2026-11-23T00:00:00.000Z'

function makeEvent(p: Partial<EventItem> = {}): EventItem {
  return {
    id: 'evt_1',
    isSample: false,
    title: '테스트 행사',
    works: ['genshin'],
    type: 'popup',
    country: '일본',
    city: '도쿄',
    venue: '',
    address: '',
    startDate: '2026-12-26',
    endDate: '2027-01-10',
    timezone: 'Asia/Tokyo',
    reservationRequired: 'not_required',
    reservationStart: null,
    reservationEnd: null,
    officialUrl: '',
    reservationUrl: '',
    lastCheckedDate: null,
    memo: '',
    createdAt: T,
    updatedAt: T,
    ...p,
  }
}

function eventItem(id: string, date: string, eventId: string): ItineraryItem {
  return { id, date, kind: 'event', eventId, placeName: '', placeAddress: '', time: null, memo: '' }
}

function placeItem(id: string, date: string, placeName: string): ItineraryItem {
  return { id, date, kind: 'place', eventId: null, placeName, placeAddress: '', time: '10:00', memo: '' }
}

function makeTrip(items: ItineraryItem[] = []): Trip {
  return {
    id: 'trip_1',
    name: '도쿄 여행',
    startDate: '2027-01-09',
    endDate: '2027-01-13',
    timezone: 'Asia/Tokyo',
    city: '도쿄',
    accommodation: { name: '', address: '', memo: '' },
    items,
    createdAt: T,
    updatedAt: T,
  }
}

const kinds = (ws: { kind: string }[]) => ws.map((w) => w.kind)

describe('isDateInEventPeriod', () => {
  const e = { startDate: '2026-12-26', endDate: '2027-01-10' }

  it('true inside the period (inclusive)', () => {
    expect(isDateInEventPeriod(e, '2026-12-26')).toBe(true)
    expect(isDateInEventPeriod(e, '2027-01-09')).toBe(true)
    expect(isDateInEventPeriod(e, '2027-01-10')).toBe(true)
  })

  it('false outside the period', () => {
    expect(isDateInEventPeriod(e, '2027-01-11')).toBe(false)
    expect(isDateInEventPeriod(e, '2027-01-12')).toBe(false)
    expect(isDateInEventPeriod(e, '2026-12-25')).toBe(false)
  })

  it("'unknown' when an end is missing and the date is not ruled out", () => {
    expect(isDateInEventPeriod({ startDate: null, endDate: null }, '2027-01-12')).toBe('unknown')
    expect(isDateInEventPeriod({ startDate: '2027-01-01', endDate: null }, '2027-01-12')).toBe('unknown')
    expect(isDateInEventPeriod({ startDate: null, endDate: '2027-01-31' }, '2027-01-12')).toBe('unknown')
  })

  it('false when the known end already rules the date out', () => {
    expect(isDateInEventPeriod({ startDate: '2027-01-12', endDate: null }, '2027-01-10')).toBe(false)
    expect(isDateInEventPeriod({ startDate: null, endDate: '2027-01-10' }, '2027-01-12')).toBe(false)
  })
})

describe('getAddWarnings', () => {
  it('no warnings for a date inside both the trip and the event period', () => {
    expect(getAddWarnings(makeTrip(), '2027-01-09', makeEvent())).toEqual([])
  })

  it("out_of_period when the event ends 2027-01-10 and it's added on 2027-01-12", () => {
    const w = getAddWarnings(makeTrip(), '2027-01-12', makeEvent())
    expect(kinds(w)).toEqual(['out_of_period'])
    expect(w[0].message).toContain('행사 기간 밖')
  })

  it('out_of_period for a date before the event starts', () => {
    const e = makeEvent({ startDate: '2027-01-12', endDate: '2027-01-13' })
    expect(kinds(getAddWarnings(makeTrip(), '2027-01-11', e))).toEqual(['out_of_period'])
    expect(kinds(getAddWarnings(makeTrip(), '2027-01-12', e))).toEqual([])
  })

  it('period_unknown when the event period is not confirmed', () => {
    const e = makeEvent({ startDate: null, endDate: null })
    const w = getAddWarnings(makeTrip(), '2027-01-11', e)
    expect(kinds(w)).toEqual(['period_unknown'])
    expect(w[0].message).toContain('확인되지 않았습니다')
  })

  it('duplicate when the same event is already on that date', () => {
    const trip = makeTrip([eventItem('item_a', '2027-01-09', 'evt_1')])
    expect(kinds(getAddWarnings(trip, '2027-01-09', makeEvent()))).toEqual(['duplicate'])
    // a different date is fine
    expect(kinds(getAddWarnings(trip, '2027-01-10', makeEvent()))).toEqual([])
    // a different event on the same date is fine
    expect(kinds(getAddWarnings(trip, '2027-01-09', makeEvent({ id: 'evt_2' })))).toEqual([])
  })

  it('exceptItemId ignores the item being moved/edited itself', () => {
    const trip = makeTrip([eventItem('item_a', '2027-01-09', 'evt_1')])
    expect(kinds(getAddWarnings(trip, '2027-01-09', makeEvent(), 'item_a'))).toEqual([])
    // but another copy still counts
    const trip2 = makeTrip([eventItem('item_a', '2027-01-09', 'evt_1'), eventItem('item_b', '2027-01-09', 'evt_1')])
    expect(kinds(getAddWarnings(trip2, '2027-01-09', makeEvent(), 'item_a'))).toEqual(['duplicate'])
  })

  it('place items with the same date never count as duplicates', () => {
    const trip = makeTrip([placeItem('item_p', '2027-01-09', '숙소')])
    expect(kinds(getAddWarnings(trip, '2027-01-09', makeEvent()))).toEqual([])
  })

  it('outside_trip for dates outside the trip, combined with event warnings', () => {
    expect(kinds(getAddWarnings(makeTrip(), '2027-01-08', makeEvent()))).toEqual(['outside_trip'])
    expect(kinds(getAddWarnings(makeTrip(), '2027-01-14', makeEvent()))).toEqual(['outside_trip', 'out_of_period'])
  })

  it('only outside_trip is checked when there is no event', () => {
    expect(getAddWarnings(makeTrip(), '2027-01-10', undefined)).toEqual([])
    expect(kinds(getAddWarnings(makeTrip(), '2027-01-20', undefined))).toEqual(['outside_trip'])
  })
})

describe('itemsOutsideTrip / itemsByDate / tripDates', () => {
  const items = [
    eventItem('i1', '2027-01-08', 'evt_1'),
    placeItem('i2', '2027-01-09', '숙소 체크인'),
    eventItem('i3', '2027-01-13', 'evt_1'),
    placeItem('i4', '2027-01-14', '공항'),
    placeItem('i5', '2027-01-09', '저녁'),
  ]
  const trip = makeTrip(items)

  it('returns items whose date fell outside the (edited) trip range', () => {
    expect(itemsOutsideTrip(trip).map((i) => i.id)).toEqual(['i1', 'i4'])
    expect(itemsOutsideTrip({ ...trip, startDate: '2027-01-08', endDate: '2027-01-14' })).toEqual([])
    expect(itemsOutsideTrip({ ...trip, startDate: '2027-01-10', endDate: '2027-01-12' }).map((i) => i.id)).toEqual([
      'i1',
      'i2',
      'i3',
      'i4',
      'i5',
    ])
  })

  it('groups by date keeping array order', () => {
    expect(itemsByDate(trip, '2027-01-09').map((i) => i.id)).toEqual(['i2', 'i5'])
    expect(itemsByDate(trip, '2027-01-11')).toEqual([])
  })

  it('lists trip dates', () => {
    expect(tripDates(trip)).toEqual(['2027-01-09', '2027-01-10', '2027-01-11', '2027-01-12', '2027-01-13'])
  })

  it('hasDuplicateEvent respects date and kind', () => {
    expect(hasDuplicateEvent(trip, '2027-01-13', 'evt_1')).toBe(true)
    expect(hasDuplicateEvent(trip, '2027-01-13', 'evt_1', 'i3')).toBe(false)
    expect(hasDuplicateEvent(trip, '2027-01-12', 'evt_1')).toBe(false)
  })

  it('tripDatesWithinEvent keeps known-in and unknown dates', () => {
    expect(tripDatesWithinEvent(trip, makeEvent())).toEqual(['2027-01-09', '2027-01-10'])
    expect(tripDatesWithinEvent(trip, makeEvent({ startDate: '2027-01-12', endDate: null }))).toEqual([
      '2027-01-12',
      '2027-01-13',
    ])
    expect(tripDatesWithinEvent(trip, makeEvent({ startDate: '2026-10-01', endDate: '2026-10-25' }))).toEqual([])
  })
})

describe('long trips and permanent shops', () => {
  it('itemsOutsideTrip also catches items beyond the 366 rendered days', async () => {
    const { itemsOutsideTrip } = await import('../lib/trip')
    const trip = {
      id: 't', name: 't', startDate: '2027-01-01', endDate: '2028-06-30', timezone: 'Asia/Tokyo', city: '',
      accommodation: { name: '', address: '', memo: '' }, createdAt: '', updatedAt: '',
      items: [{ id: 'a', date: '2028-03-01', kind: 'place' as const, eventId: null, placeName: 'x', placeAddress: '', time: null, memo: '' }],
    }
    expect(itemsOutsideTrip(trip).map((i) => i.id)).toEqual(['a'])
  })
  it('isDateInEventPeriod is true for a dateless shop', async () => {
    const { isDateInEventPeriod } = await import('../lib/trip')
    expect(isDateInEventPeriod({ startDate: null, endDate: null, type: 'shop' }, '2027-01-10')).toBe(true)
    expect(isDateInEventPeriod({ startDate: null, endDate: null, type: 'cafe' }, '2027-01-10')).toBe('unknown')
  })
})
