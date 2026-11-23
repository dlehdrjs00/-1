/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AppData, EventInput, EventItem, ItineraryItem, Trip, TripInput } from '../types'
import { STORAGE_BACKUP_KEY, STORAGE_KEY } from '../constants'
import { createInitialData } from '../data/initial'
import { validateAppData } from '../lib/validate'
import { newId } from '../lib/id'

/* ------------------------------------------------------------------ */
/* 저장소 읽기/쓰기                                                      */
/* ------------------------------------------------------------------ */

export type LoadNotice = null | 'corrupt_reset'

export function loadFromStorage(): { data: AppData; notice: LoadNotice } {
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
    /* ignore */
  }
  return { data: createInitialData(), notice: 'corrupt_reset' }
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
  dismissLoadNotice(): void

  getEvent(id: string): EventItem | undefined
  getTrip(id: string): Trip | undefined
  activeTrip: Trip | undefined

  addEvent(input: EventInput): EventItem
  updateEvent(id: string, input: EventInput): void
  /** 반환: 삭제로 함께 제거된 일정 수 */
  deleteEvent(id: string): number
  isFavorite(id: string): boolean
  toggleFavorite(id: string): boolean // 반환: 토글 후 관심 여부

  createTrip(input: TripInput): Trip
  updateTrip(id: string, input: TripInput): void
  deleteTrip(id: string): void
  setActiveTrip(id: string): void

  addItineraryItem(tripId: string, item: Omit<ItineraryItem, 'id'>): ItineraryItem
  updateItineraryItem(tripId: string, itemId: string, patch: Partial<Omit<ItineraryItem, 'id'>>): void
  removeItineraryItem(tripId: string, itemId: string): void
  /** 같은 날짜 안에서 위(-1)/아래(+1)로 이동 */
  moveItineraryItem(tripId: string, itemId: string, direction: -1 | 1): void

  /** 반환: 삭제된 샘플 행사 수 */
  deleteSamples(): number
  sampleCount: number
  /** 검증을 통과한 데이터로 전체 교체 */
  replaceAll(data: AppData): void
  /** 모든 데이터 초기화 (샘플·기본 여행 포함 처음 상태로) */
  resetAll(): void
}

const Ctx = createContext<AppStore | null>(null)

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const initial = useRef<ReturnType<typeof loadFromStorage> | null>(null)
  if (initial.current === null) initial.current = loadFromStorage()

  const [data, setData] = useState<AppData>(initial.current.data)
  const [loadNotice, setLoadNotice] = useState<LoadNotice>(initial.current.notice)
  const [saveError, setSaveError] = useState(false)
  // 최신 값 참조 (콜백 안에서 동기적으로 결과를 돌려주기 위해)
  const dataRef = useRef(data)
  dataRef.current = data

  useEffect(() => {
    setSaveError(!saveToStorage(data))
  }, [data])

  // 다른 탭에서 변경된 경우 반영
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || e.newValue === null) return
      try {
        const res = validateAppData(JSON.parse(e.newValue))
        if (res.ok) setData(res.data)
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const commit = useCallback((next: AppData) => {
    dataRef.current = next
    setData(next)
  }, [])

  const mapTrip = useCallback(
    (tripId: string, fn: (t: Trip) => Trip) => commit(ops.mapTrip(dataRef.current, tripId, fn)),
    [commit],
  )

  const store = useMemo<AppStore>(() => {
    const d = data
    return {
      data: d,
      saveError,
      loadNotice,
      dismissLoadNotice: () => setLoadNotice(null),
      getEvent: (id) => d.events.find((e) => e.id === id),
      getTrip: (id) => d.trips.find((t) => t.id === id),
      activeTrip: d.trips.find((t) => t.id === d.activeTripId) ?? d.trips[0],

      addEvent(input) {
        const id = newId('evt')
        const next = ops.addEvent(dataRef.current, input, id)
        commit(next)
        return next.events.find((e) => e.id === id)!
      },
      updateEvent(id, input) {
        commit(ops.updateEvent(dataRef.current, id, input))
      },
      deleteEvent(id) {
        const cur = dataRef.current
        const removed = cur.trips.reduce((n, t) => n + t.items.filter((i) => i.eventId === id).length, 0)
        commit(ops.deleteEvents(cur, new Set([id])))
        return removed
      },
      isFavorite: (id) => d.favorites.includes(id),
      toggleFavorite(id) {
        const next = ops.toggleFavorite(dataRef.current, id)
        commit(next)
        return next.favorites.includes(id)
      },

      createTrip(input) {
        const id = newId('trip')
        const next = ops.createTrip(dataRef.current, input, id)
        commit(next)
        return next.trips.find((t) => t.id === id)!
      },
      updateTrip(id, input) {
        commit(ops.updateTrip(dataRef.current, id, input))
      },
      deleteTrip(id) {
        commit(ops.deleteTrip(dataRef.current, id))
      },
      setActiveTrip(id) {
        commit({ ...dataRef.current, activeTripId: id })
      },

      addItineraryItem(tripId, item) {
        const created: ItineraryItem = { ...item, id: newId('item') }
        mapTrip(tripId, (t) => ({ ...t, items: [...t.items, created] }))
        return created
      },
      updateItineraryItem(tripId, itemId, patch) {
        mapTrip(tripId, (t) => {
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
        mapTrip(tripId, (t) => ({ ...t, items: t.items.filter((i) => i.id !== itemId) }))
      },
      moveItineraryItem(tripId, itemId, direction) {
        mapTrip(tripId, (t) => {
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
        const cur = dataRef.current
        const ids = new Set(cur.events.filter((e) => e.isSample).map((e) => e.id))
        if (ids.size) commit(ops.deleteEvents(cur, ids))
        return ids.size
      },
      replaceAll(next) {
        commit(next)
      },
      resetAll() {
        commit(createInitialData())
      },
    }
  }, [data, saveError, loadNotice, commit, mapTrip])

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export function useStore(): AppStore {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore must be used inside AppStoreProvider')
  return s
}
