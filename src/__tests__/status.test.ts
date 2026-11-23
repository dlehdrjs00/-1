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

describe('getReservationStatus — date-only start/end (시각 미정)', () => {
  // NOW = 2026-11-23 12:00 Tokyo. 행사 기간 2026-12-01 ~ 2027-01-31 (아직 종료 전)
  const st = (p: Partial<StatusInput>, at: Date = NOW) => getReservationStatus(ev(p), at)

  it('date-only start in the future → before_open', () => {
    expect(st({ reservationStart: '2026-12-01', reservationEnd: null })).toBe('before_open')
    expect(st({ reservationStart: '2026-12-01', reservationEnd: '2026-12-20' })).toBe('before_open')
    expect(st({ reservationStart: '2026-11-24', reservationEnd: '2026-12-20T23:59' })).toBe('before_open') // 내일
  })

  it('date-only start TODAY → unknown (opening time unknown, never open/before_open)', () => {
    expect(st({ reservationStart: '2026-11-23', reservationEnd: '2026-12-20T23:59' })).toBe('unknown')
    expect(st({ reservationStart: '2026-11-23', reservationEnd: '2026-12-20' })).toBe('unknown')
    expect(st({ reservationStart: '2026-11-23', reservationEnd: null })).toBe('unknown')
  })

  it('date-only start passed + end definitely ahead → open', () => {
    expect(st({ reservationStart: '2026-11-22', reservationEnd: '2026-12-20T23:59' })).toBe('open')
    expect(st({ reservationStart: '2026-11-22', reservationEnd: '2026-11-24' })).toBe('open') // 종료일 내일
    expect(st({ reservationStart: '2026-11-22', reservationEnd: '2026-11-23T12:00' })).toBe('open') // 종료 분 포함
  })

  it('date-only end TODAY → unknown (closing time unknown, never open/closed)', () => {
    expect(st({ reservationStart: '2026-11-01T10:00', reservationEnd: '2026-11-23' })).toBe('unknown')
    expect(st({ reservationStart: '2026-11-01', reservationEnd: '2026-11-23' })).toBe('unknown')
    expect(st({ reservationStart: null, reservationEnd: '2026-11-23' })).toBe('unknown')
  })

  it('date-only end passed → closed, whatever the start', () => {
    expect(st({ reservationStart: '2026-11-01', reservationEnd: '2026-11-22' })).toBe('closed')
    expect(st({ reservationStart: '2026-11-01T10:00', reservationEnd: '2026-11-22' })).toBe('closed')
    expect(st({ reservationStart: null, reservationEnd: '2026-11-22' })).toBe('closed')
  })

  it('datetime start passed + date-only end ahead → open; + end missing → unknown', () => {
    expect(st({ reservationStart: '2026-11-23T11:59', reservationEnd: '2026-11-24' })).toBe('open')
    expect(st({ reservationStart: '2026-11-23T12:00', reservationEnd: '2026-11-24' })).toBe('open') // 시작 분 포함
    expect(st({ reservationStart: '2026-11-23T12:01', reservationEnd: '2026-11-24' })).toBe('before_open')
    expect(st({ reservationStart: '2026-11-01', reservationEnd: null })).toBe('unknown')
  })

  it('datetime end passed → closed even when start is date-only', () => {
    expect(st({ reservationStart: '2026-11-01', reservationEnd: '2026-11-23T11:59' })).toBe('closed')
    // 시작일 당일(시각 미정)이라도 종료 시각이 지났으면 마감
    expect(st({ reservationStart: '2026-11-23', reservationEnd: '2026-11-23T11:00' })).toBe('closed')
  })

  it('same-day date-only window: before → unknown on the day → closed after', () => {
    const p = { reservationStart: '2026-12-05', reservationEnd: '2026-12-05' }
    expect(st(p, new Date('2026-12-04T14:59:00Z'))).toBe('before_open') // 12/4 23:59 Tokyo
    expect(st(p, new Date('2026-12-04T15:00:00Z'))).toBe('unknown') // 12/5 00:00 Tokyo
    expect(st(p, new Date('2026-12-05T14:59:00Z'))).toBe('unknown') // 12/5 23:59 Tokyo
    expect(st(p, new Date('2026-12-05T15:00:00Z'))).toBe('closed') // 12/6 00:00 Tokyo
  })

  it('boundary days flip at local midnight (Tokyo)', () => {
    const p = { reservationStart: '2026-12-01', reservationEnd: '2026-12-20' }
    expect(st(p, new Date('2026-11-30T14:59:00Z'))).toBe('before_open') // 11/30 23:59
    expect(st(p, new Date('2026-11-30T15:00:00Z'))).toBe('unknown') // 12/1 00:00 (시작일 당일)
    expect(st(p, new Date('2026-12-01T14:59:00Z'))).toBe('unknown') // 12/1 23:59
    expect(st(p, new Date('2026-12-01T15:00:00Z'))).toBe('open') // 12/2 00:00
    expect(st(p, new Date('2026-12-19T14:59:00Z'))).toBe('open') // 12/19 23:59
    expect(st(p, new Date('2026-12-19T15:00:00Z'))).toBe('unknown') // 12/20 00:00 (종료일 당일)
    expect(st(p, new Date('2026-12-20T14:59:00Z'))).toBe('unknown') // 12/20 23:59
    expect(st(p, new Date('2026-12-20T15:00:00Z'))).toBe('closed') // 12/21 00:00
  })

  it('never reports open at any minute of a date-only start day or end day', () => {
    const p = { reservationStart: '2026-12-01', reservationEnd: '2026-12-20' }
    // 12/1 00:00 ~ 23:30 Tokyo, 12/20 00:00 ~ 23:30 Tokyo (30분 간격)
    for (const dayStartUtc of ['2026-11-30T15:00:00Z', '2026-12-19T15:00:00Z']) {
      for (let m = 0; m < 24 * 60; m += 30) {
        const at = new Date(Date.parse(dayStartUtc) + m * 60_000)
        expect(st(p, at), at.toISOString()).toBe('unknown')
      }
    }
  })

  it('evaluates the date-only day in the event time zone', () => {
    const p = { reservationStart: '2026-12-01', reservationEnd: '2026-12-20T23:59' }
    // 2026-11-30T16:00Z = Tokyo 12/1 01:00 (당일) / Los Angeles 11/30 08:00 (전날)
    const a = new Date('2026-11-30T16:00:00Z')
    expect(st({ ...p, timezone: 'Asia/Tokyo' }, a)).toBe('unknown')
    expect(st({ ...p, timezone: 'Asia/Seoul' }, a)).toBe('unknown')
    expect(st({ ...p, timezone: 'America/Los_Angeles' }, a)).toBe('before_open')
    // 2026-12-01T16:00Z = Tokyo 12/2 01:00 (다음 날) / Los Angeles 12/1 08:00 (당일)
    const b = new Date('2026-12-01T16:00:00Z')
    expect(st({ ...p, timezone: 'Asia/Tokyo' }, b)).toBe('open')
    expect(st({ ...p, timezone: 'America/Los_Angeles' }, b)).toBe('unknown')
  })

  it('event already ended → closed even with date-only times', () => {
    expect(st({ startDate: '2026-10-01', endDate: '2026-10-25', reservationStart: '2026-09-01', reservationEnd: null })).toBe('closed')
    expect(st({ startDate: '2026-10-01', endDate: '2026-10-25', reservationStart: '2026-09-01', reservationEnd: '2026-11-23' })).toBe(
      'closed',
    )
  })

  it('requirement rules still win over date-only times', () => {
    const times = { reservationStart: '2026-11-01', reservationEnd: '2026-12-20' }
    expect(st({ ...times, reservationRequired: 'not_required' })).toBe('not_required')
    expect(st({ ...times, reservationRequired: 'unknown' })).toBe('unknown')
    expect(st({ ...times, reservationRequired: 'required' })).toBe('open')
  })

  it('malformed values are treated as unknown, never open', () => {
    expect(st({ reservationStart: 'garbage', reservationEnd: '2026-12-20T23:59' })).toBe('unknown')
    expect(st({ reservationStart: '2026-11-01T10:00', reservationEnd: '2026-12-20 23:59' })).toBe('unknown')
  })
})

describe('getReservationStatus — datetime-only behaviour unchanged (regression)', () => {
  /** 날짜만 지원 이전의 구현 그대로 (비교 기준) */
  function legacy(e: StatusInput, now: Date): string {
    if (e.reservationRequired === 'not_required') return 'not_required'
    if (e.reservationRequired === 'unknown') return 'unknown'
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: e.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now)
    const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
    const nowLocal = `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`
    const today = nowLocal.slice(0, 10)
    if (e.reservationEnd && nowLocal > e.reservationEnd) return 'closed'
    if (e.endDate && today > e.endDate) return 'closed'
    if (e.reservationStart && nowLocal < e.reservationStart) return 'before_open'
    if (e.reservationStart && e.reservationEnd && e.reservationStart <= nowLocal && nowLocal <= e.reservationEnd) return 'open'
    return 'unknown'
  }

  const moments = [null, '2026-11-01T10:00', '2026-11-23T11:59', '2026-11-23T12:00', '2026-11-23T12:01', '2026-12-01T18:00']
  const instants = [
    '2026-11-23T02:59:00Z',
    '2026-11-23T03:00:00Z',
    '2026-11-23T03:00:30Z',
    '2026-11-23T03:01:00Z',
    '2026-11-30T15:00:00Z',
    '2026-12-01T09:00:00Z',
    '2026-12-01T09:01:00Z',
  ]

  it('matches the previous implementation for every datetime/null combination', () => {
    let checked = 0
    for (const timezone of ['Asia/Tokyo', 'Asia/Seoul', 'America/Los_Angeles']) {
      for (const endDate of ['2027-01-31', '2026-11-22', null]) {
        for (const reservationStart of moments) {
          for (const reservationEnd of moments) {
            for (const iso of instants) {
              const e = ev({ timezone, endDate, startDate: endDate ? '2026-11-01' : null, reservationStart, reservationEnd })
              const at = new Date(iso)
              expect(getReservationStatus(e, at), JSON.stringify({ ...e, iso })).toBe(legacy(e, at))
              checked++
            }
          }
        }
      }
    }
    expect(checked).toBe(3 * 3 * 6 * 6 * 7)
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

describe('permanent shop', () => {
  it('a dateless shop is permanent; a dateless non-shop stays unknown', () => {
    expect(getEventStatus({ ...ev({ startDate: null, endDate: null }), type: 'shop' }, NOW)).toBe('permanent')
    expect(getEventStatus({ ...ev({ startDate: null, endDate: null }), type: 'popup' }, NOW)).toBe('unknown')
    // a shop with known dates follows the normal rules
    expect(getEventStatus({ ...ev({ startDate: '2026-12-01', endDate: '2026-12-31' }), type: 'shop' }, NOW)).toBe('upcoming')
  })
})
