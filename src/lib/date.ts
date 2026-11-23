import type { DateOnly, LocalDateTime } from '../types'
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

/** '2027. 1. 9. (토)' */
export function formatDate(d: DateOnly | null | undefined, opts: { weekday?: boolean } = { weekday: true }): string {
  if (!d || !isValidDate(d)) return '확인 필요'
  const [y, m, day] = d.split('-').map(Number)
  return `${y}. ${m}. ${day}.${opts.weekday === false ? '' : ` (${weekday(d)})`}`
}

/** '1/9 (토)' 짧은 형식 */
export function formatDateShort(d: DateOnly | null | undefined): string {
  if (!d || !isValidDate(d)) return '확인 필요'
  const [, m, day] = d.split('-').map(Number)
  return `${m}/${day} (${weekday(d)})`
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
  return `${formatDate(v.slice(0, 10))} ${v.slice(11)} (${timezoneLabel(tz)})`
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
