import type { DateOnly, LocalDateTime, ReservationMoment, TimeOnly } from '../types'
import { TIMEZONE_SHORT } from '../constants'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const LOCAL_DT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export function isValidDate(v: unknown): v is DateOnly {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false
  const [y, m, d] = v.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

export function isValidLocalDateTime(v: unknown): v is LocalDateTime {
  if (typeof v !== 'string' || !LOCAL_DT_RE.test(v)) return false
  return isValidDate(v.slice(0, 10)) && isValidTime(v.slice(11))
}

export function isValidTime(v: unknown): v is string {
  return typeof v === 'string' && TIME_RE.test(v)
}

/* ---------------- 예약 시작·종료 시점 (날짜만 또는 날짜+시각) ---------------- */

/** 'YYYY-MM-DD'(시각 미정) 또는 'YYYY-MM-DDTHH:mm' 인지 */
export function isValidReservationMoment(v: unknown): v is ReservationMoment {
  return isValidDate(v) || isValidLocalDateTime(v)
}

/** 시각까지 확인된 값인지 ('YYYY-MM-DDTHH:mm'). 날짜만 있으면 false */
export function hasTime(m: ReservationMoment): m is LocalDateTime {
  return isValidLocalDateTime(m)
}

/** 날짜 부분 'YYYY-MM-DD' */
export function momentDate(m: ReservationMoment): DateOnly {
  return m.slice(0, 10)
}

/** 시각 부분 'HH:mm'. 날짜만 있으면 null (시각 미정) */
export function momentTime(m: ReservationMoment): TimeOnly | null {
  return hasTime(m) ? m.slice(11, 16) : null
}

/** 폼 입력용으로 날짜·시각을 나눈다. 모르는 쪽은 '' */
export function splitReservationMoment(m: ReservationMoment | null | undefined): { date: string; time: string } {
  if (!m || !isValidReservationMoment(m)) return { date: '', time: '' }
  return { date: momentDate(m), time: momentTime(m) ?? '' }
}

/**
 * 날짜·시각 → 저장값. 시각이 비면 날짜만 저장한다 (00:00 / 23:59 로 채우지 않는다).
 * 날짜가 비면 null. 형식 검증은 호출 측에서 한다.
 */
export function joinReservationMoment(date: string, time: string): ReservationMoment | null {
  const d = date.trim()
  const t = time.trim()
  if (!d) return null
  return t ? `${d}T${t}` : d
}

/**
 * 예약 시작이 종료보다 늦지 않은지.
 * - 둘 다 시각이 있으면 시작 < 종료 (같은 분은 허용하지 않음)
 * - 한쪽이라도 날짜만 있으면 날짜끼리 비교: 시작일 <= 종료일 (같은 날은 허용)
 */
export function isReservationRangeValid(start: ReservationMoment, end: ReservationMoment): boolean {
  if (hasTime(start) && hasTime(end)) return start < end
  return momentDate(start) <= momentDate(end)
}

export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** 지정 시간대의 현재 벽시계 시각 'YYYY-MM-DDTHH:mm' */
export function nowInTimezone(tz: string, now: Date = new Date()): LocalDateTime {
  const safeTz = isValidTimezone(tz) ? tz : 'Asia/Seoul'
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

/** 지정 시간대의 오늘 날짜 */
export function todayInTimezone(tz: string, now: Date = new Date()): DateOnly {
  return nowInTimezone(tz, now).slice(0, 10)
}

/** 브라우저(사용자) 기준 오늘 */
export function todayLocal(now: Date = new Date()): DateOnly {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function parseDate(d: DateOnly): Date {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day))
}

export function weekday(d: DateOnly): string {
  return WEEKDAYS[parseDate(d).getUTCDay()]
}

/** 줄바꿈되지 않는 공백 — 날짜 한 덩어리('2027. 1. 9. (토)')가 중간에서 끊기지 않도록 */
const NBSP = '\u00A0'

/** '2027. 1. 9. (토)' (내부 공백은 줄바꿈 없는 공백) */
export function formatDate(d: DateOnly | null | undefined, opts: { weekday?: boolean } = { weekday: true }): string {
  if (!d || !isValidDate(d)) return '확인 필요'
  const [y, m, day] = d.split('-').map(Number)
  return `${y}.${NBSP}${m}.${NBSP}${day}.${opts.weekday === false ? '' : `${NBSP}(${weekday(d)})`}`
}

/** '1/9 (토)' 짧은 형식 */
export function formatDateShort(d: DateOnly | null | undefined): string {
  if (!d || !isValidDate(d)) return '확인 필요'
  const [, m, day] = d.split('-').map(Number)
  return `${m}/${day}${NBSP}(${weekday(d)})`
}

/** 기간 표시. 한쪽이 없으면 해당 쪽을 '확인 필요'로 */
export function formatDateRange(start: DateOnly | null, end: DateOnly | null): string {
  if (!start && !end) return '기간 확인 필요'
  if (start && end && start === end) return formatDate(start)
  return `${start ? formatDate(start) : '시작일 확인 필요'} ~ ${end ? formatDate(end) : '종료일 확인 필요'}`
}

export function timezoneLabel(tz: string): string {
  return TIMEZONE_SHORT[tz] ?? tz
}

/** '2026. 12. 1. (화) 18:00 (일본 시간)' */
export function formatLocalDateTime(v: LocalDateTime | null | undefined, tz: string): string {
  if (!v || !isValidLocalDateTime(v)) return '확인 필요'
  return `${formatDate(v.slice(0, 10))}${NBSP}${v.slice(11)} (${timezoneLabel(tz)})`
}

/** 날짜만 있는 예약 시점에 붙이는 표시 */
export const TIME_UNKNOWN_LABEL = '시각 미정'

/**
 * 예약 시작·종료 표시 (문자열).
 * - 시각 있음: '2026. 12. 1. (화) 18:00 (일본 시간)' (formatLocalDateTime 과 같음)
 * - 날짜만:   '2026. 12. 1. (화) · 시각 미정'
 * - 없음/잘못된 값: '확인 필요'
 */
export function formatReservationMoment(v: ReservationMoment | null | undefined, tz: string): string {
  if (!v || !isValidReservationMoment(v)) return '확인 필요'
  if (hasTime(v)) return formatLocalDateTime(v, tz)
  return `${formatDate(v)} · ${TIME_UNKNOWN_LABEL}`
}

/** start~end 사이의 모든 날짜 (양 끝 포함). 최대 366일 */
export function eachDate(start: DateOnly, end: DateOnly): DateOnly[] {
  if (!isValidDate(start) || !isValidDate(end) || start > end) return []
  const out: DateOnly[] = []
  const cur = parseDate(start)
  const last = parseDate(end)
  while (cur <= last && out.length < 366) {
    out.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out
}

export function daysBetween(start: DateOnly, end: DateOnly): number {
  return Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / 86400000)
}

/** 두 기간이 겹치는지. 모르는 끝은 열린 구간으로 간주 */
export function rangesOverlap(
  aStart: DateOnly | null,
  aEnd: DateOnly | null,
  bStart: DateOnly | null,
  bEnd: DateOnly | null,
): boolean {
  const s1 = aStart ?? '0000-01-01'
  const e1 = aEnd ?? '9999-12-31'
  const s2 = bStart ?? '0000-01-01'
  const e2 = bEnd ?? '9999-12-31'
  return s1 <= e2 && s2 <= e1
}
