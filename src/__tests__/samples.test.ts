import { describe, expect, it } from 'vitest'
import type { AppData, EventItem, EventStatus, ReservationStatus } from '../types'
import { EVENT_TYPES, WORKS } from '../constants'
import { createDefaultTrip } from '../data/initial'
import { createSampleEvents } from '../data/samples'
import { getEventStatus, getReservationStatus } from '../lib/status'
import { getAddWarnings, isDateInEventPeriod } from '../lib/trip'
import { rangesOverlap } from '../lib/date'
import { validateAppData } from '../lib/validate'

const samples = createSampleEvents()
const byId = (id: string): EventItem => {
  const e = samples.find((s) => s.id === id)
  if (!e) throw new Error(`missing ${id}`)
  return e
}

/** '오늘' = 2026-11-23 정오 (도쿄) */
const NOW = new Date('2026-11-23T03:00:00Z')
const TRIP = createDefaultTrip()

describe('sample events — safety rules', () => {
  it('has 10–14 events with stable, unique ids', () => {
    expect(samples.length).toBeGreaterThanOrEqual(10)
    expect(samples.length).toBeLessThanOrEqual(14)
    const ids = samples.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    ids.forEach((id, i) => expect(id).toBe(`sample_${String(i + 1).padStart(3, '0')}`))
  })

  it('every event is marked as a sample', () => {
    for (const e of samples) {
      expect(e.isSample, e.id).toBe(true)
      expect(e.title.startsWith('[샘플] '), e.id).toBe(true)
      expect(e.venue, e.id).toContain('(샘플')
      expect(e.address, e.id).toContain('(샘플')
      expect(e.memo, e.id).toContain('시연용 가상 데이터입니다.')
    }
  })

  it('never contains URLs', () => {
    for (const e of samples) {
      expect(e.officialUrl, e.id).toBe('')
      expect(e.reservationUrl, e.id).toBe('')
      const text = [e.title, e.venue, e.address, e.memo].join(' ')
      expect(text, e.id).not.toMatch(/https?:\/\/|www\.|\.(com|jp|kr|net|org)\b/i)
    }
  })

  it('uses one createdAt/updatedAt timestamp', () => {
    const stamps = new Set(samples.flatMap((e) => [e.createdAt, e.updatedAt]))
    expect(stamps.size).toBe(1)
    expect(Number.isNaN(Date.parse([...stamps][0]))).toBe(false)
  })

  it('returns fresh objects on every call', () => {
    const a = createSampleEvents()
    const b = createSampleEvents()
    expect(a).not.toBe(b)
    expect(a[0]).not.toBe(b[0])
    expect(a[0].works).not.toBe(b[0].works)
  })

  it('passes validateAppData when wrapped in AppData (and survives JSON)', () => {
    const data: AppData = {
      schemaVersion: 1,
      events: samples,
      favorites: samples.slice(0, 2).map((e) => e.id),
      trips: [TRIP],
      activeTripId: TRIP.id,
    }
    const res = validateAppData(JSON.parse(JSON.stringify(data)))
    if (!res.ok) throw new Error(res.errors.join('\n'))
    expect(res.data).toEqual(data)
  })
})

describe('sample events — coverage', () => {
  it('covers every work except "other" and every event type', () => {
    const works = new Set(samples.flatMap((e) => e.works))
    for (const w of WORKS.filter((w) => w.id !== 'other')) expect(works.has(w.id), w.id).toBe(true)
    const types = new Set(samples.map((e) => e.type))
    for (const t of EVENT_TYPES) expect(types.has(t.id), t.id).toBe(true)
  })

  it('is mostly Tokyo, plus Osaka and Seoul with matching time zones', () => {
    const count = (c: string) => samples.filter((e) => e.city === c).length
    expect(count('도쿄')).toBeGreaterThan(samples.length / 2)
    expect(count('오사카')).toBeGreaterThanOrEqual(1)
    expect(count('서울')).toBeGreaterThanOrEqual(1)
    for (const e of samples) {
      expect(e.timezone, e.id).toBe(e.city === '서울' ? 'Asia/Seoul' : 'Asia/Tokyo')
      expect(e.country, e.id).toBe(e.city === '서울' ? '한국' : '일본')
    }
  })

  it('mixes lastCheckedDate set and null', () => {
    expect(samples.some((e) => e.lastCheckedDate === null)).toBe(true)
    expect(samples.some((e) => e.lastCheckedDate !== null)).toBe(true)
  })

  it('has every event status and every reservation status as of 2026-11-23', () => {
    const es = new Set<EventStatus>(samples.map((e) => getEventStatus(e, NOW)))
    expect([...es].sort()).toEqual(['ended', 'ongoing', 'unknown', 'upcoming'])
    const rs = new Set<ReservationStatus>(samples.map((e) => getReservationStatus(e, NOW)))
    expect([...rs].sort()).toEqual(['before_open', 'closed', 'not_required', 'open', 'unknown'])
  })

  it('several samples overlap the default trip 2027-01-09 ~ 01-13', () => {
    const overlapping = samples.filter((e) => rangesOverlap(e.startDate, e.endDate, TRIP.startDate, TRIP.endDate))
    expect(overlapping.length).toBeGreaterThanOrEqual(5)
  })
})

describe('sample events — specific scenarios', () => {
  const scenarios: [id: string, status: EventStatus, reservation: ReservationStatus][] = [
    ['sample_001', 'upcoming', 'before_open'],
    ['sample_002', 'upcoming', 'not_required'],
    ['sample_003', 'ongoing', 'open'],
    ['sample_004', 'ended', 'closed'],
    ['sample_005', 'upcoming', 'before_open'],
    ['sample_006', 'upcoming', 'unknown'],
    ['sample_007', 'ongoing', 'not_required'],
    ['sample_008', 'upcoming', 'unknown'],
    ['sample_009', 'ongoing', 'unknown'],
    ['sample_010', 'upcoming', 'closed'],
    ['sample_011', 'unknown', 'unknown'],
    ['sample_012', 'unknown', 'not_required'],
    ['sample_013', 'upcoming', 'open'],
  ]
  it.each(scenarios)('%s → %s / %s', (id, status, reservation) => {
    const e = byId(id)
    expect(getEventStatus(e, NOW)).toBe(status)
    expect(getReservationStatus(e, NOW)).toBe(reservation)
  })

  it('sample_002 ends 2027-01-10 → adding on 1/12 warns "행사 기간 밖"', () => {
    const e = byId('sample_002')
    expect(e.endDate).toBe('2027-01-10')
    expect(getAddWarnings(TRIP, '2027-01-10', e)).toEqual([])
    expect(getAddWarnings(TRIP, '2027-01-12', e).map((w) => w.kind)).toEqual(['out_of_period'])
  })

  it('sample_005 starts 2027-01-12 (inside the trip)', () => {
    const e = byId('sample_005')
    expect(e.startDate).toBe('2027-01-12')
    expect(isDateInEventPeriod(e, '2027-01-11')).toBe(false)
    expect(isDateInEventPeriod(e, '2027-01-12')).toBe(true)
  })

  it('sample_003 reservation window is open now and uses Tokyo wall time', () => {
    const e = byId('sample_003')
    expect([e.reservationStart, e.reservationEnd]).toEqual(['2026-11-01T10:00', '2027-01-08T23:59'])
    // on the first trip day (Tokyo) the reservation window has closed, but the event is still running
    const tripDay = new Date('2027-01-09T03:00:00Z')
    expect(getReservationStatus(e, tripDay)).toBe('closed')
    expect(getEventStatus(e, tripDay)).toBe('ongoing')
  })

  it('sample_008 is required with null times → unknown, never open', () => {
    const e = byId('sample_008')
    expect(e.reservationRequired).toBe('required')
    expect(e.reservationStart).toBeNull()
    expect(e.reservationEnd).toBeNull()
    expect(getReservationStatus(e, NOW)).not.toBe('open')
  })

  it('sample_004 ended in October 2026', () => {
    expect(byId('sample_004').endDate?.startsWith('2026-10')).toBe(true)
  })

  it('sample_012 is a permanent shop with no dates and no reservation, addable to any trip day', () => {
    const e = byId('sample_012')
    expect(e).toMatchObject({ type: 'shop', startDate: null, endDate: null, reservationRequired: 'not_required' })
    for (const d of ['2027-01-09', '2027-01-13']) {
      // only an informational 'period_unknown' warning — never 'out_of_period'
      expect(getAddWarnings(TRIP, d, e).map((w) => w.kind)).toEqual(['period_unknown'])
    }
  })

  it('sample_011 has no dates (기간 확인 필요)', () => {
    expect(byId('sample_011')).toMatchObject({ startDate: null, endDate: null, reservationRequired: 'unknown' })
  })
})
