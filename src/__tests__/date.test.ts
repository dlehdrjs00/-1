import { describe, expect, it } from 'vitest'
import {
  daysBetween,
  eachDate,
  formatDate,
  formatDateRange,
  formatDateShort,
  formatLocalDateTime,
  isValidDate,
  isValidLocalDateTime,
  isValidTime,
  isValidTimezone,
  nowInTimezone,
  rangesOverlap,
  todayInTimezone,
  weekday,
} from '../lib/date'

describe('isValidDate', () => {
  it('accepts normal dates', () => {
    expect(isValidDate('2027-01-09')).toBe(true)
    expect(isValidDate('2026-12-31')).toBe(true)
    expect(isValidDate('2026-01-01')).toBe(true)
  })

  it('handles leap years', () => {
    expect(isValidDate('2024-02-29')).toBe(true) // divisible by 4
    expect(isValidDate('2000-02-29')).toBe(true) // divisible by 400
    expect(isValidDate('2026-02-29')).toBe(false)
    expect(isValidDate('2100-02-29')).toBe(false) // divisible by 100, not 400
    expect(isValidDate('2026-02-28')).toBe(true)
  })

  it('rejects invalid month/day', () => {
    expect(isValidDate('2026-13-01')).toBe(false)
    expect(isValidDate('2026-00-10')).toBe(false)
    expect(isValidDate('2026-04-31')).toBe(false)
    expect(isValidDate('2026-01-32')).toBe(false)
    expect(isValidDate('2026-01-00')).toBe(false)
  })

  it('rejects wrong formats and non-strings', () => {
    expect(isValidDate('2026-1-09')).toBe(false)
    expect(isValidDate('2026/01/09')).toBe(false)
    expect(isValidDate('20260109')).toBe(false)
    expect(isValidDate('2026-01-09T00:00')).toBe(false)
    expect(isValidDate(' 2026-01-09')).toBe(false)
    expect(isValidDate('')).toBe(false)
    expect(isValidDate(null)).toBe(false)
    expect(isValidDate(undefined)).toBe(false)
    expect(isValidDate(20260109)).toBe(false)
    expect(isValidDate(new Date())).toBe(false)
  })
})

describe('isValidLocalDateTime', () => {
  it('accepts YYYY-MM-DDTHH:mm', () => {
    expect(isValidLocalDateTime('2026-12-01T18:00')).toBe(true)
    expect(isValidLocalDateTime('2027-01-08T23:59')).toBe(true)
    expect(isValidLocalDateTime('2024-02-29T00:00')).toBe(true)
  })

  it('rejects bad dates, times and formats', () => {
    expect(isValidLocalDateTime('2026-02-29T10:00')).toBe(false)
    expect(isValidLocalDateTime('2026-12-01T24:00')).toBe(false)
    expect(isValidLocalDateTime('2026-12-01T12:60')).toBe(false)
    expect(isValidLocalDateTime('2026-12-01 18:00')).toBe(false)
    expect(isValidLocalDateTime('2026-12-01T18:00:00')).toBe(false)
    expect(isValidLocalDateTime('2026-12-01T18:00Z')).toBe(false)
    expect(isValidLocalDateTime('2026-12-01')).toBe(false)
    expect(isValidLocalDateTime(null)).toBe(false)
    expect(isValidLocalDateTime(123)).toBe(false)
  })
})

describe('isValidTime', () => {
  it('accepts 00:00 ~ 23:59', () => {
    expect(isValidTime('00:00')).toBe(true)
    expect(isValidTime('09:05')).toBe(true)
    expect(isValidTime('23:59')).toBe(true)
  })

  it('rejects out of range and bad formats', () => {
    expect(isValidTime('24:00')).toBe(false)
    expect(isValidTime('12:60')).toBe(false)
    expect(isValidTime('9:05')).toBe(false)
    expect(isValidTime('09:5')).toBe(false)
    expect(isValidTime('09:05:00')).toBe(false)
    expect(isValidTime('')).toBe(false)
    expect(isValidTime(null)).toBe(false)
    expect(isValidTime(905)).toBe(false)
  })
})

describe('isValidTimezone', () => {
  it('accepts IANA zones and rejects garbage', () => {
    expect(isValidTimezone('Asia/Tokyo')).toBe(true)
    expect(isValidTimezone('Asia/Seoul')).toBe(true)
    expect(isValidTimezone('America/Los_Angeles')).toBe(true)
    expect(isValidTimezone('Mars/Olympus_Mons')).toBe(false)
    expect(isValidTimezone('')).toBe(false)
    expect(isValidTimezone(null)).toBe(false)
    expect(isValidTimezone(9)).toBe(false)
  })
})

describe('nowInTimezone / todayInTimezone (fixed clock)', () => {
  const fixed = new Date('2026-12-31T15:30:00Z')

  it('converts a UTC instant to local wall time per zone', () => {
    expect(nowInTimezone('Asia/Tokyo', fixed)).toBe('2027-01-01T00:30')
    expect(nowInTimezone('Asia/Seoul', fixed)).toBe('2027-01-01T00:30')
    expect(nowInTimezone('America/Los_Angeles', fixed)).toBe('2026-12-31T07:30')
  })

  it('gives the local date per zone', () => {
    expect(todayInTimezone('Asia/Tokyo', fixed)).toBe('2027-01-01')
    expect(todayInTimezone('Asia/Seoul', fixed)).toBe('2027-01-01')
    expect(todayInTimezone('America/Los_Angeles', fixed)).toBe('2026-12-31')
  })

  it('formats local midnight as 00, not 24', () => {
    expect(nowInTimezone('Asia/Tokyo', new Date('2026-12-31T15:00:00Z'))).toBe('2027-01-01T00:00')
  })

  it('falls back to Asia/Seoul for an invalid zone', () => {
    expect(nowInTimezone('Not/AZone', fixed)).toBe('2027-01-01T00:30')
  })

  it('is independent of the host time zone', () => {
    // vitest.config.ts runs tests with TZ=America/Los_Angeles; the result must still be Tokyo wall time
    expect(nowInTimezone('Asia/Tokyo', new Date('2026-11-23T00:00:00Z'))).toBe('2026-11-23T09:00')
  })
})

/** 날짜 문자열의 줄바꿈 없는 공백(U+00A0)을 일반 공백으로 바꿔 비교 */
const sp = (v: string) => v.replace(/\u00A0/g, ' ')

describe('formatDate / formatDateShort / formatDateRange / formatLocalDateTime', () => {
  it('formats with weekday by default', () => {
    expect(sp(formatDate('2027-01-09'))).toBe('2027. 1. 9. (토)')
    expect(sp(formatDate('2026-12-01'))).toBe('2026. 12. 1. (화)')
    expect(sp(formatDate('2027-01-09', { weekday: false }))).toBe('2027. 1. 9.')
    expect(weekday('2026-11-23')).toBe('월')
  })

  it("shows '확인 필요' for null/undefined/invalid", () => {
    expect(sp(formatDate(null))).toBe('확인 필요')
    expect(sp(formatDate(undefined))).toBe('확인 필요')
    expect(sp(formatDate(''))).toBe('확인 필요')
    expect(sp(formatDate('2026-02-30'))).toBe('확인 필요')
    expect(sp(formatDateShort(null))).toBe('확인 필요')
  })

  it('formats short dates', () => {
    expect(sp(formatDateShort('2027-01-12'))).toBe('1/12 (화)')
  })

  it('formats ranges incl. unknown ends', () => {
    expect(sp(formatDateRange('2027-01-09', '2027-01-13'))).toBe('2027. 1. 9. (토) ~ 2027. 1. 13. (수)')
    expect(sp(formatDateRange('2027-01-12', '2027-01-12'))).toBe('2027. 1. 12. (화)')
    expect(sp(formatDateRange(null, null))).toBe('기간 확인 필요')
    expect(sp(formatDateRange('2027-01-09', null))).toBe('2027. 1. 9. (토) ~ 종료일 확인 필요')
    expect(sp(formatDateRange(null, '2027-01-13'))).toBe('시작일 확인 필요 ~ 2027. 1. 13. (수)')
  })

  it('formats local date-times with the zone label', () => {
    expect(sp(formatLocalDateTime('2026-12-01T18:00', 'Asia/Tokyo'))).toBe('2026. 12. 1. (화) 18:00 (일본 시간)')
    expect(sp(formatLocalDateTime('2026-12-01T18:00', 'Asia/Seoul'))).toBe('2026. 12. 1. (화) 18:00 (한국 시간)')
    expect(sp(formatLocalDateTime('2026-12-01T18:00', 'Etc/UTC'))).toBe('2026. 12. 1. (화) 18:00 (Etc/UTC)')
    expect(sp(formatLocalDateTime(null, 'Asia/Tokyo'))).toBe('확인 필요')
    expect(sp(formatLocalDateTime('2026-12-01', 'Asia/Tokyo'))).toBe('확인 필요')
  })
})

describe('eachDate / daysBetween', () => {
  it('lists every date inclusive, crossing month/year', () => {
    expect(eachDate('2027-01-09', '2027-01-13')).toEqual([
      '2027-01-09',
      '2027-01-10',
      '2027-01-11',
      '2027-01-12',
      '2027-01-13',
    ])
    expect(eachDate('2026-12-30', '2027-01-02')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'])
    expect(eachDate('2024-02-28', '2024-03-01')).toEqual(['2024-02-28', '2024-02-29', '2024-03-01'])
  })

  it('returns a single day when start === end', () => {
    expect(eachDate('2027-01-12', '2027-01-12')).toEqual(['2027-01-12'])
  })

  it('returns [] for reversed or invalid input', () => {
    expect(eachDate('2027-01-13', '2027-01-09')).toEqual([])
    expect(eachDate('2027-02-30', '2027-03-02')).toEqual([])
    expect(eachDate('', '2027-01-09')).toEqual([])
  })

  it('caps at 366 days', () => {
    expect(eachDate('2026-01-01', '2030-12-31')).toHaveLength(366)
  })

  it('counts days between', () => {
    expect(daysBetween('2027-01-09', '2027-01-13')).toBe(4)
    expect(daysBetween('2026-11-23', '2027-01-09')).toBe(47)
    expect(daysBetween('2027-01-13', '2027-01-09')).toBe(-4)
  })
})

describe('rangesOverlap', () => {
  it('detects overlap and adjacency (inclusive)', () => {
    expect(rangesOverlap('2027-01-09', '2027-01-13', '2027-01-10', '2027-01-11')).toBe(true)
    expect(rangesOverlap('2027-01-09', '2027-01-13', '2027-01-13', '2027-01-20')).toBe(true)
    expect(rangesOverlap('2027-01-09', '2027-01-13', '2026-12-01', '2027-01-09')).toBe(true)
  })

  it('detects non-overlap', () => {
    expect(rangesOverlap('2027-01-09', '2027-01-13', '2027-01-14', '2027-01-20')).toBe(false)
    expect(rangesOverlap('2027-01-09', '2027-01-13', '2026-10-01', '2026-10-31')).toBe(false)
  })

  it('treats null ends as open-ended', () => {
    expect(rangesOverlap('2027-01-09', '2027-01-13', null, null)).toBe(true)
    expect(rangesOverlap('2027-01-09', '2027-01-13', '2027-01-12', null)).toBe(true)
    expect(rangesOverlap('2027-01-09', '2027-01-13', '2027-01-14', null)).toBe(false)
    expect(rangesOverlap('2027-01-09', '2027-01-13', null, '2027-01-08')).toBe(false)
    expect(rangesOverlap('2027-01-09', '2027-01-13', null, '2027-01-09')).toBe(true)
    expect(rangesOverlap(null, null, null, null)).toBe(true)
  })
})
