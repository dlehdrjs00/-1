/**
 * 공통 데이터 타입.
 *
 * 날짜/시각 규칙
 * - DateOnly:      'YYYY-MM-DD'          (시각 정보가 없는 날짜)
 * - LocalDateTime: 'YYYY-MM-DDTHH:mm'    (행사 현지 시간대 기준의 벽시계 시각. 시간대는 EventItem.timezone)
 * - TimeOnly:      'HH:mm'               (여행 일정의 방문 시각, 여행 현지 시간대 기준)
 * - ReservationMoment: DateOnly | LocalDateTime (예약 시작·종료. 시각을 모르면 날짜만 저장 → '시각 미정')
 * - 모르는 값은 null 로 저장하고 화면에는 '확인 필요'로 표시한다. 임의로 채우지 않는다.
 *   (시각을 모른다고 00:00 / 23:59 로 채우지 않는다)
 */

export type DateOnly = string
export type LocalDateTime = string
export type TimeOnly = string

/**
 * 예약 시작·종료 시점 (행사 현지 시간대 EventItem.timezone 기준).
 * - 'YYYY-MM-DD'        : 날짜만 확인됨, 시각 미정
 * - 'YYYY-MM-DDTHH:mm'  : 날짜와 시각 모두 확인됨
 * 예전 데이터·백업(시각 있는 형식 또는 null)도 그대로 유효하다 (schemaVersion 1 유지).
 */
export type ReservationMoment = DateOnly | LocalDateTime

export type WorkId =
  | 'honkai3rd'
  | 'genshin'
  | 'starrail'
  | 'zzz'
  | 'wuwa'
  | 'pjsk'
  | 'arknights'
  | 'stellive'
  | 'other'

export type EventType = 'popup' | 'cafe' | 'concert' | 'exhibition' | 'shop' | 'other'

/** 예약 필요 여부: 필수 / 불필요 / 확인 필요 */
export type ReservationRequirement = 'required' | 'not_required' | 'unknown'

export interface EventItem {
  id: string
  /** 시연용 가상 데이터 여부. true 이면 화면에 '샘플' 표시 */
  isSample: boolean
  title: string
  works: WorkId[]
  type: EventType
  country: string
  city: string
  venue: string
  address: string
  startDate: DateOnly | null
  endDate: DateOnly | null
  /** IANA 시간대. 예: 'Asia/Tokyo'. 예약 시각은 이 시간대 기준 */
  timezone: string
  reservationRequired: ReservationRequirement
  /** 날짜만('YYYY-MM-DD') 또는 날짜+시각('YYYY-MM-DDTHH:mm'). 모르면 null */
  reservationStart: ReservationMoment | null
  reservationEnd: ReservationMoment | null
  officialUrl: string
  reservationUrl: string
  lastCheckedDate: DateOnly | null
  memo: string
  createdAt: string // ISO
  updatedAt: string // ISO
}

/** 등록/수정 폼에서 다루는 필드 (id, 메타데이터 제외) */
export type EventInput = Omit<EventItem, 'id' | 'createdAt' | 'updatedAt'>

export type ItineraryKind = 'event' | 'place'

export interface ItineraryItem {
  id: string
  date: DateOnly
  kind: ItineraryKind
  /** kind === 'event' 일 때 연결된 행사 */
  eventId: string | null
  /** kind === 'place' 일 때 직접 입력한 장소명 */
  placeName: string
  placeAddress: string
  time: TimeOnly | null
  memo: string
}

export interface Accommodation {
  name: string
  address: string
  memo: string
}

export interface Trip {
  id: string
  name: string
  startDate: DateOnly
  endDate: DateOnly
  /** 여행지 시간대 (방문 시각 표시 기준) */
  timezone: string
  city: string
  accommodation: Accommodation
  /** 같은 날짜 안에서는 배열 순서가 일정 순서 */
  items: ItineraryItem[]
  createdAt: string
  updatedAt: string
}

export type TripInput = Pick<Trip, 'name' | 'startDate' | 'endDate' | 'timezone' | 'city' | 'accommodation'>

export interface AppData {
  schemaVersion: 1
  events: EventItem[]
  /** 관심 저장한 행사 id */
  favorites: string[]
  trips: Trip[]
  activeTripId: string | null
}

/** 계산된 행사 진행 상태 */
/** permanent: 기간 정보가 없는 상설 매장 (type 'shop') */
export type EventStatus = 'upcoming' | 'ongoing' | 'ended' | 'unknown' | 'permanent'

/** 계산된 예약 상태 */
export type ReservationStatus =
  | 'not_required' // 예약 불필요
  | 'before_open' // 예약 오픈 전
  | 'open' // 예약 접수 중 (시작이 확실히 지났고 종료가 확실히 남은 경우에만. 시각 미정인 날은 'unknown')
  | 'closed' // 예약 마감
  | 'unknown' // 확인 필요
