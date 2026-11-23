import type { EventInput, EventItem, EventType, ReservationRequirement, WorkId } from '../types'
import { EVENT_TYPES, WORKS } from '../constants'
import {
  isReservationRangeValid,
  isValidDate,
  isValidTime,
  isValidTimezone,
  joinReservationMoment,
  splitReservationMoment,
} from './date'

/**
 * 행사 등록/수정 폼 <-> EventInput 변환과 검증 (순수 함수, 테스트 가능).
 *
 * 폼에서는 모든 값을 문자열로 다루고, 빈 문자열은 '모름'을 뜻한다.
 * 저장할 때 문자열은 앞뒤 공백을 지우고, 빈 날짜/시각은 null 로 바꾼다 (화면에는 '확인 필요').
 */

/**
 * 폼 값 (모두 문자열, '' = 모름). 초안 저장·복구에서는 이 객체를 그대로 데이터로 다룬다.
 * 모양: EventInput 과 같되, 예약 시작·종료는 날짜/시각 칸으로 나뉜다
 *   reservationStartDate 'YYYY-MM-DD' + reservationStartTime 'HH:mm' (시각 '' = 시각 미정 → 날짜만 저장)
 *   reservationEndDate   'YYYY-MM-DD' + reservationEndTime   'HH:mm'
 * (예전 모양의 reservationStart / reservationEnd 필드는 없다)
 */
export interface EventFormValues {
  title: string
  works: WorkId[]
  type: EventType
  country: string
  city: string
  timezone: string
  venue: string
  address: string
  /** '' = 확인 필요 */
  startDate: string
  endDate: string
  reservationRequired: ReservationRequirement
  /** 'YYYY-MM-DD' (행사 현지 날짜), '' = 확인 필요 */
  reservationStartDate: string
  /** 'HH:mm' (행사 현지 시간), '' = 시각 미정 (날짜만 저장) */
  reservationStartTime: string
  reservationEndDate: string
  reservationEndTime: string
  reservationUrl: string
  officialUrl: string
  lastCheckedDate: string
  memo: string
}

export type EventFormField = keyof EventFormValues
export type EventFormErrors = Partial<Record<EventFormField, string>>

/** 화면에 놓인 순서. '첫 번째 오류' 판단과 오류 요약 순서에 쓴다. */
export const EVENT_FORM_FIELD_ORDER: EventFormField[] = [
  'title',
  'works',
  'type',
  'country',
  'city',
  'timezone',
  'venue',
  'address',
  'startDate',
  'endDate',
  'reservationRequired',
  'reservationStartDate',
  'reservationStartTime',
  'reservationEndDate',
  'reservationEndTime',
  'reservationUrl',
  'officialUrl',
  'lastCheckedDate',
  'memo',
]

export const EVENT_FORM_FIELD_LABEL: Record<EventFormField, string> = {
  title: '행사명',
  works: '관련 작품',
  type: '행사 유형',
  country: '국가',
  city: '도시',
  timezone: '시간대',
  venue: '장소명',
  address: '주소',
  startDate: '시작일',
  endDate: '종료일',
  reservationRequired: '예약 필요 여부',
  reservationStartDate: '예약 시작 날짜',
  reservationStartTime: '예약 시작 시각',
  reservationEndDate: '예약 종료 날짜',
  reservationEndTime: '예약 종료 시각',
  reservationUrl: '예약 URL',
  officialUrl: '공식 공지 URL',
  lastCheckedDate: '마지막 확인 날짜',
  memo: '메모',
}

export const DEFAULT_EVENT_TIMEZONE = 'Asia/Tokyo'

const WORK_ORDER = new Map<string, number>(WORKS.map((w, i) => [w.id, i]))
const TYPE_IDS = new Set<string>(EVENT_TYPES.map((t) => t.id))
const RES_REQ = new Set<string>(['required', 'not_required', 'unknown'])

/** 새 행사 폼의 초기값. 모르는 정보는 비워 둔다. */
export function emptyEventForm(): EventFormValues {
  return {
    title: '',
    works: [],
    type: EVENT_TYPES[0].id,
    country: '',
    city: '',
    timezone: DEFAULT_EVENT_TIMEZONE,
    venue: '',
    address: '',
    startDate: '',
    endDate: '',
    reservationRequired: 'unknown',
    reservationStartDate: '',
    reservationStartTime: '',
    reservationEndDate: '',
    reservationEndTime: '',
    reservationUrl: '',
    officialUrl: '',
    lastCheckedDate: '',
    memo: '',
  }
}

/** 기존 행사 → 폼 값. 예약 시작·종료는 날짜/시각으로 나눈다 (날짜만 있으면 시각 칸은 비움) */
export function eventToForm(e: EventItem | EventInput): EventFormValues {
  const rs = splitReservationMoment(e.reservationStart)
  const re = splitReservationMoment(e.reservationEnd)
  return {
    title: e.title,
    works: [...e.works],
    type: e.type,
    country: e.country,
    city: e.city,
    timezone: e.timezone,
    venue: e.venue,
    address: e.address,
    startDate: e.startDate ?? '',
    endDate: e.endDate ?? '',
    reservationRequired: e.reservationRequired,
    reservationStartDate: rs.date,
    reservationStartTime: rs.time,
    reservationEndDate: re.date,
    reservationEndTime: re.time,
    reservationUrl: e.reservationUrl,
    officialUrl: e.officialUrl,
    lastCheckedDate: e.lastCheckedDate ?? '',
    memo: e.memo,
  }
}

/** http:// 또는 https:// 로 시작하는 올바른 주소인지 */
export function isHttpUrl(v: string): boolean {
  const s = v.trim()
  if (!/^https?:\/\//i.test(s) || /\s/.test(s)) return false
  try {
    const u = new URL(s)
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.length > 0
  } catch {
    return false
  }
}

/** time 입력값 정규화: 초 단위가 붙어 오면 'HH:mm' 로 자른다. */
export function normalizeTime(v: string): string {
  const s = v.trim()
  return /^\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(s) ? s.slice(0, 5) : s
}

/** 작품 목록: 중복 제거 + WORKS 순서로 정렬 */
export function normalizeWorks(works: WorkId[]): WorkId[] {
  return Array.from(new Set(works))
    .filter((w) => WORK_ORDER.has(w))
    .sort((a, b) => (WORK_ORDER.get(a) ?? 0) - (WORK_ORDER.get(b) ?? 0))
}

/** 폼 검증. 오류가 없으면 빈 객체. */
export function validateEventForm(v: EventFormValues): EventFormErrors {
  const errors: EventFormErrors = {}

  if (!v.title.trim()) errors.title = '행사명을 입력하세요.'
  if (normalizeWorks(v.works).length === 0) errors.works = '관련 작품을 1개 이상 선택하세요. 목록에 없으면 ‘기타’를 고르세요.'
  if (!TYPE_IDS.has(v.type)) errors.type = '행사 유형을 선택하세요.'
  if (!isValidTimezone(v.timezone)) errors.timezone = '올바른 시간대를 선택하세요.'

  const start = v.startDate.trim()
  const end = v.endDate.trim()
  if (start && !isValidDate(start)) errors.startDate = '날짜 형식이 올바르지 않아요. (예: 2027-01-09)'
  if (end && !isValidDate(end)) errors.endDate = '날짜 형식이 올바르지 않아요. (예: 2027-01-09)'
  else if (start && end && isValidDate(start) && end < start) errors.endDate = '종료일은 시작일과 같거나 그 이후여야 해요.'

  if (!RES_REQ.has(v.reservationRequired)) errors.reservationRequired = '예약 필요 여부를 선택하세요.'
  if (v.reservationRequired === 'required') {
    // 시각은 선택: 비우면 날짜만 저장하고 '시각 미정'으로 표시한다. 시각만 있고 날짜가 없으면 오류.
    const sd = v.reservationStartDate.trim()
    const st = normalizeTime(v.reservationStartTime)
    const ed = v.reservationEndDate.trim()
    const et = normalizeTime(v.reservationEndTime)
    const dateMsg = '날짜 형식이 올바르지 않아요. (예: 2026-12-01)'
    const timeMsg = '시각 형식이 올바르지 않아요. (예: 18:00)'
    const needDate = '날짜를 먼저 입력하세요.'
    if (sd && !isValidDate(sd)) errors.reservationStartDate = dateMsg
    else if (!sd && st) errors.reservationStartDate = needDate
    if (st && !isValidTime(st)) errors.reservationStartTime = timeMsg
    if (ed && !isValidDate(ed)) errors.reservationEndDate = dateMsg
    else if (!ed && et) errors.reservationEndDate = needDate
    if (et && !isValidTime(et)) errors.reservationEndTime = timeMsg

    const startOk = !errors.reservationStartDate && !errors.reservationStartTime
    const endOk = !errors.reservationEndDate && !errors.reservationEndTime
    const start = joinReservationMoment(sd, st)
    const end = joinReservationMoment(ed, et)
    if (startOk && endOk && start && end && !isReservationRangeValid(start, end)) {
      if (ed < sd) errors.reservationEndDate = '예약 종료일은 예약 시작일과 같거나 그 이후여야 해요.'
      else errors.reservationEndTime = '예약 종료 시각은 예약 시작 시각보다 늦어야 해요.'
    }
  }

  const urlMsg = 'http:// 또는 https:// 로 시작하는 주소를 입력하세요.'
  if (v.reservationUrl.trim() && !isHttpUrl(v.reservationUrl)) errors.reservationUrl = urlMsg
  if (v.officialUrl.trim() && !isHttpUrl(v.officialUrl)) errors.officialUrl = urlMsg

  const checked = v.lastCheckedDate.trim()
  if (checked && !isValidDate(checked)) errors.lastCheckedDate = '날짜 형식이 올바르지 않아요. (예: 2026-11-23)'

  return errors
}

/** 오류를 화면 순서대로 나열 (요약 Notice 용) */
export function orderedErrors(errors: EventFormErrors): { field: EventFormField; label: string; message: string }[] {
  return EVENT_FORM_FIELD_ORDER.filter((f) => errors[f]).map((f) => ({
    field: f,
    label: EVENT_FORM_FIELD_LABEL[f],
    message: errors[f]!,
  }))
}

export function hasErrors(errors: EventFormErrors): boolean {
  return Object.keys(errors).length > 0
}

/**
 * 폼 값 → 저장용 EventInput. 검증을 통과한 값에 사용한다.
 * - 문자열은 trim, 빈 날짜/시각은 null
 * - 예약 시작·종료: 날짜+시각 → 'YYYY-MM-DDTHH:mm', 시각이 비면 날짜만 'YYYY-MM-DD' (00:00 등으로 채우지 않음)
 * - 예약이 '필수'가 아니면 예약 시작/종료 시각은 저장하지 않는다 (null)
 */
export function formToEventInput(v: EventFormValues, isSample: boolean): EventInput {
  const required = v.reservationRequired === 'required'
  const moment = (date: string, time: string) => joinReservationMoment(date, normalizeTime(time))
  return {
    isSample,
    title: v.title.trim(),
    works: normalizeWorks(v.works),
    type: v.type,
    country: v.country.trim(),
    city: v.city.trim(),
    venue: v.venue.trim(),
    address: v.address.trim(),
    startDate: v.startDate.trim() || null,
    endDate: v.endDate.trim() || null,
    timezone: v.timezone,
    reservationRequired: v.reservationRequired,
    reservationStart: required ? moment(v.reservationStartDate, v.reservationStartTime) : null,
    reservationEnd: required ? moment(v.reservationEndDate, v.reservationEndTime) : null,
    officialUrl: v.officialUrl.trim(),
    reservationUrl: v.reservationUrl.trim(),
    lastCheckedDate: v.lastCheckedDate.trim() || null,
    memo: v.memo.trim(),
  }
}

/** 두 폼 값이 같은지 (저장하지 않은 변경 확인용) */
export function eventFormEquals(a: EventFormValues, b: EventFormValues): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
