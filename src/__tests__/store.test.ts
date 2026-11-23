import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppData, EventInput, ItineraryItem, Trip, TripInput } from '../types'
import { STORAGE_BACKUP_KEY, STORAGE_KEY } from '../constants'
import { createInitialData } from '../data/initial'
import { loadFromStorage, ops } from '../store/AppStore'

const T0 = '2026-11-23T00:00:00.000Z'

function input(p: Partial<EventInput> = {}): EventInput {
  return {
    isSample: false,
    title: '새 행사',
    works: ['genshin'],
    type: 'popup',
    country: '일본',
    city: '도쿄',
    venue: '',
    address: '',
    startDate: '2027-01-01',
    endDate: '2027-01-31',
    timezone: 'Asia/Tokyo',
    reservationRequired: 'unknown',
    reservationStart: null,
    reservationEnd: null,
    officialUrl: '',
    reservationUrl: '',
    lastCheckedDate: null,
    memo: '',
    ...p,
  }
}

function tripInput(p: Partial<TripInput> = {}): TripInput {
  return {
    name: '오사카 여행',
    startDate: '2027-03-01',
    endDate: '2027-03-03',
    timezone: 'Asia/Tokyo',
    city: '오사카',
    accommodation: { name: '', address: '', memo: '' },
    ...p,
  }
}

function item(id: string, kind: 'event' | 'place', ref: string): ItineraryItem {
  return {
    id,
    date: '2027-01-09',
    kind,
    eventId: kind === 'event' ? ref : null,
    placeName: kind === 'place' ? ref : '',
    placeAddress: '',
    time: null,
    memo: '',
  }
}

function emptyData(): AppData {
  return { schemaVersion: 1, events: [], favorites: [], trips: [], activeTripId: null }
}

describe('ops', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(T0))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('addEvent prepends with id and timestamps, without mutating the input data', () => {
    const d0 = emptyData()
    const d1 = ops.addEvent(d0, input({ title: 'A' }), 'evt_a')
    const d2 = ops.addEvent(d1, input({ title: 'B' }), 'evt_b')
    expect(d0.events).toEqual([])
    expect(d2.events.map((e) => e.id)).toEqual(['evt_b', 'evt_a'])
    expect(d2.events[1]).toMatchObject({ id: 'evt_a', title: 'A', createdAt: T0, updatedAt: T0 })
  })

  it('addEvent generates an id when none is given', () => {
    const d = ops.addEvent(emptyData(), input())
    expect(d.events[0].id).toMatch(/^evt_/)
  })

  it('updateEvent replaces fields, keeps id and createdAt, bumps updatedAt', () => {
    const d1 = ops.addEvent(emptyData(), input({ title: 'A' }), 'evt_a')
    vi.setSystemTime(new Date('2026-11-24T09:00:00.000Z'))
    const d2 = ops.updateEvent(d1, 'evt_a', input({ title: 'A (수정)', city: '오사카' }))
    expect(d2.events[0]).toMatchObject({
      id: 'evt_a',
      title: 'A (수정)',
      city: '오사카',
      createdAt: T0,
      updatedAt: '2026-11-24T09:00:00.000Z',
    })
    expect(d1.events[0].title).toBe('A')
  })

  it('updateEvent leaves other events untouched and ignores unknown ids', () => {
    let d = ops.addEvent(emptyData(), input({ title: 'A' }), 'evt_a')
    d = ops.addEvent(d, input({ title: 'B' }), 'evt_b')
    const before = d.events.find((e) => e.id === 'evt_a')
    const d2 = ops.updateEvent(d, 'evt_b', input({ title: 'B2' }))
    expect(d2.events.find((e) => e.id === 'evt_a')).toBe(before)
    expect(ops.updateEvent(d, 'evt_none', input()).events).toEqual(d.events)
  })

  it('deleteEvents removes the events, their favorites and itinerary references only', () => {
    let d = emptyData()
    d = ops.addEvent(d, input({ title: 'A' }), 'evt_a')
    d = ops.addEvent(d, input({ title: 'B' }), 'evt_b')
    d = ops.addEvent(d, input({ title: 'C' }), 'evt_c')
    d = ops.createTrip(d, tripInput(), 'trip_1')
    d = ops.createTrip(d, tripInput({ name: '두 번째' }), 'trip_2')
    d = ops.mapTrip(d, 'trip_1', (t) => ({
      ...t,
      items: [item('i1', 'event', 'evt_a'), item('i2', 'place', '숙소'), item('i3', 'event', 'evt_c'), item('i4', 'event', 'evt_b')],
    }))
    d = ops.mapTrip(d, 'trip_2', (t) => ({ ...t, items: [item('j1', 'event', 'evt_c')] }))
    d = { ...d, favorites: ['evt_a', 'evt_c', 'evt_b'] }
    const trip2Before = d.trips[1]

    vi.setSystemTime(new Date('2026-11-25T00:00:00.000Z'))
    const out = ops.deleteEvents(d, new Set(['evt_a', 'evt_b']))
    expect(out.events.map((e) => e.id)).toEqual(['evt_c'])
    expect(out.favorites).toEqual(['evt_c'])
    expect(out.trips[0].items.map((i) => i.id)).toEqual(['i2', 'i3'])
    expect(out.trips[0].updatedAt).toBe('2026-11-25T00:00:00.000Z')
    // a trip with nothing removed keeps its identity
    expect(out.trips[1]).toBe(trip2Before)
  })

  it('toggleFavorite adds (to the front) and removes', () => {
    let d: AppData = { ...emptyData(), favorites: ['evt_x'] }
    d = ops.toggleFavorite(d, 'evt_a')
    expect(d.favorites).toEqual(['evt_a', 'evt_x'])
    d = ops.toggleFavorite(d, 'evt_a')
    expect(d.favorites).toEqual(['evt_x'])
  })

  it('createTrip appends an empty trip and makes it active', () => {
    const base = createInitialData()
    const d = ops.createTrip(base, tripInput(), 'trip_osaka')
    expect(d.trips.map((t) => t.id)).toEqual(['trip_tokyo_2027', 'trip_osaka'])
    expect(d.activeTripId).toBe('trip_osaka')
    expect(d.trips[1]).toMatchObject({ name: '오사카 여행', items: [], createdAt: T0, updatedAt: T0 })
  })

  it('updateTrip updates fields and keeps items', () => {
    let d = ops.createTrip(emptyData(), tripInput(), 'trip_1')
    d = ops.mapTrip(d, 'trip_1', (t) => ({ ...t, items: [item('i1', 'place', '숙소')] }))
    const d2 = ops.updateTrip(d, 'trip_1', tripInput({ name: '변경', endDate: '2027-03-05' }))
    expect(d2.trips[0]).toMatchObject({ name: '변경', endDate: '2027-03-05', createdAt: T0 })
    expect(d2.trips[0].items).toHaveLength(1)
  })

  it('deleteTrip moves activeTripId to the first remaining trip, or null', () => {
    let d = emptyData()
    d = ops.createTrip(d, tripInput({ name: '1' }), 'trip_1')
    d = ops.createTrip(d, tripInput({ name: '2' }), 'trip_2')
    d = ops.createTrip(d, tripInput({ name: '3' }), 'trip_3')
    expect(d.activeTripId).toBe('trip_3')

    // deleting a non-active trip keeps the active one
    const keep = ops.deleteTrip(d, 'trip_1')
    expect(keep.trips.map((t: Trip) => t.id)).toEqual(['trip_2', 'trip_3'])
    expect(keep.activeTripId).toBe('trip_3')

    // deleting the active trip falls back to the first remaining
    const moved = ops.deleteTrip(d, 'trip_3')
    expect(moved.activeTripId).toBe('trip_1')

    // deleting the last trip → null
    const only = ops.createTrip(emptyData(), tripInput(), 'solo')
    expect(ops.deleteTrip(only, 'solo')).toMatchObject({ trips: [], activeTripId: null })
  })

  it('mapTrip applies fn only to the target and bumps updatedAt', () => {
    let d = emptyData()
    d = ops.createTrip(d, tripInput(), 'trip_1')
    d = ops.createTrip(d, tripInput(), 'trip_2')
    vi.setSystemTime(new Date('2026-11-26T00:00:00.000Z'))
    const out = ops.mapTrip(d, 'trip_2', (t) => ({ ...t, city: '교토' }))
    expect(out.trips[0]).toBe(d.trips[0])
    expect(out.trips[1]).toMatchObject({ city: '교토', updatedAt: '2026-11-26T00:00:00.000Z' })
  })
})

/* ------------------------------------------------------------------ */
/* loadFromStorage (localStorage 를 메모리 구현으로 대체)                    */
/* ------------------------------------------------------------------ */

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial))
  return {
    map,
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size
    },
  }
}

function expectInitialShape(data: AppData) {
  expect(data.schemaVersion).toBe(1)
  expect(data.events.length).toBeGreaterThanOrEqual(10)
  expect(data.events.every((e) => e.isSample)).toBe(true)
  expect(data.favorites).toEqual([])
  expect(data.trips).toHaveLength(1)
  expect(data.trips[0]).toMatchObject({
    id: 'trip_tokyo_2027',
    startDate: '2027-01-09',
    endDate: '2027-01-13',
    timezone: 'Asia/Tokyo',
    items: [],
  })
  expect(data.activeTripId).toBe('trip_tokyo_2027')
}

describe('loadFromStorage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('empty storage → initial data (samples + default Tokyo trip), no notice', () => {
    const ls = memoryStorage()
    vi.stubGlobal('localStorage', ls)
    const { data, notice } = loadFromStorage()
    expect(notice).toBeNull()
    expectInitialShape(data)
    expect(ls.map.has(STORAGE_BACKUP_KEY)).toBe(false)
  })

  it('corrupt JSON → initial data, corrupt_reset notice, raw string backed up', () => {
    const raw = '{"schemaVersion":1,"events":[{"id":'
    const ls = memoryStorage({ [STORAGE_KEY]: raw })
    vi.stubGlobal('localStorage', ls)
    const { data, notice } = loadFromStorage()
    expect(notice).toBe('corrupt_reset')
    expectInitialShape(data)
    expect(ls.map.get(STORAGE_BACKUP_KEY)).toBe(raw)
    // the original key is not deleted by loading
    expect(ls.map.get(STORAGE_KEY)).toBe(raw)
  })

  it('valid JSON that fails validation is treated as corrupt too', () => {
    const raw = JSON.stringify({ schemaVersion: 99, events: [], favorites: [], trips: [] })
    const ls = memoryStorage({ [STORAGE_KEY]: raw })
    vi.stubGlobal('localStorage', ls)
    const { notice } = loadFromStorage()
    expect(notice).toBe('corrupt_reset')
    expect(ls.map.get(STORAGE_BACKUP_KEY)).toBe(raw)
  })

  it('valid stored data is returned as-is', () => {
    let saved = ops.createTrip(createInitialData(), tripInput(), 'trip_osaka')
    saved = ops.toggleFavorite(saved, 'sample_001')
    const ls = memoryStorage({ [STORAGE_KEY]: JSON.stringify(saved) })
    vi.stubGlobal('localStorage', ls)
    const { data, notice } = loadFromStorage()
    expect(notice).toBeNull()
    expect(data).toEqual(saved)
  })

  it('storage that throws on access (privacy mode) → initial data, no notice', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('SecurityError')
      },
    })
    const { data, notice } = loadFromStorage()
    expect(notice).toBeNull()
    expectInitialShape(data)
  })

  it('backup write failure (quota) resets with a distinct notice and keeps the raw original', () => {
    const ls = memoryStorage({ [STORAGE_KEY]: 'not json' })
    ls.setItem = () => {
      throw new Error('QuotaExceededError')
    }
    vi.stubGlobal('localStorage', ls)
    const { data, notice, corruptRaw } = loadFromStorage()
    expect(notice).toBe('corrupt_no_backup')
    expect(corruptRaw).toBe('not json')
    expectInitialShape(data)
  })
})
