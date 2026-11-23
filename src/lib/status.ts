import type { EventItem, EventStatus, ReservationStatus } from '../types'
import { nowInTimezone, todayInTimezone } from './date'

/**
 * 행사 진행 상태. 행사 현지 시간대의 오늘 날짜로 판정.
 * 판정할 정보가 부족하면 'unknown'.
 */
export function getEventStatus(e: Pick<EventItem, 'startDate' | 'endDate' | 'timezone'>, now: Date = new Date()): EventStatus {
  const today = todayInTimezone(e.timezone, now)
  if (e.endDate && today > e.endDate) return 'ended'
  if (e.startDate && today < e.startDate) return 'upcoming'
  if (e.startDate && e.endDate && e.startDate <= today && today <= e.endDate) return 'ongoing'
  return 'unknown'
}

/**
 * 예약 상태. 진행 상태와 별개로 계산한다.
 * - '예약 접수 중'은 예약 시작·종료 시각이 모두 확인되고 현재가 그 사이일 때만 표시한다.
 * - 정보가 부족하면 'unknown'(확인 필요). 임의로 '예약 가능'이라 하지 않는다.
 */
export function getReservationStatus(
  e: Pick<EventItem, 'reservationRequired' | 'reservationStart' | 'reservationEnd' | 'timezone' | 'startDate' | 'endDate'>,
  now: Date = new Date(),
): ReservationStatus {
  if (e.reservationRequired === 'not_required') return 'not_required'
  if (e.reservationRequired === 'unknown') return 'unknown'

  const nowLocal = nowInTimezone(e.timezone, now)
  // 종료 시각은 해당 분(分)까지 포함한다 (예: 23:59 마감 → 23:59 동안은 접수 중)
  if (e.reservationEnd && nowLocal > e.reservationEnd) return 'closed'
  if (getEventStatus(e, now) === 'ended') return 'closed'
  if (e.reservationStart && nowLocal < e.reservationStart) return 'before_open'
  if (e.reservationStart && e.reservationEnd && e.reservationStart <= nowLocal && nowLocal <= e.reservationEnd) {
    return 'open'
  }
  return 'unknown'
}

/** 화면 표시용: 값이 비어 있으면 '확인 필요' */
export function orUnknown(v: string | null | undefined): string {
  return v && v.trim() ? v : '확인 필요'
}
