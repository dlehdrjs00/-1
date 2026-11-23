/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import type { AppData, EventInput, EventItem, ItineraryItem, Trip, TripInput } from '../types'
import { STORAGE_BACKUP_KEY, STORAGE_KEY } from '../constants'
import { createInitialData } from '../data/initial'
import { validateAppData } from '../lib/validate'
import { newId } from '../lib/id'

/* ------------------------------------------------------------------ */
/* 저장소 읽기/쓰기                                                      */
/* ------------------------------------------------------------------ */

/**
 * corrupt_reset:     손상된 데이터를 백업 키에 보관하고 초기 상태로 시작
 * corrupt_no_backup: 백업 보관에도 실패 → 원본을 메모리에 들고 있으며, 사용자가 바꾸기 전까지 덮어쓰지 않는다
 */
export type LoadNotice = null | 'corrupt_reset' | 'corrupt_no_backup'

export function loadFromStorage(): { data: AppData; notice: LoadNotice; corruptRaw?: string } {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return { data: createInitialData(), notice: null }
  }
  if (raw === null) return { data: createInitialData(), notice: null }
  try {
    const parsed = JSON.parse(raw)
    const res = validateAppData(parsed)
    if (res.ok) return { data: res.data, notice: null }
  } catch {
    /* fallthrough */
  }
  // 손상된 데이터: 지우지 않고 백업 키에 보관한 뒤 초기 데이터로 시작
  try {
    localStorage.setItem(STORAGE_BACKUP_KEY, raw)
  } catch {
    return { data: createInitialData(), notice: 'corrupt_no_backup', corruptRaw: raw }
  }
  return { data: createInitialData(), notice: 'corrupt_reset' }
}

/*
 * 저장 실패 여부는 React state 가 아니라 작은 외부 저장소로 관리한다.
 * (저장은 변경 직후·첫 화면 표시 때 일어나는 부수 효과이므로, effect 안에서 setState 를 부르지 않기 위해)
 */
const saveStatus = { failed: false, listeners: new Set<() => void>() }
function subscribeSaveStatus(fn: () => void) {
  saveStatus.listeners.add(fn)
  return () => {
    saveStatus.listeners.delete(fn)
  }
}
/** 앱 데이터를 저장하고 저장 실패 안내 상태를 갱신한다. 반환: 저장 성공 여부 */
export function persist(data: AppData): boolean {
  const ok = saveToStorage(data)
  const failed = !ok
  if (failed !== saveStatus.failed) {
    saveStatus.failed = failed
    saveStatus.listeners.forEach((fn) => fn())
  }
  return ok
}

/** 테스트용: 저장 실패 안내 상태 */
export function getSaveFailed(): boolean {
  return saveStatus.failed
}

/** 저장 실패 시 사용자에게 보여 줄 공통 문구 */
export const SAVE_FAILED_MESSAGE = '저장하지 못했어요. 브라우저 저장 공간을 확인한 뒤 다시 시도해 주세요.'

/**
 * 데이터 엔진: 변경은 **저장에 성공했을 때만** 반영한다 (트랜잭션 방식).
 * 저장에 실패하면 현재 데이터가 그대로 남으므로, 화면에 보이는 데이터와 저장된 데이터가 어긋나지 않고
 * 같은 동작을 다시 시도해도 중복으로 쌓이지 않는다.
 */
export interface DataEngine {
  get(): AppData
  /** 저장 후 반영. 반환: 저장 성공 여부 (실패하면 아무것도 바뀌지 않음) */
  apply(next: AppData): boolean
  /** 다른 탭이 이미 저장한 데이터를 반영 (다시 저장하지 않음) */
  adopt(next: AppData): void
}

export function createDataEngine(initial: AppData, save: (d: AppData) => boolean = persist): DataEngine {
  let current = initial
  return {
    get: () => current,
    apply(next) {
      if (next === current) return true
      if (!save(next)) return false
      current = next
      return true
    },
    adopt(next) {
      current = next
    },
  }
}

function saveToStorage(data: AppData): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ */
/* 순수 변경 함수 (테스트 가능)                                           */
/* ------------------------------------------------------------------ */

const nowIso = () => new Date().toISOString()

export const ops = {
  addEvent(d: AppData, input: EventInput, id = newId('evt')): AppData {
    const t = nowIso()
    const ev: EventItem = { ...input, id, createdAt: t, updatedAt: t }
    return { ...d, events: [ev, ...d.events] }
  },
  /** 같은 id 가 있으면 갱신, 없으면 추가 (재시도해도 행사가 하나만 생기도록) */
  upsertEvent(d: AppData, input: EventInput, id: string): AppData {
    return d.events.some((e) => e.id === id) ? ops.updateEvent(d, id, input) : ops.addEvent(d, input, id)
  },
  updateEvent(d: AppData, id: string, input: EventInput): AppData {
    return {
      ...d,
      events: d.events.map((e) => (e.id === id ? { ...e, ...input, id, createdAt: e.createdAt, updatedAt: nowIso() } : e)),
    }
  },
  /** 행사 삭제 시 관심 목록·여행 일정의 참조도 함께 제거 */
  deleteEvents(d: AppData, ids: Set<string>): AppData {
    return {
      ...d,
      events: d.events.filter((e) => !ids.has(e.id)),
      favorites: d.favorites.filter((f) => !ids.has(f)),
      trips: d.trips.map((t) => {
        const items = t.items.filter((i) => !(i.kind === 'event' && i.eventId && ids.has(i.eventId)))
        return items.length === t.items.length ? t : { ...t, items, updatedAt: nowIso() }
      }),
    }
  },
  toggleFavorite(d: AppData, id: string): AppData {
    return {
      ...d,
      favorites: d.favorites.includes(id) ? d.favorites.filter((f) => f !== id) : [id, ...d.favorites],
    }
  },
  createTrip(d: AppData, input: TripInput, id = newId('trip')): AppData {
    const t = nowIso()
    const trip: Trip = { ...input, id, items: [], createdAt: t, updatedAt: t }
    return { ...d, trips: [...d.trips, trip], activeTripId: id }
  },
  updateTrip(d: AppData, id: string, input: TripInput): AppData {
    return { ...d, trips: d.trips.map((t) => (t.id === id ? { ...t, ...input, updatedAt: nowIso() } : t)) }
  },
  deleteTrip(d: AppData, id: string): AppData {
    const trips = d.trips.filter((t) => t.id !== id)
    return { ...d, trips, activeTripId: d.activeTripId === id ? (trips[0]?.id ?? null) : d.activeTripId }
  },
  mapTrip(d: AppData, tripId: string, fn: (t: Trip) => Trip): AppData {
    return { ...d, trips: d.trips.map((t) => (t.id === tripId ? { ...fn(t), updatedAt: nowIso() } : t)) }
  },
}

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

export interface AppStore {
  data: AppData
  /** 마지막 저장 실패 여부 (용량 초과 등) */
  saveError: boolean
  loadNotice: LoadNotice
  /** 백업하지 못한 손상 데이터 원문 (내려받기용) */
  corruptRaw: string | null
  dismissLoadNotice(): void

  getEvent(id: string): EventItem | undefined
  getTrip(id: string): Trip | undefined
  activeTrip: Trip | undefined

  /*
   * 변경 함수 규칙: 저장에 성공했을 때만 반영한다.
   * 저장에 실패하면 데이터는 그대로이고 null 또는 false 를 돌려준다 → 부르는 쪽은 성공 안내·화면 이동을 하지 않는다.
   */

  /**
   * 새 행사 등록. 반환: 저장된 행사, 저장 실패 시 null.
   * opts.id 를 주면 그 id 로 만든다. 같은 id 의 행사가 이미 있으면 새로 만들지 않고 그 행사를 갱신한다
   * (재시도·중복 클릭에도 행사가 하나만 생기도록).
   */
  addEvent(input: EventInput, opts?: { id?: string }): EventItem | null
  /** 반환: 저장 성공 여부 */
  updateEvent(id: string, input: EventInput): boolean
  /** 반환: 함께 제거된 일정 수, 저장 실패 시 null */
  deleteEvent(id: string): number | null
  isFavorite(id: string): boolean
  /** 반환: 바뀐 뒤 관심 여부, 저장 실패 시 null */
  toggleFavorite(id: string): boolean | null

  /** 반환: 만든 여행, 저장 실패 시 null */
  createTrip(input: TripInput): Trip | null
  updateTrip(id: string, input: TripInput): boolean
  deleteTrip(id: string): boolean
  setActiveTrip(id: string): boolean

  /** 반환: 추가한 일정, 저장 실패 시 null */
  addItineraryItem(tripId: string, item: Omit<ItineraryItem, 'id'>): ItineraryItem | null
  updateItineraryItem(tripId: string, itemId: string, patch: Partial<Omit<ItineraryItem, 'id'>>): boolean
  removeItineraryItem(tripId: string, itemId: string): boolean
  /** 같은 날짜 안에서 위(-1)/아래(+1)로 이동. 반환: 저장 성공 여부 (움직일 수 없으면 바뀐 것 없이 true) */
  moveItineraryItem(tripId: string, itemId: string, direction: -1 | 1): boolean

  /** 반환: 삭제된 샘플 행사 수, 저장 실패 시 null */
  deleteSamples(): number | null
  sampleCount: number
  /** 검증을 통과한 데이터로 전체 교체. 반환: 저장 성공 여부 */
  replaceAll(data: AppData): boolean
  /** 모든 데이터 초기화 (샘플·기본 여행 포함 처음 상태로). 반환: 저장 성공 여부 */
  resetAll(): boolean
}

const Ctx = createContext<AppStore | null>(null)

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(loadFromStorage)
  const [data, setData] = useState<AppData>(initial.data)
  const [loadNotice, setLoadNotice] = useState<LoadNotice>(initial.notice)
  const saveError = useSyncExternalStore(subscribeSaveStatus, () => saveStatus.failed)
  // 최신(=저장된) 값. 모든 변경은 commit → engine.apply 를 거쳐, 저장에 성공했을 때만 반영된다.
  const [engine] = useState(() => createDataEngine(initial.data))

  // 첫 화면 표시 때 한 번 저장 (처음 실행 시 샘플·기본 여행을 저장하고, 손상 데이터는 초기 상태로 교체).
  // 단, 백업에 실패한 손상 데이터는 사용자가 무언가 바꾸기 전까지 덮어쓰지 않는다.
  // 자식 화면의 effect(예: 주소로 연 여행을 활성 여행으로)가 먼저 commit 했을 수 있으므로 최신 값을 저장한다.
  useEffect(() => {
    if (initial.notice === 'corrupt_no_backup') return
    persist(engine.get())
  }, [initial, engine])

  // 다른 탭에서 변경된 경우 반영
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || e.newValue === null) return
      try {
        const res = validateAppData(JSON.parse(e.newValue))
        if (res.ok) {
          engine.adopt(res.data)
          setData(res.data)
        }
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [engine])

  /** 저장에 성공했을 때만 화면 상태에 반영. 반환: 저장 성공 여부 */
  const commit = useCallback(
    (next: AppData): boolean => {
      if (!engine.apply(next)) return false
      setData(next)
      return true
    },
    [engine],
  )

  const mapTrip = useCallback(
    (tripId: string, fn: (t: Trip) => Trip): boolean => commit(ops.mapTrip(engine.get(), tripId, fn)),
    [commit, engine],
  )

  const store = useMemo<AppStore>(() => {
    const d = data
    return {
      data: d,
      saveError,
      loadNotice,
      corruptRaw: initial.corruptRaw ?? null,
      dismissLoadNotice: () => setLoadNotice(null),
      getEvent: (id) => d.events.find((e) => e.id === id),
      getTrip: (id) => d.trips.find((t) => t.id === id),
      activeTrip: d.trips.find((t) => t.id === d.activeTripId) ?? d.trips[0],

      addEvent(input, opts) {
        const id = opts?.id ?? newId('evt')
        // 같은 id 가 이미 있으면(이전 시도가 저장됨) 새로 만들지 않고 갱신 → 행사는 항상 하나
        const next = ops.upsertEvent(engine.get(), input, id)
        if (!commit(next)) return null
        return next.events.find((e) => e.id === id) ?? null
      },
      updateEvent(id, input) {
        return commit(ops.updateEvent(engine.get(), id, input))
      },
      deleteEvent(id) {
        const cur = engine.get()
        const removed = cur.trips.reduce((n, t) => n + t.items.filter((i) => i.eventId === id).length, 0)
        return commit(ops.deleteEvents(cur, new Set([id]))) ? removed : null
      },
      isFavorite: (id) => d.favorites.includes(id),
      toggleFavorite(id) {
        const next = ops.toggleFavorite(engine.get(), id)
        return commit(next) ? next.favorites.includes(id) : null
      },

      createTrip(input) {
        const id = newId('trip')
        const next = ops.createTrip(engine.get(), input, id)
        if (!commit(next)) return null
        return next.trips.find((t) => t.id === id) ?? null
      },
      updateTrip(id, input) {
        return commit(ops.updateTrip(engine.get(), id, input))
      },
      deleteTrip(id) {
        return commit(ops.deleteTrip(engine.get(), id))
      },
      setActiveTrip(id) {
        return commit({ ...engine.get(), activeTripId: id })
      },

      addItineraryItem(tripId, item) {
        const created: ItineraryItem = { ...item, id: newId('item') }
        return mapTrip(tripId, (t) => ({ ...t, items: [...t.items, created] })) ? created : null
      },
      updateItineraryItem(tripId, itemId, patch) {
        return mapTrip(tripId, (t) => {
          const target = t.items.find((i) => i.id === itemId)
          if (!target) return t
          const updated = { ...target, ...patch }
          // 날짜가 바뀌면 새 날짜의 맨 뒤로 이동
          if (patch.date && patch.date !== target.date) {
            return { ...t, items: [...t.items.filter((i) => i.id !== itemId), updated] }
          }
          return { ...t, items: t.items.map((i) => (i.id === itemId ? updated : i)) }
        })
      },
      removeItineraryItem(tripId, itemId) {
        return mapTrip(tripId, (t) => ({ ...t, items: t.items.filter((i) => i.id !== itemId) }))
      },
      moveItineraryItem(tripId, itemId, direction) {
        return mapTrip(tripId, (t) => {
          const items = [...t.items]
          const idx = items.findIndex((i) => i.id === itemId)
          if (idx < 0) return t
          const date = items[idx].date
          // 같은 날짜의 이웃 항목 찾기
          let j = idx + direction
          while (j >= 0 && j < items.length && items[j].date !== date) j += direction
          if (j < 0 || j >= items.length) return t
          ;[items[idx], items[j]] = [items[j], items[idx]]
          return { ...t, items }
        })
      },

      sampleCount: d.events.filter((e) => e.isSample).length,
      deleteSamples() {
        const cur = engine.get()
        const ids = new Set(cur.events.filter((e) => e.isSample).map((e) => e.id))
        if (!ids.size) return 0
        return commit(ops.deleteEvents(cur, ids)) ? ids.size : null
      },
      replaceAll(next) {
        return commit(next)
      },
      resetAll() {
        return commit(createInitialData())
      },
    }
  }, [data, saveError, loadNotice, initial, engine, commit, mapTrip])

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export function useStore(): AppStore {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore must be used inside AppStoreProvider')
  return s
}
