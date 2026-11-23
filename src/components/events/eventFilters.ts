import type { EventItem, EventStatus, EventType, WorkId } from '../../types'
import { EVENT_TYPES, WORKS } from '../../constants'
import { isValidDate, rangesOverlap } from '../../lib/date'
import { getEventStatus } from '../../lib/status'

/**
 * 행사 목록 필터 상태.
 * - 같은 항목 안에서 여러 개를 고르면 OR, 서로 다른 항목끼리는 AND.
 * - country/city 가 null 이면 제한 없음. '' 은 '국가/도시 미입력' 행사를 뜻한다.
 * - from/to 가 '' 이면 그쪽 끝은 열린 구간.
 */
export interface EventFilters {
  q: string
  works: WorkId[]
  types: EventType[]
  country: string | null
  city: string | null
  from: string
  to: string
  hideEnded: boolean
}

export const DEFAULT_FILTERS: EventFilters = {
  q: '',
  works: [],
  types: [],
  country: null,
  city: null,
  from: '',
  to: '',
  hideEnded: true,
}

const WORK_IDS = new Set<string>(WORKS.map((w) => w.id))
const TYPE_IDS = new Set<string>(EVENT_TYPES.map((t) => t.id))

const norm = (s: string) => s.trim()

/** 저장소에서 읽은 값을 안전한 필터 상태로 정리 */
export function sanitizeFilters(raw: unknown): EventFilters {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ...DEFAULT_FILTERS }
  const r = raw as Record<string, unknown>
  const strOrNull = (v: unknown) => (typeof v === 'string' ? v : null)
  const country = strOrNull(r.country)
  return {
    q: typeof r.q === 'string' ? r.q.slice(0, 100) : '',
    works: Array.isArray(r.works) ? r.works.filter((w): w is WorkId => typeof w === 'string' && WORK_IDS.has(w)) : [],
    types: Array.isArray(r.types) ? r.types.filter((t): t is EventType => typeof t === 'string' && TYPE_IDS.has(t)) : [],
    country,
    city: country === null ? null : strOrNull(r.city),
    from: isValidDate(r.from) ? r.from : '',
    to: isValidDate(r.to) ? r.to : '',
    hideEnded: typeof r.hideEnded === 'boolean' ? r.hideEnded : true,
  }
}

export function hasInvalidRange(f: Pick<EventFilters, 'from' | 'to'>): boolean {
  return !!(f.from && f.to && f.from > f.to)
}

/** 적용 중인 필터 항목 수 (기본값인 '종료된 행사 숨기기'는 세지 않음) */
export function activeFilterCount(f: EventFilters): number {
  let n = 0
  if (f.q.trim()) n++
  if (f.works.length) n++
  if (f.types.length) n++
  if (f.country !== null) n++
  if (f.from || f.to) n++
  return n
}

export function isDefaultFilters(f: EventFilters): boolean {
  return activeFilterCount(f) === 0 && f.hideEnded === DEFAULT_FILTERS.hideEnded
}

function matchesQuery(e: EventItem, q: string): boolean {
  const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!tokens.length) return true
  const hay = [e.title, e.venue, e.city, e.address].join('\n').toLowerCase()
  return tokens.every((t) => hay.includes(t))
}

/**
 * 필터 일치 여부. 진행 상태(status)는 호출하는 쪽에서 한 번만 계산해 넘긴다.
 * ignoreEnded: '종료된 행사 숨기기'를 무시하고 판정 (숨겨진 개수 계산용)
 */
export function matchesFilters(e: EventItem, f: EventFilters, status: EventStatus, opts: { ignoreEnded?: boolean } = {}): boolean {
  if (f.works.length && !e.works.some((w) => f.works.includes(w))) return false
  if (f.types.length && !f.types.includes(e.type)) return false
  if (f.country !== null && norm(e.country) !== f.country) return false
  if (f.country !== null && f.city !== null && norm(e.city) !== f.city) return false
  // 기간이 확인되지 않은 쪽은 열린 구간으로 보고 겹침을 판정한다 (lib/date.rangesOverlap)
  if ((f.from || f.to) && !hasInvalidRange(f) && !rangesOverlap(e.startDate, e.endDate, f.from || null, f.to || null)) {
    return false
  }
  if (!matchesQuery(e, f.q)) return false
  if (f.hideEnded && !opts.ignoreEnded && status === 'ended') return false
  return true
}

/** 정렬 그룹: 진행 중·진행 예정 → 기간 확인 필요 → 종료 */
const RANK: Record<EventStatus, number> = { ongoing: 0, upcoming: 0, unknown: 1, ended: 2 }

/** null 은 항상 뒤로 */
function cmpNullableAsc(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a < b ? -1 : 1
}

export interface ListedEvent {
  event: EventItem
  status: EventStatus
}

export function compareListed(a: ListedEvent, b: ListedEvent): number {
  const r = RANK[a.status] - RANK[b.status]
  if (r) return r
  let c = 0
  if (a.status === 'ended' && b.status === 'ended') {
    // 최근에 끝난 행사부터
    c = -cmpNullableAsc(a.event.endDate, b.event.endDate)
  } else {
    c = cmpNullableAsc(a.event.startDate, b.event.startDate) || cmpNullableAsc(a.event.endDate, b.event.endDate)
  }
  return c || a.event.title.localeCompare(b.event.title, 'ko')
}

export interface FilterResult {
  /** 필터·정렬을 거친 표시 목록 */
  items: ListedEvent[]
  /** '종료된 행사 숨기기' 때문에 빠진 행사 수 */
  hiddenEnded: number
}

export function filterAndSort(events: EventItem[], f: EventFilters, now: Date = new Date()): FilterResult {
  const items: ListedEvent[] = []
  let hiddenEnded = 0
  for (const event of events) {
    const status = getEventStatus(event, now)
    if (!matchesFilters(event, f, status, { ignoreEnded: true })) continue
    if (f.hideEnded && status === 'ended') {
      hiddenEnded++
      continue
    }
    items.push({ event, status })
  }
  items.sort(compareListed)
  return { items, hiddenEnded }
}

/* ---------------- 지역 선택지 ---------------- */

export interface RegionGroup {
  country: string
  count: number
  cities: { city: string; count: number }[]
}

/** 데이터에 있는 국가·도시로 선택지 구성. 이름순, 미입력('')은 맨 뒤 */
export function regionGroups(events: EventItem[]): RegionGroup[] {
  const map = new Map<string, Map<string, number>>()
  for (const e of events) {
    const c = norm(e.country)
    const city = norm(e.city)
    let cities = map.get(c)
    if (!cities) map.set(c, (cities = new Map()))
    cities.set(city, (cities.get(city) ?? 0) + 1)
  }
  const byName = (a: string, b: string) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'ko'))
  return [...map.entries()]
    .map(([country, cities]) => ({
      country,
      count: [...cities.values()].reduce((s, n) => s + n, 0),
      cities: [...cities.entries()].map(([city, count]) => ({ city, count })).sort((a, b) => byName(a.city, b.city)),
    }))
    .sort((a, b) => byName(a.country, b.country))
}

/** select 의 value 문자열 ↔ (country, city) */
export function encodeRegion(country: string | null, city: string | null): string {
  return country === null ? '' : JSON.stringify([country, city])
}

export function decodeRegion(v: string): { country: string | null; city: string | null } {
  if (!v) return { country: null, city: null }
  try {
    const p = JSON.parse(v)
    if (Array.isArray(p) && typeof p[0] === 'string' && (p[1] === null || typeof p[1] === 'string')) {
      return { country: p[0], city: p[1] }
    }
  } catch {
    /* ignore */
  }
  return { country: null, city: null }
}

export const COUNTRY_UNKNOWN_LABEL = '국가 확인 필요'
export const CITY_UNKNOWN_LABEL = '도시 확인 필요'
