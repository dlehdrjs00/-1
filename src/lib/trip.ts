import type { DateOnly, EventItem, ItineraryItem, Trip } from '../types'
import { eachDate } from './date'

/** 해당 날짜가 행사 기간 안인지. 기간 정보가 부족하면 'unknown' */
export function isDateInEventPeriod(e: Pick<EventItem, 'startDate' | 'endDate'>, date: DateOnly): boolean | 'unknown' {
  if (e.startDate && date < e.startDate) return false
  if (e.endDate && date > e.endDate) return false
  if (!e.startDate || !e.endDate) return 'unknown'
  return true
}

export function tripDates(trip: Pick<Trip, 'startDate' | 'endDate'>): DateOnly[] {
  return eachDate(trip.startDate, trip.endDate)
}

/** 날짜별 일정 (배열 순서 유지) */
export function itemsByDate(trip: Trip, date: DateOnly): ItineraryItem[] {
  return trip.items.filter((i) => i.date === date)
}

/** 여행 기간 밖으로 밀려난 일정 (여행 날짜를 수정했을 때 발생) */
export function itemsOutsideTrip(trip: Trip): ItineraryItem[] {
  return trip.items.filter((i) => i.date < trip.startDate || i.date > trip.endDate)
}

/** 같은 날짜에 같은 행사가 이미 있는지 */
export function hasDuplicateEvent(trip: Trip, date: DateOnly, eventId: string, exceptItemId?: string): boolean {
  return trip.items.some((i) => i.kind === 'event' && i.eventId === eventId && i.date === date && i.id !== exceptItemId)
}

export interface AddWarning {
  kind: 'out_of_period' | 'period_unknown' | 'duplicate' | 'outside_trip'
  message: string
}

/** 일정에 행사를 추가/이동할 때 안내할 경고 목록 */
export function getAddWarnings(
  trip: Trip,
  date: DateOnly,
  event: EventItem | undefined,
  exceptItemId?: string,
): AddWarning[] {
  const out: AddWarning[] = []
  if (date < trip.startDate || date > trip.endDate) {
    out.push({ kind: 'outside_trip', message: '선택한 날짜가 여행 기간 밖입니다.' })
  }
  if (!event) return out
  const inPeriod = isDateInEventPeriod(event, date)
  if (inPeriod === false) {
    out.push({ kind: 'out_of_period', message: '선택한 날짜는 행사 기간 밖입니다. 방문 전 기간을 확인하세요.' })
  } else if (inPeriod === 'unknown') {
    out.push({ kind: 'period_unknown', message: '행사 기간이 확인되지 않았습니다. 방문 전 공식 공지를 확인하세요.' })
  }
  if (hasDuplicateEvent(trip, date, event.id, exceptItemId)) {
    out.push({ kind: 'duplicate', message: '이 날짜 일정에 같은 행사가 이미 있습니다.' })
  }
  return out
}

/** 여행 날짜 중 행사 기간과 겹치는 날짜 */
export function tripDatesWithinEvent(trip: Trip, e: EventItem): DateOnly[] {
  return tripDates(trip).filter((d) => isDateInEventPeriod(e, d) !== false)
}
