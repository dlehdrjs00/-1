import { describe, expect, it } from 'vitest'
import type { EventItem } from '../types'
import { getEventStatus, getReservationStatus, orUnknown } from '../lib/status'

type StatusInput = Pick<
  EventItem,
  'startDate' | 'endDate' | 'timezone' | 'reservationRequired' | 'reservationStart' | 'reservationEnd'
>

function ev(p: Partial<StatusInput> = {}): StatusInput {
  return {
    startDate: '2026-12-01',
    endDate: '2027-01-31',
    timezone: 'Asia/Tokyo',
    reservationRequired: 'required',
    reservationStart: null,
    reservationEnd: null,
    ...p,
  }
}

/** 2026-11-23 12:00 in Tokyo (03:00Z) */
const NOW = new Date('2026-11-23T03:00:00Z')

describe('getEventStatus', () => {
  it('upcoming before start date', () => {
    expect(getEventStatus(ev({ startDate: '2026-12-01', endDate: '2026-12-31' }), NOW)).toBe('upcoming')
    // start known, end unknown, still before start → upcoming
    expect(getEventStatus(ev({ startDate: '2026-12-01', endDate: null }), NOW)).toBe('upcoming')
  })

  it('ongoing inclusive of both ends', () => {
    expect(getEventStatus(ev({ startDate: '2026-11-01', endDate: '2027-01-15' }), NOW)).toBe('ongoing')
    expect(getEventStatus(ev({ startDate: '2026-11-23', endDate: '2026-11-30' }), NOW)).toBe('ongoing')
    expect(getEventStatus(ev({ startDate: '2026-11-01', endDate: '2026-11-23' }), NOW)).toBe('ongoing')
  })

  it('ended after end date', () => {
    expect(getEventStatus(ev({ startDate: '2026-10-01', endDate: '2026-10-25' }), NOW)).toBe('ended')
    // start unknown, end passed → ended
    expect(getEventStatus(ev({ startDate: null, endDate: '2026-11-22' }), NOW)).toBe('ended')
  })

  it('unknown when there is not enough information', () => {
    expect(getEventStatus(ev({ startDate: null, endDate: null }), NOW)).toBe('unknown')
    // started but end unknown → cannot say it is still going
    expect(getEventStatus(ev({ startDate: '2026-11-01', endDate: null }), NOW)).toBe('unknown')
    // not ended yet but start unknown
    expect(getEventStatus(ev({ startDate: null, endDate: '2026-12-31' }), NOW)).toBe('unknown')
  })

  it('uses the event time zone for the boundary (Tokyo is already 2027-01-01)', () => {
    const e = ev({ startDate: '2026-12-01', endDate: '2026-12-31', timezone: 'Asia/Tokyo' })
    expect(getEventStatus(e, new Date('2026-12-31T14:59:00Z'))).toBe('ongoing') // 23:59 Tokyo
    expect(getEventStatus(e, new Date('2026-12-31T16:00:00Z'))).toBe('ended') // 2027-01-01 01:00 Tokyo
    // the same instant in Los Angeles is still 2026-12-31 08:00 → ongoing
    expect(getEventStatus({ ...e, timezone: 'America/Los_Angeles' }, new Date('2026-12-31T16:00:00Z'))).toBe('ongoing')
  })

  it('upcoming → ongoing flips at local midnight of the start date', () => {
    const e = ev({ startDate: '2027-01-09', endDate: '2027-01-13', timezone: 'Asia/Tokyo' })
    expect(getEventStatus(e, new Date('2027-01-08T14:59:00Z'))).toBe('upcoming') // 1/8 23:59 Tokyo
    expect(getEventStatus(e, new Date('2027-01-08T15:00:00Z'))).toBe('ongoing') // 1/9 00:00 Tokyo
  })
})

describe('getReservationStatus', () => {
  it('not_required regardless of times', () => {
    expect(getReservationStatus(ev({ reservationRequired: 'not_required' }), NOW)).toBe('not_required')
    expect(
      getReservationStatus(
        ev({ reservationRequired: 'not_required', reservationStart: '2026-11-01T10:00', reservationEnd: '2027-01-08T23:59' }),
        NOW,
      ),
    ).toBe('not_required')
  })

  it('unknown requirement → unknown even if times look open', () => {
    expect(getReservationStatus(ev({ reservationRequired: 'unknown' }), NOW)).toBe('unknown')
    expect(
      getReservationStatus(
        ev({ reservationRequired: 'unknown', reservationStart: '2026-11-01T10:00', reservationEnd: '2027-01-08T23:59' }),
        NOW,
      ),
    ).toBe('unknown')
  })

  it("required + both times null → unknown (never 'open')", () => {
    const s = getReservationStatus(ev({ reservationRequired: 'required', reservationStart: null, reservationEnd: null }), NOW)
    expect(s).toBe('unknown')
    expect(s).not.toBe('open')
  })

  it('before_open when start is in the future', () => {
    expect(
      getReservationStatus(ev({ reservationStart: '2026-12-01T18:00', reservationEnd: '2027-01-30T23:59' }), NOW),
    ).toBe('before_open')
    // only start known (future) → still before_open
    expect(getReservationStatus(ev({ reservationStart: '2026-12-01T18:00', reservationEnd: null }), NOW)).toBe('before_open')
  })

  it('open only when start and end are both known and now is between them', () => {
    const e = ev({ startDate: '2026-11-01', endDate: '2027-01-15', reservationStart: '2026-11-01T10:00', reservationEnd: '2027-01-08T23:59' })
    expect(getReservationStatus(e, NOW)).toBe('open')
    // start is inclusive (Tokyo 2026-11-01 10:00 = 01:00Z)
    expect(getReservationStatus(e, new Date('2026-11-01T01:00:00Z'))).toBe('open')
    expect(getReservationStatus(e, new Date('2026-11-01T00:59:00Z'))).toBe('before_open')
    // one minute before end (Tokyo 2027-01-08 23:58 = 14:58Z)
    expect(getReservationStatus(e, new Date('2027-01-08T14:58:00Z'))).toBe('open')
  })

  it('start known & passed but end null → unknown', () => {
    expect(getReservationStatus(ev({ reservationStart: '2026-11-01T12:00', reservationEnd: null }), NOW)).toBe('unknown')
  })

  it('start null but end in the future → unknown', () => {
    expect(getReservationStatus(ev({ reservationStart: null, reservationEnd: '2027-01-08T23:59' }), NOW)).toBe('unknown')
  })

  it('closed after reservation end', () => {
    const e = ev({ startDate: '2027-01-05', endDate: '2027-01-20', reservationStart: '2026-11-01T10:00', reservationEnd: '2026-11-20T23:59' })
    expect(getReservationStatus(e, NOW)).toBe('closed')
    // end known & passed, start unknown → closed
    expect(getReservationStatus(ev({ reservationStart: null, reservationEnd: '2026-11-20T23:59' }), NOW)).toBe('closed')
    // Tokyo 2027-01-09 00:00 = 2027-01-08T15:00Z
    const open = ev({ startDate: '2026-11-01', endDate: '2027-01-15', reservationStart: '2026-11-01T10:00', reservationEnd: '2027-01-08T23:59' })
    expect(getReservationStatus(open, new Date('2027-01-08T15:00:00Z'))).toBe('closed')
    // 종료 분(23:59) 동안은 아직 접수 중 (Tokyo 23:59:30 = 14:59:30Z)
    expect(getReservationStatus(open, new Date('2027-01-08T14:59:30Z'))).toBe('open')
  })

  it('closed when the event itself has ended, even with unknown times', () => {
    expect(getReservationStatus(ev({ startDate: '2026-10-01', endDate: '2026-10-25' }), NOW)).toBe('closed')
    expect(
      getReservationStatus(
        ev({ startDate: '2026-10-01', endDate: '2026-10-25', reservationStart: '2026-09-01T12:00', reservationEnd: null }),
        NOW,
      ),
    ).toBe('closed')
  })

  it('compares reservation times in the event time zone', () => {
    // 2026-12-01T09:30Z = 18:30 Tokyo, 01:30 Los Angeles
    const at = new Date('2026-12-01T09:30:00Z')
    const tokyo = ev({ reservationStart: '2026-12-01T18:00', reservationEnd: '2026-12-10T23:59', timezone: 'Asia/Tokyo' })
    expect(getReservationStatus(tokyo, at)).toBe('open')
    expect(getReservationStatus({ ...tokyo, timezone: 'America/Los_Angeles' }, at)).toBe('before_open')
  })
})

describe('orUnknown', () => {
  it("replaces empty values with '확인 필요'", () => {
    expect(orUnknown('')).toBe('확인 필요')
    expect(orUnknown('   ')).toBe('확인 필요')
    expect(orUnknown(null)).toBe('확인 필요')
    expect(orUnknown(undefined)).toBe('확인 필요')
    expect(orUnknown('가상 카페')).toBe('가상 카페')
  })
})
