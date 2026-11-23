import type { DateOnly, EventItem, EventStatus, LocalDateTime, ReservationMoment, ReservationStatus } from '../types'
import { hasTime, isValidReservationMoment, momentDate, nowInTimezone, todayInTimezone } from './date'

/**
 * 행사 진행 상태. 행사 현지 시간대의 오늘 날짜로 판정.
 * 판정할 정보가 부족하면 'unknown'.
 */
export function getEventStatus(
  e: Pick<EventItem, 'startDate' | 'endDate' | 'timezone'> & { type?: EventItem['type'] },
  now: Date = new Date(),
): EventStatus {
  if (isPermanentShop(e)) return 'permanent'
  const today = todayInTimezone(e.timezone, now)
  if (e.endDate && today > e.endDate) return 'ended'
  if (e.startDate && today < e.startDate) return 'upcoming'
  if (e.startDate && e.endDate && e.startDate <= today && today <= e.endDate) return 'ongoing'
  return 'unknown'
}

/** 판정 기준 시점: 행사 현지 시간대의 현재 벽시계 시각과 오늘 날짜 */
interface LocalNow {
  nowLocal: LocalDateTime
  today: DateOnly
}

/** 예약 시작이 확실히 지났는지 (시각 있음: now >= 시작, 날짜만: 오늘 > 시작일. 시작일 당일은 모름) */
function startDefinitelyPassed(m: ReservationMoment, t: LocalNow): boolean {
  return hasTime(m) ? t.nowLocal >= m : t.today > momentDate(m)
}

/** 예약 시작이 확실히 아직인지 (시각 있음: now < 시작, 날짜만: 오늘 < 시작일) */
function startDefinitelyAhead(m: ReservationMoment, t: LocalNow): boolean {
  return hasTime(m) ? t.nowLocal < m : t.today < momentDate(m)
}

/**
 * 예약 종료가 확실히 지났는지.
 * 시각 있음: now > 종료 (종료 분(分)까지 포함 — 23:59 마감이면 23:59 동안은 접수 중)
 * 날짜만: 오늘 > 종료일 (종료일 당일은 모름)
 */
function endDefinitelyPassed(m: ReservationMoment, t: LocalNow): boolean {
  return hasTime(m) ? t.nowLocal > m : t.today > momentDate(m)
}

/** 예약 종료가 확실히 남았는지 (시각 있음: now <= 종료, 날짜만: 오늘 < 종료일) */
function endDefinitelyAhead(m: ReservationMoment, t: LocalNow): boolean {
  return hasTime(m) ? t.nowLocal <= m : t.today < momentDate(m)
}

/**
 * 예약 상태. 진행 상태와 별개로 계산한다. 행사 현지 시간대 기준.
 * 예약 시작·종료는 날짜+시각 또는 날짜만(시각 미정) 저장될 수 있다.
 * - '예약 접수 중'은 시작이 확실히 지났고 종료가 확실히 남았을 때만 표시한다.
 *   날짜만 있는 시작일·종료일 당일은 몇 시에 열리고 닫히는지 모르므로 'unknown'.
 * - 정보가 부족하면 'unknown'(확인 필요). 임의로 '예약 가능'이라 하지 않는다.
 */
export function getReservationStatus(
  e: Pick<EventItem, 'reservationRequired' | 'reservationStart' | 'reservationEnd' | 'timezone' | 'startDate' | 'endDate'>,
  now: Date = new Date(),
): ReservationStatus {
  if (e.reservationRequired === 'not_required') return 'not_required'
  if (e.reservationRequired === 'unknown') return 'unknown'

  const nowLocal = nowInTimezone(e.timezone, now)
  const t: LocalNow = { nowLocal, today: nowLocal.slice(0, 10) }
  // 형식이 잘못된 값은 모르는 값으로 본다 (불러오기 검증을 거치므로 보통은 없음)
  const start = isValidReservationMoment(e.reservationStart) ? e.reservationStart : null
  const end = isValidReservationMoment(e.reservationEnd) ? e.reservationEnd : null

  if (end && endDefinitelyPassed(end, t)) return 'closed'
  if (getEventStatus(e, now) === 'ended') return 'closed'
  if (start && startDefinitelyAhead(start, t)) return 'before_open'
  if (start && end && startDefinitelyPassed(start, t) && endDefinitelyAhead(end, t)) return 'open'
  return 'unknown'
}

/** 기간 정보가 없는 상설 매장: 기간 경고 대상이 아니다 */
export function isPermanentShop(e: Pick<EventItem, 'startDate' | 'endDate'> & { type?: EventItem['type'] }): boolean {
  return e.type === 'shop' && !e.startDate && !e.endDate
}

/** 화면 표시용: 값이 비어 있으면 '확인 필요' */
export function orUnknown(v: string | null | undefined): string {
  return v && v.trim() ? v : '확인 필요'
}
