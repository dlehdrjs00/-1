import { describe, expect, it } from 'vitest'
import type { EventItem } from '../types'
import {
  EVENT_FORM_FIELD_LABEL,
  EVENT_FORM_FIELD_ORDER,
  emptyEventForm,
  eventToForm,
  formToEventInput,
  normalizeTime,
  orderedErrors,
  validateEventForm,
  type EventFormValues,
} from '../lib/eventForm'

const T = '2026-11-23T00:00:00.000Z'

function makeEvent(p: Partial<EventItem> = {}): EventItem {
  return {
    id: 'evt_1',
    isSample: false,
    title: '테스트 행사',
    works: ['starrail'],
    type: 'cafe',
    country: '일본',
    city: '도쿄',
    venue: '테스트 장소',
    address: '테스트 주소',
    startDate: '2026-12-20',
    endDate: '2027-01-31',
    timezone: 'Asia/Tokyo',
    reservationRequired: 'required',
    reservationStart: '2026-12-01T18:00',
    reservationEnd: '2027-01-30T23:59',
    officialUrl: '',
    reservationUrl: '',
    lastCheckedDate: '2026-11-20',
    memo: '',
    createdAt: T,
    updatedAt: T,
    ...p,
  }
}

/** 필수 항목만 채운 '예약 필수' 폼 + 예약 칸 */
function form(p: Partial<EventFormValues> = {}): EventFormValues {
  return { ...emptyEventForm(), title: '행사', works: ['genshin'], reservationRequired: 'required', ...p }
}

describe('EventFormValues shape', () => {
  it('field order / labels cover exactly the form fields', () => {
    const keys = Object.keys(emptyEventForm()).sort()
    expect([...EVENT_FORM_FIELD_ORDER].sort()).toEqual(keys)
    expect(new Set(EVENT_FORM_FIELD_ORDER).size).toBe(EVENT_FORM_FIELD_ORDER.length)
    expect(Object.keys(EVENT_FORM_FIELD_LABEL).sort()).toEqual(keys)
  })

  it('reservation start/end are split into date + time fields, in screen order', () => {
    const i = (f: (typeof EVENT_FORM_FIELD_ORDER)[number]) => EVENT_FORM_FIELD_ORDER.indexOf(f)
    expect(i('reservationRequired')).toBeLessThan(i('reservationStartDate'))
    expect(i('reservationStartDate')).toBeLessThan(i('reservationStartTime'))
    expect(i('reservationStartTime')).toBeLessThan(i('reservationEndDate'))
    expect(i('reservationEndDate')).toBeLessThan(i('reservationEndTime'))
    expect(i('reservationEndTime')).toBeLessThan(i('reservationUrl'))
    expect(EVENT_FORM_FIELD_LABEL.reservationStartDate).toBe('예약 시작 날짜')
    expect(EVENT_FORM_FIELD_LABEL.reservationEndTime).toBe('예약 종료 시각')
  })
})

describe('eventToForm (저장값 → 폼)', () => {
  it('splits a legacy datetime value into date + time', () => {
    const f = eventToForm(makeEvent({ reservationStart: '2026-12-01T18:00', reservationEnd: '2027-01-30T23:59' }))
    expect([f.reservationStartDate, f.reservationStartTime]).toEqual(['2026-12-01', '18:00'])
    expect([f.reservationEndDate, f.reservationEndTime]).toEqual(['2027-01-30', '23:59'])
  })

  it('date-only value → date filled, time left empty', () => {
    const f = eventToForm(makeEvent({ reservationStart: '2026-12-10', reservationEnd: null }))
    expect([f.reservationStartDate, f.reservationStartTime]).toEqual(['2026-12-10', ''])
    expect([f.reservationEndDate, f.reservationEndTime]).toEqual(['', ''])
  })
})

describe('formToEventInput (폼 → 저장값)', () => {
  it('joins date + time into YYYY-MM-DDTHH:mm', () => {
    const input = formToEventInput(
      form({ reservationStartDate: '2026-12-01', reservationStartTime: '18:00', reservationEndDate: '2026-12-20', reservationEndTime: '23:59' }),
      false,
    )
    expect([input.reservationStart, input.reservationEnd]).toEqual(['2026-12-01T18:00', '2026-12-20T23:59'])
  })

  it('empty time → stores the date only (never fills in 00:00 / 23:59)', () => {
    const input = formToEventInput(form({ reservationStartDate: '2026-12-01', reservationEndDate: '2026-12-20' }), false)
    expect([input.reservationStart, input.reservationEnd]).toEqual(['2026-12-01', '2026-12-20'])
  })

  it('empty date → null; seconds from a time input are dropped', () => {
    const input = formToEventInput(form({ reservationStartDate: '2026-12-01', reservationStartTime: '18:00:00' }), false)
    expect([input.reservationStart, input.reservationEnd]).toEqual(['2026-12-01T18:00', null])
  })

  it('reservation not required → times are not stored', () => {
    const f = form({ reservationRequired: 'not_required', reservationStartDate: '2026-12-01', reservationStartTime: '18:00' })
    expect(formToEventInput(f, false)).toMatchObject({ reservationStart: null, reservationEnd: null })
    const u = form({ reservationRequired: 'unknown', reservationEndDate: '2026-12-20' })
    expect(formToEventInput(u, false)).toMatchObject({ reservationStart: null, reservationEnd: null })
  })

  it('edit round-trip keeps legacy datetime, date-only and null values unchanged', () => {
    const cases: [string | null, string | null][] = [
      ['2026-12-01T18:00', '2027-01-30T23:59'],
      ['2026-12-10', '2026-12-20T23:59'],
      ['2026-12-10T12:00', '2026-12-20'],
      ['2026-12-10', null],
      [null, null],
    ]
    for (const [reservationStart, reservationEnd] of cases) {
      const e = makeEvent({ reservationStart, reservationEnd })
      const f = eventToForm(e)
      expect(validateEventForm(f), `${reservationStart} ~ ${reservationEnd}`).toEqual({})
      const out = formToEventInput(f, e.isSample)
      expect([out.reservationStart, out.reservationEnd]).toEqual([reservationStart, reservationEnd])
    }
  })
})

describe('validateEventForm — reservation date/time', () => {
  it('accepts date-only, datetime and mixed values', () => {
    expect(validateEventForm(form({ reservationStartDate: '2026-12-01' }))).toEqual({})
    expect(validateEventForm(form({ reservationStartDate: '2026-12-01', reservationEndDate: '2026-12-20' }))).toEqual({})
    expect(
      validateEventForm(form({ reservationStartDate: '2026-12-01', reservationEndDate: '2026-12-20', reservationEndTime: '23:59' })),
    ).toEqual({})
    expect(validateEventForm(form())).toEqual({}) // 모두 비움 → 확인 필요
  })

  it("time without date → '날짜를 먼저 입력하세요.' on the date field", () => {
    const errs = validateEventForm(form({ reservationStartTime: '18:00', reservationEndTime: '20:00' }))
    expect(errs.reservationStartDate).toBe('날짜를 먼저 입력하세요.')
    expect(errs.reservationEndDate).toBe('날짜를 먼저 입력하세요.')
    expect(errs.reservationStartTime).toBeUndefined()
    // 오류 요약 첫 항목은 예약 시작 날짜 (포커스 이동 대상)
    expect(orderedErrors(errs).map((x) => x.field)).toEqual(['reservationStartDate', 'reservationEndDate'])
  })

  it('rejects malformed date / time', () => {
    const errs = validateEventForm(form({ reservationStartDate: '2026-02-30', reservationEndDate: '2026-12-20', reservationEndTime: '25:00' }))
    expect(errs.reservationStartDate).toMatch(/날짜 형식/)
    expect(errs.reservationEndTime).toMatch(/시각 형식/)
  })

  it('end date before start date → error on the end date', () => {
    const errs = validateEventForm(form({ reservationStartDate: '2026-12-10', reservationEndDate: '2026-12-01', reservationEndTime: '23:59' }))
    expect(errs).toEqual({ reservationEndDate: '예약 종료일은 예약 시작일과 같거나 그 이후여야 해요.' })
  })

  it('same day with both times: end must be later than start (error on the end time)', () => {
    const base = { reservationStartDate: '2026-12-10', reservationStartTime: '12:00', reservationEndDate: '2026-12-10' }
    expect(validateEventForm(form({ ...base, reservationEndTime: '12:00' }))).toEqual({
      reservationEndTime: '예약 종료 시각은 예약 시작 시각보다 늦어야 해요.',
    })
    expect(validateEventForm(form({ ...base, reservationEndTime: '11:00' })).reservationEndTime).toBeDefined()
    expect(validateEventForm(form({ ...base, reservationEndTime: '12:01' }))).toEqual({})
  })

  it('same day where one side has no time → allowed', () => {
    expect(validateEventForm(form({ reservationStartDate: '2026-12-10', reservationEndDate: '2026-12-10', reservationEndTime: '10:00' }))).toEqual(
      {},
    )
    expect(
      validateEventForm(form({ reservationStartDate: '2026-12-10', reservationStartTime: '23:00', reservationEndDate: '2026-12-10' })),
    ).toEqual({})
    expect(validateEventForm(form({ reservationStartDate: '2026-12-10', reservationEndDate: '2026-12-10' }))).toEqual({})
  })

  it('reservation fields are ignored when reservation is not required', () => {
    expect(validateEventForm(form({ reservationRequired: 'not_required', reservationStartTime: '18:00' }))).toEqual({})
  })
})

describe('normalizeTime', () => {
  it('drops seconds, keeps HH:mm, trims', () => {
    expect(normalizeTime('18:00:00')).toBe('18:00')
    expect(normalizeTime('18:00:00.000')).toBe('18:00')
    expect(normalizeTime(' 18:00 ')).toBe('18:00')
    expect(normalizeTime('')).toBe('')
  })
})
