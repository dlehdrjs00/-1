import type {
  AppData,
  EventItem,
  EventType,
  ItineraryItem,
  ReservationRequirement,
  Trip,
  WorkId,
} from '../types'
import { EVENT_TYPES, WORKS } from '../constants'
import {
  daysBetween,
  hasTime,
  isReservationRangeValid,
  isValidDate,
  isValidReservationMoment,
  isValidTime,
  isValidTimezone,
} from './date'

export type ValidationResult = { ok: true; data: AppData } | { ok: false; errors: string[] }

const WORK_IDS = new Set<string>(WORKS.map((w) => w.id))
const TYPE_IDS = new Set<string>(EVENT_TYPES.map((t) => t.id))
const RES_REQ = new Set<string>(['required', 'not_required', 'unknown'])

const MAX_ERRORS = 8
/** eachDate 가 만들 수 있는 최대 일수와 같게 유지 */
export const MAX_TRIP_DAYS = 366

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function nullableDate(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === '') return null
  return isValidDate(v) ? v : undefined
}

/** 예약 시작·종료: 'YYYY-MM-DD'(시각 미정) 또는 'YYYY-MM-DDTHH:mm'. 예전 백업(시각 있는 형식)도 그대로 통과 */
function nullableReservationMoment(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === '') return null
  return isValidReservationMoment(v) ? v : undefined
}

function validateEvent(raw: unknown, idx: number, errors: string[]): EventItem | null {
  const where = `행사 ${idx + 1}번째`
  if (!isObj(raw)) {
    errors.push(`${where}: 객체 형식이 아닙니다.`)
    return null
  }
  const id = str(raw.id)
  const title = str(raw.title).trim()
  if (!id) errors.push(`${where}: id가 없습니다.`)
  if (!title) errors.push(`${where}: 행사명이 없습니다.`)

  const works = Array.isArray(raw.works) ? raw.works.filter((w): w is WorkId => typeof w === 'string' && WORK_IDS.has(w)) : []
  if (!Array.isArray(raw.works) || raw.works.length !== works.length) {
    errors.push(`${where} (${title || id}): 관련 작품 값이 올바르지 않습니다.`)
  }
  const type = str(raw.type)
  if (!TYPE_IDS.has(type)) errors.push(`${where} (${title || id}): 행사 유형 '${type}'을(를) 알 수 없습니다.`)

  const timezone = str(raw.timezone)
  if (!isValidTimezone(timezone)) errors.push(`${where} (${title || id}): 시간대 '${timezone}'이(가) 올바르지 않습니다.`)

  const startDate = nullableDate(raw.startDate)
  const endDate = nullableDate(raw.endDate)
  if (startDate === undefined || endDate === undefined) errors.push(`${where} (${title || id}): 날짜 형식(YYYY-MM-DD)이 올바르지 않습니다.`)
  if (startDate && endDate && startDate > endDate) errors.push(`${where} (${title || id}): 시작일이 종료일보다 늦습니다.`)

  const reservationStart = nullableReservationMoment(raw.reservationStart)
  const reservationEnd = nullableReservationMoment(raw.reservationEnd)
  if (reservationStart === undefined || reservationEnd === undefined) {
    errors.push(`${where} (${title || id}): 예약 시각 형식(YYYY-MM-DD 또는 YYYY-MM-DDTHH:mm)이 올바르지 않습니다.`)
  }
  if (reservationStart && reservationEnd && !isReservationRangeValid(reservationStart, reservationEnd)) {
    errors.push(
      hasTime(reservationStart) && hasTime(reservationEnd)
        ? `${where} (${title || id}): 예약 시작 시각이 예약 종료 시각보다 늦거나 같습니다.`
        : `${where} (${title || id}): 예약 시작일이 예약 종료일보다 늦습니다.`,
    )
  }
  const rr = str(raw.reservationRequired)
  if (!RES_REQ.has(rr)) errors.push(`${where} (${title || id}): 예약 필요 여부 값이 올바르지 않습니다.`)

  const lastCheckedDate = nullableDate(raw.lastCheckedDate)
  if (lastCheckedDate === undefined) errors.push(`${where} (${title || id}): 마지막 확인 날짜 형식이 올바르지 않습니다.`)

  const now = new Date().toISOString()
  return {
    id,
    isSample: raw.isSample === true,
    title,
    works,
    type: type as EventType,
    country: str(raw.country),
    city: str(raw.city),
    venue: str(raw.venue),
    address: str(raw.address),
    startDate: startDate ?? null,
    endDate: endDate ?? null,
    timezone,
    reservationRequired: rr as ReservationRequirement,
    reservationStart: reservationStart ?? null,
    reservationEnd: reservationEnd ?? null,
    officialUrl: str(raw.officialUrl),
    reservationUrl: str(raw.reservationUrl),
    lastCheckedDate: lastCheckedDate ?? null,
    memo: str(raw.memo),
    createdAt: str(raw.createdAt, now),
    updatedAt: str(raw.updatedAt, now),
  }
}

function validateItem(raw: unknown, where: string, errors: string[]): ItineraryItem | null {
  if (!isObj(raw)) {
    errors.push(`${where}: 객체 형식이 아닙니다.`)
    return null
  }
  const kind = str(raw.kind)
  if (kind !== 'event' && kind !== 'place') errors.push(`${where}: 일정 종류가 올바르지 않습니다.`)
  if (!isValidDate(raw.date)) errors.push(`${where}: 날짜 형식이 올바르지 않습니다.`)
  const time = raw.time === null || raw.time === undefined || raw.time === '' ? null : raw.time
  if (time !== null && !isValidTime(time)) errors.push(`${where}: 방문 시각 형식(HH:mm)이 올바르지 않습니다.`)
  if (kind === 'event' && !str(raw.eventId)) errors.push(`${where}: 연결된 행사 id가 없습니다.`)
  if (kind === 'place' && !str(raw.placeName).trim()) errors.push(`${where}: 장소명이 없습니다.`)
  return {
    id: str(raw.id),
    date: str(raw.date),
    kind: kind as ItineraryItem['kind'],
    eventId: kind === 'event' ? str(raw.eventId) : null,
    placeName: str(raw.placeName),
    placeAddress: str(raw.placeAddress),
    time: (time as string | null) ?? null,
    memo: str(raw.memo),
  }
}

function validateTrip(raw: unknown, idx: number, errors: string[]): Trip | null {
  const where = `여행 ${idx + 1}번째`
  if (!isObj(raw)) {
    errors.push(`${where}: 객체 형식이 아닙니다.`)
    return null
  }
  const id = str(raw.id)
  if (!id) errors.push(`${where}: id가 없습니다.`)
  if (!str(raw.name).trim()) errors.push(`${where}: 여행 이름이 없습니다.`)
  if (!isValidDate(raw.startDate) || !isValidDate(raw.endDate)) errors.push(`${where}: 여행 날짜 형식이 올바르지 않습니다.`)
  else if ((raw.startDate as string) > (raw.endDate as string)) errors.push(`${where}: 시작일이 종료일보다 늦습니다.`)
  else if (daysBetween(raw.startDate as string, raw.endDate as string) + 1 > MAX_TRIP_DAYS) {
    errors.push(`${where}: 여행 기간이 너무 깁니다 (최대 ${MAX_TRIP_DAYS}일).`)
  }
  if (!isValidTimezone(raw.timezone)) errors.push(`${where}: 시간대가 올바르지 않습니다.`)
  const acc = isObj(raw.accommodation) ? raw.accommodation : {}
  if (!Array.isArray(raw.items)) errors.push(`${where}: 일정 목록(items)이 배열이 아닙니다.`)
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .map((it, i) => validateItem(it, `${where} 일정 ${i + 1}번째`, errors))
    .filter((x): x is ItineraryItem => x !== null)
  const now = new Date().toISOString()
  return {
    id,
    name: str(raw.name).trim(),
    startDate: str(raw.startDate),
    endDate: str(raw.endDate),
    timezone: str(raw.timezone),
    city: str(raw.city),
    accommodation: { name: str(acc.name), address: str(acc.address), memo: str(acc.memo) },
    items,
    createdAt: str(raw.createdAt, now),
    updatedAt: str(raw.updatedAt, now),
  }
}

/**
 * 불러온 JSON(또는 localStorage 값)을 검증한다.
 * 하나라도 오류가 있으면 ok:false — 호출 측은 기존 데이터를 그대로 유지해야 한다.
 */
export function validateAppData(input: unknown): ValidationResult {
  const errors: string[] = []
  if (!isObj(input)) return { ok: false, errors: ['파일 내용이 이 앱의 데이터 형식(JSON 객체)이 아닙니다.'] }
  if (input.app !== undefined && input.app !== 'subcul-trip-planner') {
    return { ok: false, errors: ['다른 앱에서 내보낸 파일로 보입니다.'] }
  }
  if (input.schemaVersion === undefined) {
    return { ok: false, errors: ['이 앱에서 내보낸 백업 파일이 아니에요.'] }
  }
  if (input.schemaVersion !== 1) {
    return { ok: false, errors: [`지원하지 않는 버전의 백업 파일이에요 (버전 ${String(input.schemaVersion)}).`] }
  }
  if (!Array.isArray(input.events)) errors.push('행사 목록(events)이 배열이 아닙니다.')
  if (!Array.isArray(input.favorites)) errors.push('관심 목록(favorites)이 배열이 아닙니다.')
  if (!Array.isArray(input.trips)) errors.push('여행 목록(trips)이 배열이 아닙니다.')
  if (errors.length) return { ok: false, errors }

  const events = (input.events as unknown[])
    .map((e, i) => validateEvent(e, i, errors))
    .filter((x): x is EventItem => x !== null)
  const trips = (input.trips as unknown[]).map((t, i) => validateTrip(t, i, errors)).filter((x): x is Trip => x !== null)

  const eventIds = new Set<string>()
  for (const e of events) {
    if (e.id && eventIds.has(e.id)) errors.push(`행사 id '${e.id}'가 중복됩니다.`)
    eventIds.add(e.id)
  }
  const tripIds = new Set<string>()
  for (const t of trips) {
    if (t.id && tripIds.has(t.id)) errors.push(`여행 id '${t.id}'가 중복됩니다.`)
    tripIds.add(t.id)
    const itemIds = new Set<string>()
    for (const i of t.items) {
      if (i.id && itemIds.has(i.id)) errors.push(`여행 '${t.name || t.id}': 일정 id '${i.id}'가 중복됩니다.`)
      itemIds.add(i.id)
    }
  }

  if (errors.length) {
    const shown = errors.slice(0, MAX_ERRORS)
    if (errors.length > MAX_ERRORS) shown.push(`그 외 오류 ${errors.length - MAX_ERRORS}건`)
    return { ok: false, errors: shown }
  }

  // 참조 정리: 존재하지 않는 행사 참조는 제거 (오류로 보지 않음)
  const favorites = Array.from(
    new Set((input.favorites as unknown[]).filter((f): f is string => typeof f === 'string' && eventIds.has(f))),
  )
  for (const t of trips) {
    t.items = t.items
      .filter((i) => i.kind === 'place' || (i.eventId && eventIds.has(i.eventId)))
      .map((i) => (i.id ? i : { ...i, id: `item_${Math.random().toString(36).slice(2, 12)}` }))
  }
  const activeTripId =
    typeof input.activeTripId === 'string' && tripIds.has(input.activeTripId) ? input.activeTripId : (trips[0]?.id ?? null)

  return { ok: true, data: { schemaVersion: 1, events, favorites, trips, activeTripId } }
}

/** 내보내기 파일 형태 */
export function toExportPayload(data: AppData) {
  return {
    app: 'subcul-trip-planner',
    exportedAt: new Date().toISOString(),
    ...data,
  }
}
