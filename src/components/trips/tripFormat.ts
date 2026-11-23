import type { DateOnly, EventItem, ItineraryItem, Trip } from '../../types'
import { TIMEZONES } from '../../constants'
import { daysBetween, formatDateRange, isValidDate } from '../../lib/date'
import { hasDuplicateEvent, isDateInEventPeriod } from '../../lib/trip'

/** 여행 최대 길이 (일) */
export const MAX_TRIP_DAYS = 60

/** '4박 5일' / '당일치기' */
export function tripLengthLabel(start: DateOnly, end: DateOnly): string {
  if (!isValidDate(start) || !isValidDate(end) || end < start) return '기간 확인 필요'
  const nights = daysBetween(start, end)
  return nights === 0 ? '당일치기' : `${nights}박 ${nights + 1}일`
}

/** '1/10' (요일 없이 짧게) */
export function monthDay(d: DateOnly): string {
  if (!isValidDate(d)) return '확인 필요'
  const [, m, day] = d.split('-').map(Number)
  return `${m}/${day}`
}

/** 시간대 전체 이름. 목록에 없으면 IANA 이름 그대로 */
export function timezoneFullLabel(tz: string): string {
  return TIMEZONES.find((t) => t.id === tz)?.label ?? tz
}

export interface ItemWarning {
  key: string
  tone: 'warning' | 'danger'
  message: string
}

/** 일정 항목에 표시할 경고 (행사 기간 밖 / 기간 확인 필요 / 같은 날 중복 / 행사 정보 없음) */
export function itemWarnings(trip: Trip, item: ItineraryItem, event: EventItem | undefined): ItemWarning[] {
  const out: ItemWarning[] = []
  if (item.kind !== 'event') return out
  if (!event) {
    out.push({ key: 'missing', tone: 'danger', message: '연결된 행사 정보를 찾을 수 없어요. 삭제 후 다시 추가해 주세요.' })
    return out
  }
  const inPeriod = isDateInEventPeriod(event, item.date)
  if (inPeriod === false) {
    out.push({
      key: 'out',
      tone: 'danger',
      message: `행사 기간 밖입니다 (기간: ${formatDateRange(event.startDate, event.endDate)})`,
    })
  } else if (inPeriod === 'unknown') {
    out.push({ key: 'unknown', tone: 'warning', message: '행사 기간 확인 필요' })
  }
  if (hasDuplicateEvent(trip, item.date, event.id, item.id)) {
    out.push({ key: 'dup', tone: 'warning', message: '같은 날 중복' })
  }
  return out
}

/** 검색용 문자열 정규화 */
export function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '')
}
