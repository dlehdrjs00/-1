import { EVENT_TYPES, STORAGE_KEY, WORKS } from '../constants'

/**
 * 행사 등록·수정 폼의 '저장하지 않은 초안' (순수 함수 + localStorage, 단위 테스트 대상).
 *
 * - 앱 데이터 키(STORAGE_KEY)와 분리된 키에 행사별로 따로 보관한다.
 *     새 행사:  'subcul-trip-planner:v1:draft:new'
 *     행사 수정: 'subcul-trip-planner:v1:draft:edit:<encodeURIComponent(eventId)>'
 * - 저장소 접근은 모두 try/catch 로 감싼다 (사생활 보호 모드·용량 초과). 실패해도 폼은 계속 동작해야 한다.
 * - 복원할 때는 키뿐 아니라 저장된 kind·eventId 도 다시 확인하고, 값은 폼 초기값을 바탕으로
 *   알고 있는 항목만 올바른 타입일 때 덮어쓴다. 형식이 다르거나 망가진 초안이 폼을 깨뜨리지 않게 한다.
 * - 폼 값의 모양(EventFormValues)은 바뀔 수 있으므로 초기값 객체의 키를 기준으로 일반적으로 다룬다.
 */

export const DRAFT_KEY_PREFIX = `${STORAGE_KEY}:draft:`
export const DRAFT_MAX_AGE_DAYS = 30
const DRAFT_MAX_AGE_MS = DRAFT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
const DRAFT_VERSION = 1

export type DraftTarget = { kind: 'new' } | { kind: 'edit'; eventId: string }

export interface StoredEventDraft<V = Record<string, unknown>> {
  v: 1
  kind: 'new' | 'edit'
  /** 수정 초안의 행사 id. 새 행사면 null */
  eventId: string | null
  /** 수정을 시작할 때의 event.updatedAt. 새 행사면 null */
  baseUpdatedAt: string | null
  /** ISO */
  savedAt: string
  values: V
}

export interface LoadedEventDraft<V> {
  values: V
  savedAt: string
  baseUpdatedAt: string | null
  /** 수정 초안: 초안을 만든 뒤 행사가 수정됨 (또는 기준 시각을 알 수 없음) */
  eventChanged: boolean
}

/* ---------------- 키 ---------------- */

export function draftKey(target: DraftTarget): string {
  return target.kind === 'new' ? `${DRAFT_KEY_PREFIX}new` : `${DRAFT_KEY_PREFIX}edit:${encodeURIComponent(target.eventId)}`
}

const targetEventId = (target: DraftTarget): string | null => (target.kind === 'edit' ? target.eventId : null)

/* ---------------- 저장소 (실패해도 예외를 밖으로 내지 않는다) ---------------- */

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function getRaw(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null
  } catch {
    return null
  }
}

function removeKey(key: string): boolean {
  try {
    const ls = storage()
    if (!ls) return false
    ls.removeItem(key)
    return true
  } catch {
    return false
  }
}

/** 초안 키 목록 (지우는 동안 인덱스가 바뀌지 않도록 먼저 모은다) */
function draftKeys(): string[] {
  const out: string[] = []
  try {
    const ls = storage()
    if (!ls) return out
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i)
      if (k !== null && k.startsWith(DRAFT_KEY_PREFIX)) out.push(k)
    }
  } catch {
    /* 읽을 수 없으면 없는 것으로 본다 */
  }
  return out
}

/** 초안을 저장할 수 있는 환경인지 (사생활 보호 모드 등에서 false) */
export function isDraftStorageAvailable(): boolean {
  try {
    const ls = storage()
    if (!ls) return false
    const k = `${DRAFT_KEY_PREFIX}__probe__`
    ls.setItem(k, '1')
    ls.removeItem(k)
    return true
  } catch {
    return false
  }
}

/* ---------------- 값 정리 ---------------- */

/** 열거형 문자열 항목: 허용 값이 아니면 초기값을 유지 */
const ENUM_FIELDS: Record<string, ReadonlySet<string>> = {
  type: new Set<string>(EVENT_TYPES.map((t) => t.id)),
  reservationRequired: new Set<string>(['required', 'not_required', 'unknown']),
}
/** 배열 항목: 허용 값만 남긴다 (나머지 배열은 문자열 배열만 허용) */
const ARRAY_ITEM_FIELDS: Record<string, ReadonlySet<string>> = {
  works: new Set<string>(WORKS.map((w) => w.id)),
}

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k)
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * 저장된 초안 값 → 폼 값. 초기값에서 시작해, 초기값에 있는 키만 같은 원시 타입일 때 덮어쓴다.
 * - 문자열: 문자열이면 그대로 (열거형 항목은 허용 값일 때만)
 * - 배열: 문자열 배열만, 중복 제거 (works 는 올바른 작품 id 만)
 * - 불리언·숫자: 같은 타입일 때만
 * 모르는 키, 다른 타입, 객체 값은 무시한다.
 */
export function sanitizeDraftValues<V extends object>(raw: unknown, initial: V): V {
  const out = { ...initial } as Record<string, unknown>
  if (!isPlainObject(raw)) return out as V
  for (const key of Object.keys(initial)) {
    if (!own(raw, key)) continue
    const base = (initial as Record<string, unknown>)[key]
    const val = raw[key]
    if (typeof base === 'string') {
      if (typeof val !== 'string') continue
      const allowed = ENUM_FIELDS[key]
      if (allowed && !allowed.has(val)) continue
      out[key] = val
    } else if (Array.isArray(base)) {
      if (!Array.isArray(val) || !val.every((x) => typeof x === 'string')) continue
      const allowed = ARRAY_ITEM_FIELDS[key]
      out[key] = Array.from(new Set(val as string[])).filter((x) => !allowed || allowed.has(x))
    } else if (typeof base === 'boolean') {
      if (typeof val === 'boolean') out[key] = val
    } else if (typeof base === 'number') {
      if (typeof val === 'number' && Number.isFinite(val)) out[key] = val
    }
  }
  return out as V
}

const sameValues = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b)

/* ---------------- 읽기 (모양 검사) ---------------- */

interface ParsedDraft {
  kind: 'new' | 'edit'
  eventId: string | null
  baseUpdatedAt: string | null
  savedAt: string
  savedAtMs: number
  values: unknown
}

function parseDraft(raw: string | null): ParsedDraft | null {
  if (raw === null) return null
  let d: unknown
  try {
    d = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isPlainObject(d) || d.v !== DRAFT_VERSION) return null
  if (d.kind !== 'new' && d.kind !== 'edit') return null
  const eventId = d.eventId
  if (d.kind === 'new' ? eventId !== null : typeof eventId !== 'string' || eventId === '') return null
  if (typeof d.savedAt !== 'string') return null
  const savedAtMs = Date.parse(d.savedAt)
  if (!Number.isFinite(savedAtMs)) return null
  if (!isPlainObject(d.values)) return null
  return {
    kind: d.kind,
    eventId: eventId as string | null,
    baseUpdatedAt: typeof d.baseUpdatedAt === 'string' ? d.baseUpdatedAt : null,
    savedAt: d.savedAt,
    savedAtMs,
    values: d.values,
  }
}

/** 키가 가리키는 대상과 저장된 kind·eventId 가 일치하는지 */
function keyMatches(key: string, d: ParsedDraft): boolean {
  const expected = d.kind === 'new' ? draftKey({ kind: 'new' }) : draftKey({ kind: 'edit', eventId: d.eventId! })
  return key === expected
}

const isExpired = (d: ParsedDraft, now: Date) => now.getTime() - d.savedAtMs > DRAFT_MAX_AGE_MS

/* ---------------- 공개 함수 ---------------- */

/** 초안 저장. 저장소를 쓸 수 없으면 false (폼은 계속 동작) */
export function saveEventDraft<V extends object>(
  target: DraftTarget,
  values: V,
  baseUpdatedAt: string | null,
  now: Date = new Date(),
): boolean {
  const draft: StoredEventDraft<V> = {
    v: DRAFT_VERSION,
    kind: target.kind,
    eventId: targetEventId(target),
    baseUpdatedAt: target.kind === 'edit' ? baseUpdatedAt : null,
    savedAt: now.toISOString(),
    values,
  }
  try {
    const ls = storage()
    if (!ls) return false
    ls.setItem(draftKey(target), JSON.stringify(draft))
    return true
  } catch {
    return false
  }
}

/** 해당 대상의 초안 삭제 */
export function clearEventDraft(target: DraftTarget): void {
  removeKey(draftKey(target))
}

/** 여러 행사의 수정 초안 삭제 (행사 삭제·샘플 일괄 삭제) */
export function clearEventDraftsFor(eventIds: Iterable<string>): void {
  for (const id of eventIds) removeKey(draftKey({ kind: 'edit', eventId: id }))
}

/** 모든 초안 삭제 (전체 초기화) */
export function clearAllEventDrafts(): void {
  for (const k of draftKeys()) removeKey(k)
}

/**
 * 오래되었거나(30일 초과) 읽을 수 없는 초안, 키와 내용이 맞지 않는 초안을 지운다.
 * eventExists 를 주면 이미 없는 행사의 수정 초안도 지운다. 반환: 지운 개수
 */
export function pruneEventDrafts(opts: { now?: Date; eventExists?: (id: string) => boolean } = {}): number {
  const now = opts.now ?? new Date()
  let removed = 0
  for (const key of draftKeys()) {
    const d = parseDraft(getRaw(key))
    const drop =
      !d ||
      !keyMatches(key, d) ||
      isExpired(d, now) ||
      (d.kind === 'edit' && opts.eventExists !== undefined && !opts.eventExists(d.eventId!))
    if (drop && removeKey(key)) removed++
  }
  return removed
}

/**
 * 같은 대상(kind + eventId)의 초안을 읽어 폼 값으로 정리해 돌려준다. 없거나 쓸 수 없으면 null.
 * - 수정 초안: event 가 null 이면(행사가 없어짐) 초안을 지운다.
 *   event.updatedAt 이 초안의 기준 시각과 다르면 eventChanged = true.
 * - 정리한 값이 초기값과 같으면 조용히 지운다.
 * - 부르는 김에 오래된 초안(과 eventExists 를 주면 없는 행사의 초안)을 정리한다.
 */
export function loadEventDraft<V extends object>(
  target: DraftTarget,
  initial: V,
  opts: { now?: Date; event?: { updatedAt: string } | null; eventExists?: (id: string) => boolean } = {},
): LoadedEventDraft<V> | null {
  pruneEventDrafts({ now: opts.now, eventExists: opts.eventExists })
  const key = draftKey(target)
  const d = parseDraft(getRaw(key))
  if (!d) {
    // 형식이 맞지 않는 값은 지운다 (prune 이 이미 지웠을 수도 있음)
    if (getRaw(key) !== null) removeKey(key)
    return null
  }
  // 키뿐 아니라 저장된 내용의 대상도 확인한다
  if (d.kind !== target.kind || d.eventId !== targetEventId(target)) return null
  if (target.kind === 'edit' && opts.event === null) {
    removeKey(key)
    return null
  }
  const values = sanitizeDraftValues(d.values, initial)
  if (sameValues(values, initial)) {
    removeKey(key)
    return null
  }
  const event = opts.event
  const eventChanged = target.kind === 'edit' && !!event && (d.baseUpdatedAt === null || d.baseUpdatedAt !== event.updatedAt)
  return { values, savedAt: d.savedAt, baseUpdatedAt: d.baseUpdatedAt, eventChanged }
}

/** 초안 저장 시각 표시: 'M월 D일 HH:mm' (이 기기의 시간대) */
export function formatDraftSavedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '시각 확인 필요'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${p(d.getHours())}:${p(d.getMinutes())}`
}
