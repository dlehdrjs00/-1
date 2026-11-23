import type { EventStatus, EventType, ReservationRequirement, ReservationStatus, WorkId } from './types'

export interface WorkMeta {
  id: WorkId
  name: string
  short: string
  /** 공식 이미지를 쓰지 않기 위한 자체 색상 (작품 공식 색상 아님) */
  color: string
}

export const WORKS: WorkMeta[] = [
  { id: 'honkai3rd', name: '붕괴3rd', short: '붕3', color: '#f472b6' },
  { id: 'genshin', name: '원신', short: '원신', color: '#38bdf8' },
  { id: 'starrail', name: '붕괴: 스타레일', short: '스레', color: '#a78bfa' },
  { id: 'zzz', name: '젠레스 존 제로', short: '젠존제', color: '#facc15' },
  { id: 'wuwa', name: '명조', short: '명조', color: '#2dd4bf' },
  { id: 'pjsk', name: '프로젝트 세카이', short: '프세카', color: '#34d399' },
  { id: 'arknights', name: '명일방주', short: '명방', color: '#94a3b8' },
  { id: 'stellive', name: '스텔라이브', short: '스텔', color: '#818cf8' },
  { id: 'other', name: '기타', short: '기타', color: '#64748b' },
]

export const WORK_MAP: Record<WorkId, WorkMeta> = Object.fromEntries(WORKS.map((w) => [w.id, w])) as unknown as Record<
  WorkId,
  WorkMeta
>

export const EVENT_TYPES: { id: EventType; label: string; icon: string }[] = [
  { id: 'popup', label: '팝업스토어', icon: '🛍️' },
  { id: 'cafe', label: '콜라보 카페', icon: '☕' },
  { id: 'concert', label: '공연', icon: '🎤' },
  { id: 'exhibition', label: '전시', icon: '🖼️' },
  { id: 'shop', label: '상설 매장', icon: '🏬' },
  { id: 'other', label: '기타', icon: '✨' },
]

export const EVENT_TYPE_MAP: Record<EventType, { label: string; icon: string }> = Object.fromEntries(
  EVENT_TYPES.map((t) => [t.id, t]),
) as unknown as Record<EventType, { label: string; icon: string }>

export const RESERVATION_REQUIREMENT_LABEL: Record<ReservationRequirement, string> = {
  required: '예약 필수',
  not_required: '예약 불필요',
  unknown: '확인 필요',
}

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  upcoming: '진행 예정',
  ongoing: '진행 중',
  ended: '종료',
  unknown: '기간 확인 필요',
  permanent: '상설 운영',
}

export const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  not_required: '예약 불필요',
  before_open: '예약 오픈 전',
  open: '예약 접수 중',
  closed: '예약 마감',
  unknown: '예약 확인 필요',
}

/** 배지 색상 톤 (CSS 클래스 badge--{tone}) */
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent'

export const EVENT_STATUS_TONE: Record<EventStatus, Tone> = {
  upcoming: 'info',
  ongoing: 'success',
  ended: 'neutral',
  unknown: 'warning',
  permanent: 'accent',
}

export const RESERVATION_STATUS_TONE: Record<ReservationStatus, Tone> = {
  not_required: 'neutral',
  before_open: 'info',
  open: 'success',
  closed: 'danger',
  unknown: 'warning',
}

export const TIMEZONES: { id: string; label: string }[] = [
  { id: 'Asia/Tokyo', label: '일본 (JST, UTC+9)' },
  { id: 'Asia/Seoul', label: '한국 (KST, UTC+9)' },
  { id: 'Asia/Shanghai', label: '중국 (CST, UTC+8)' },
  { id: 'Asia/Taipei', label: '대만 (CST, UTC+8)' },
  { id: 'Asia/Hong_Kong', label: '홍콩 (HKT, UTC+8)' },
  { id: 'Asia/Singapore', label: '싱가포르 (SGT, UTC+8)' },
  { id: 'Asia/Bangkok', label: '태국 (ICT, UTC+7)' },
  { id: 'America/Los_Angeles', label: '미국 서부 (PT)' },
  { id: 'America/New_York', label: '미국 동부 (ET)' },
  { id: 'Europe/London', label: '영국 (GMT/BST)' },
  { id: 'Europe/Paris', label: '중부 유럽 (CET/CEST)' },
]

export const TIMEZONE_SHORT: Record<string, string> = {
  'Asia/Tokyo': '일본 시간',
  'Asia/Seoul': '한국 시간',
  'Asia/Shanghai': '중국 시간',
  'Asia/Taipei': '대만 시간',
  'Asia/Hong_Kong': '홍콩 시간',
  'Asia/Singapore': '싱가포르 시간',
  'Asia/Bangkok': '태국 시간',
  'America/Los_Angeles': '미국 서부 시간',
  'America/New_York': '미국 동부 시간',
  'Europe/London': '영국 시간',
  'Europe/Paris': '중부 유럽 시간',
}

/** 국가 → 도시 추천 목록 (자유 입력도 허용) */
export const REGION_SUGGESTIONS: Record<string, string[]> = {
  일본: ['도쿄', '오사카', '교토', '나고야', '후쿠오카', '삿포로', '요코하마'],
  한국: ['서울', '부산', '대구', '인천', '대전', '광주'],
  중국: ['상하이', '베이징', '광저우', '선전', '청두'],
  대만: ['타이베이', '가오슝', '타이중'],
}

export const COUNTRY_DEFAULT_TZ: Record<string, string> = {
  일본: 'Asia/Tokyo',
  한국: 'Asia/Seoul',
  대한민국: 'Asia/Seoul',
  중국: 'Asia/Shanghai',
  대만: 'Asia/Taipei',
  타이완: 'Asia/Taipei',
  홍콩: 'Asia/Hong_Kong',
  싱가포르: 'Asia/Singapore',
  태국: 'Asia/Bangkok',
  영국: 'Europe/London',
  프랑스: 'Europe/Paris',
}

export const STORAGE_KEY = 'subcul-trip-planner:v1'
export const STORAGE_BACKUP_KEY = 'subcul-trip-planner:v1:corrupt-backup'
