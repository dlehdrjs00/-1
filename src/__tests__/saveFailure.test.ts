import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppData, EventInput } from '../types'
import { STORAGE_KEY } from '../constants'
import { createInitialData } from '../data/initial'
import {
  SAVE_FAILED_MESSAGE,
  createDataEngine,
  getSaveFailed,
  loadFromStorage,
  ops,
  persist,
} from '../store/AppStore'
import { draftKey, isDraftStorageAvailable, loadEventDraft, saveEventDraft, type DraftTarget } from '../lib/eventDraft'
import { emptyEventForm, formToEventInput, type EventFormValues } from '../lib/eventForm'

/*
 * 저장 실패 처리 (트랜잭션 저장) 회귀 테스트.
 * - persist() 는 성공 여부를 돌려주고 저장 실패 안내 상태(getSaveFailed)를 갱신한다.
 * - createDataEngine 은 저장에 성공했을 때만 데이터를 바꾼다 → 실패 후 재시도해도 중복이 생기지 않는다.
 * - 앱 본문 키(STORAGE_KEY)만 실패하고 초안 키는 정상인 상황에서 초안이 지워지지 않는다.
 */

const T0 = '2026-11-23T00:00:00.000Z'
const NEW: DraftTarget = { kind: 'new' }

function emptyData(): AppData {
  return { schemaVersion: 1, events: [], favorites: [], trips: [], activeTripId: null }
}

function input(p: Partial<EventInput> = {}): EventInput {
  return {
    isSample: false,
    title: '[샘플] 가상 팝업',
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

/**
 * 메모리 localStorage. failMain 이면 앱 본문 키(STORAGE_KEY)의 setItem 만 실패하고,
 * failAll 이면 모든 setItem 이 실패한다 (용량 초과 흉내).
 */
function controllableStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial))
  const state = { failMain: false, failAll: false, setCalls: [] as string[] }
  return {
    map,
    state,
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      state.setCalls.push(k)
      if (state.failAll || (state.failMain && k === STORAGE_KEY)) {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      }
      map.set(k, String(v))
    },
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size
    },
  }
}

type Ls = ReturnType<typeof controllableStorage>

function useStorage(initial: Record<string, string> = {}): Ls {
  const ls = controllableStorage(initial)
  vi.stubGlobal('localStorage', ls)
  return ls
}

const stored = (ls: Ls): AppData | null => {
  const raw = ls.map.get(STORAGE_KEY)
  return raw === undefined ? null : (JSON.parse(raw) as AppData)
}

/* 저장 실패 안내 상태는 모듈 전역이므로 매 테스트 전에 '성공' 상태로 되돌린다 */
beforeEach(() => {
  vi.stubGlobal('localStorage', controllableStorage())
  persist(emptyData())
  expect(getSaveFailed()).toBe(false)
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('SAVE_FAILED_MESSAGE', () => {
  it('is the shared Korean failure sentence (e2e and toasts depend on it)', () => {
    expect(SAVE_FAILED_MESSAGE).toBe('저장하지 못했어요. 브라우저 저장 공간을 확인한 뒤 다시 시도해 주세요.')
  })
})

describe('persist / getSaveFailed', () => {
  it('returns true and writes the data as JSON to the main key on success', () => {
    const ls = useStorage()
    const data = ops.addEvent(emptyData(), input(), 'evt_a')
    expect(persist(data)).toBe(true)
    expect(getSaveFailed()).toBe(false)
    expect(stored(ls)).toEqual(data)
  })

  it('returns false and flips getSaveFailed() when setItem throws, leaving the stored value untouched', () => {
    const ls = useStorage()
    const before = ops.addEvent(emptyData(), input({ title: 'before' }), 'evt_before')
    expect(persist(before)).toBe(true)

    ls.state.failMain = true
    const next = ops.addEvent(before, input({ title: 'next' }), 'evt_next')
    expect(persist(next)).toBe(false)
    expect(getSaveFailed()).toBe(true)
    expect(stored(ls)).toEqual(before)
  })

  it('flips getSaveFailed() back to false after a later successful save', () => {
    const ls = useStorage()
    ls.state.failMain = true
    expect(persist(emptyData())).toBe(false)
    expect(persist(emptyData())).toBe(false)
    expect(getSaveFailed()).toBe(true)

    ls.state.failMain = false
    expect(persist(emptyData())).toBe(true)
    expect(getSaveFailed()).toBe(false)
  })

  it('never throws, even when localStorage is missing or every access throws (privacy mode)', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(() => persist(emptyData())).not.toThrow()
    expect(persist(emptyData())).toBe(false)
    expect(getSaveFailed()).toBe(true)

    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('SecurityError')
      },
    })
    expect(persist(emptyData())).toBe(false)
    expect(getSaveFailed()).toBe(true)
  })
})

describe('createDataEngine (save injected)', () => {
  function fakeSave(results: boolean[] = []) {
    const calls: AppData[] = []
    const fn = vi.fn((d: AppData) => {
      calls.push(d)
      return results.length ? results.shift()! : true
    })
    return { fn, calls }
  }

  it('get() returns the initial data without saving', () => {
    const initial = emptyData()
    const save = fakeSave()
    const engine = createDataEngine(initial, save.fn)
    expect(engine.get()).toBe(initial)
    expect(save.fn).not.toHaveBeenCalled()
  })

  it('apply() saves first and updates get() only on success', () => {
    const initial = emptyData()
    const save = fakeSave([true])
    const engine = createDataEngine(initial, save.fn)
    const next = ops.addEvent(initial, input(), 'evt_a')
    expect(engine.apply(next)).toBe(true)
    expect(save.calls).toEqual([next])
    expect(engine.get()).toBe(next)
  })

  it('apply() failure returns false and leaves get() unchanged (same reference)', () => {
    const initial = emptyData()
    const save = fakeSave([false])
    const engine = createDataEngine(initial, save.fn)
    const next = ops.addEvent(initial, input(), 'evt_a')
    expect(engine.apply(next)).toBe(false)
    expect(save.fn).toHaveBeenCalledTimes(1)
    expect(engine.get()).toBe(initial)
  })

  it('apply(sameObject) is a no-op that returns true without saving', () => {
    const initial = emptyData()
    const save = fakeSave([false])
    const engine = createDataEngine(initial, save.fn)
    expect(engine.apply(initial)).toBe(true)
    expect(engine.apply(engine.get())).toBe(true)
    expect(save.fn).not.toHaveBeenCalled()
  })

  it('adopt() replaces the data without saving; applying the adopted object afterwards is a no-op', () => {
    const save = fakeSave()
    const engine = createDataEngine(emptyData(), save.fn)
    const fromOtherTab = ops.addEvent(emptyData(), input(), 'evt_tab')
    engine.adopt(fromOtherTab)
    expect(engine.get()).toBe(fromOtherTab)
    expect(engine.apply(fromOtherTab)).toBe(true)
    expect(save.fn).not.toHaveBeenCalled()
  })

  it('a failed change followed by a successful retry yields exactly the intended data (no duplication)', () => {
    // AppStore 처럼 매번 engine.get() 에서 새로 계산한다. id 가 매번 새로 생기는 addEvent 라도 하나만 남아야 한다
    const initial = createInitialData()
    const save = fakeSave([false, false, true])
    const engine = createDataEngine(initial, save.fn)
    const attempt = () => engine.apply(ops.addEvent(engine.get(), input({ title: '재시도 행사' })))

    expect(attempt()).toBe(false)
    expect(attempt()).toBe(false)
    expect(engine.get()).toBe(initial)
    expect(attempt()).toBe(true)

    const d = engine.get()
    expect(d.events).toHaveLength(initial.events.length + 1)
    expect(d.events.filter((e) => e.title === '재시도 행사')).toHaveLength(1)
    // 저장된 것과 화면 데이터가 같다
    expect(save.calls.at(-1)).toBe(d)
  })

  it('a non-idempotent toggle that fails twice and then succeeds is applied exactly once', () => {
    const initial = emptyData()
    const save = fakeSave([false, false, true])
    const engine = createDataEngine(initial, save.fn)
    const toggle = () => engine.apply(ops.toggleFavorite(engine.get(), 'evt_x'))
    expect(toggle()).toBe(false)
    expect(toggle()).toBe(false)
    expect(engine.get().favorites).toEqual([])
    expect(toggle()).toBe(true)
    expect(engine.get().favorites).toEqual(['evt_x'])
  })
})

describe('createDataEngine (default save = persist, real storage)', () => {
  it('writes through persist and keeps state equal to what is stored when a save fails', () => {
    const ls = useStorage()
    const engine = createDataEngine(emptyData())

    const d1 = ops.addEvent(engine.get(), input({ title: '첫 행사' }), 'evt_1')
    expect(engine.apply(d1)).toBe(true)
    expect(stored(ls)).toEqual(d1)
    expect(getSaveFailed()).toBe(false)

    ls.state.failMain = true
    const d2 = ops.addEvent(engine.get(), input({ title: '두 번째' }), 'evt_2')
    expect(engine.apply(d2)).toBe(false)
    expect(getSaveFailed()).toBe(true)
    expect(engine.get()).toBe(d1)
    expect(stored(ls)).toEqual(d1)

    ls.state.failMain = false
    expect(engine.apply(ops.addEvent(engine.get(), input({ title: '두 번째' }), 'evt_2'))).toBe(true)
    expect(getSaveFailed()).toBe(false)
    expect(stored(ls)!.events.map((e) => e.id)).toEqual(['evt_2', 'evt_1'])
    expect(stored(ls)).toEqual(engine.get())
  })
})

describe('engine.apply(ops.upsertEvent(...)) retry', () => {
  it('fails then succeeds → exactly one event with that id, also after reloading from storage', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(T0))
    const ls = useStorage()
    const initial = createInitialData()
    expect(persist(initial)).toBe(true)
    const engine = createDataEngine(initial)
    const id = 'evt_fixed_for_this_form'
    const save = () => engine.apply(ops.upsertEvent(engine.get(), input({ title: '[샘플] 재시도 행사' }), id))

    ls.state.failMain = true
    expect(save()).toBe(false)
    expect(engine.get().events.some((e) => e.id === id)).toBe(false)
    expect(stored(ls)!.events.some((e) => e.id === id)).toBe(false)

    ls.state.failMain = false
    vi.setSystemTime(new Date('2026-11-23T00:05:00.000Z'))
    expect(save()).toBe(true)
    expect(engine.get().events.filter((e) => e.id === id)).toHaveLength(1)
    expect(engine.get().events).toHaveLength(initial.events.length + 1)

    // 새로고침 흉내: 저장소에서 다시 읽어도 정확히 하나
    const reloaded = loadFromStorage()
    expect(reloaded.notice).toBeNull()
    expect(reloaded.data.events.filter((e) => e.id === id)).toHaveLength(1)
    expect(reloaded.data.events).toHaveLength(initial.events.length + 1)
    expect(reloaded.data.events.find((e) => e.id === id)).toMatchObject({
      title: '[샘플] 재시도 행사',
      createdAt: '2026-11-23T00:05:00.000Z',
    })
  })

  it('repeating a save that already succeeded (double click / retry) updates instead of duplicating', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(T0))
    useStorage()
    const engine = createDataEngine(emptyData())
    const id = 'evt_double'
    for (let i = 0; i < 3; i++) {
      vi.setSystemTime(new Date(Date.parse(T0) + i * 1000))
      expect(engine.apply(ops.upsertEvent(engine.get(), input({ title: `저장 ${i}` }), id))).toBe(true)
    }
    const hits = loadFromStorage().data.events.filter((e) => e.id === id)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ title: '저장 2', createdAt: T0, updatedAt: '2026-11-23T00:00:02.000Z' })
  })

  it('an event with the same id adopted from another tab is updated, not duplicated', () => {
    useStorage()
    const engine = createDataEngine(emptyData())
    const id = 'evt_other_tab'
    engine.adopt(ops.addEvent(emptyData(), input({ title: '다른 탭' }), id))
    expect(engine.apply(ops.upsertEvent(engine.get(), input({ title: '이 탭' }), id))).toBe(true)
    expect(engine.get().events).toHaveLength(1)
    expect(engine.get().events[0]).toMatchObject({ id, title: '이 탭' })
  })
})

describe('only the main data key fails; draft keys keep working', () => {
  const NOW = new Date('2026-11-23T03:00:00.000Z')
  const form = (p: Partial<EventFormValues> = {}): EventFormValues => ({
    ...emptyEventForm(),
    title: '[샘플] 가상 콜라보 카페',
    works: ['starrail'],
    country: '일본',
    city: '오사카',
    startDate: '2027-02-01',
    endDate: '2027-02-28',
    ...p,
  })

  it('main save fails while the draft save succeeds; the draft survives the failure and the retry saves once', () => {
    const ls = useStorage()
    const initial = createInitialData()
    expect(persist(initial)).toBe(true)
    const engine = createDataEngine(initial)

    // 1) 초안을 먼저 정상 저장
    expect(saveEventDraft(NEW, form(), null, NOW)).toBe(true)
    expect(ls.map.has(draftKey(NEW))).toBe(true)

    // 2) 앱 본문 키만 실패
    ls.state.failMain = true
    expect(isDraftStorageAvailable()).toBe(true)
    const id = 'evt_form_session'
    const values = form({ memo: '저장 직전에 고친 메모' })
    expect(saveEventDraft(NEW, values, null, NOW)).toBe(true)
    const submit = () => engine.apply(ops.upsertEvent(engine.get(), formToEventInput(values, false), id))
    expect(submit()).toBe(false)
    expect(getSaveFailed()).toBe(true)
    expect(ls.state.setCalls).toContain(STORAGE_KEY)

    // 본문은 그대로, 초안은 남아 있고 최신 입력값으로 복원된다
    expect(stored(ls)).toEqual(initial)
    expect(engine.get()).toBe(initial)
    const draft = loadEventDraft(NEW, emptyEventForm(), { now: NOW })
    expect(draft).not.toBeNull()
    expect(draft!.values).toEqual(values)

    // 3) 복구 후 재시도 → 정확히 한 번 저장, 새로고침 뒤에도 유지
    ls.state.failMain = false
    expect(submit()).toBe(true)
    expect(getSaveFailed()).toBe(false)
    expect(submit()).toBe(true) // 성공 후 한 번 더 눌러도 중복 없음
    const reloaded = loadFromStorage()
    expect(reloaded.data.events.filter((e) => e.id === id)).toHaveLength(1)
    expect(reloaded.data.events).toHaveLength(initial.events.length + 1)
    expect(reloaded.data.events.find((e) => e.id === id)).toMatchObject({
      title: '[샘플] 가상 콜라보 카페',
      city: '오사카',
      memo: '저장 직전에 고친 메모',
    })
  })

  it('when every key fails, both the main save and the draft save report false without throwing', () => {
    const ls = useStorage()
    ls.state.failAll = true
    expect(() => saveEventDraft(NEW, form(), null, NOW)).not.toThrow()
    expect(saveEventDraft(NEW, form(), null, NOW)).toBe(false)
    expect(isDraftStorageAvailable()).toBe(false)
    expect(persist(emptyData())).toBe(false)
    expect(getSaveFailed()).toBe(true)
  })
})

describe('dropSaveFailureToast (저장이 되살아나면 낡은 저장 실패 알림만 지운다)', () => {
  it('removes only an error toast that carries the save-failure message', async () => {
    const { dropSaveFailureToast, EMPTY_TOASTS } = await import('../components/ui')
    const saveErr = { id: 1, kind: 'error' as const, message: `${SAVE_FAILED_MESSAGE} 행사는 삭제되지 않았어요.` }
    const otherErr = { id: 2, kind: 'error' as const, message: '내보내기 파일을 만들지 못했어요.' }
    const note = { id: 3, kind: 'success' as const, message: '저장했어요' }
    expect(dropSaveFailureToast({ note, error: saveErr })).toEqual({ note, error: null })
    const keep = { note, error: otherErr }
    expect(dropSaveFailureToast(keep)).toBe(keep)
    expect(dropSaveFailureToast(EMPTY_TOASTS)).toBe(EMPTY_TOASTS)
  })
})
