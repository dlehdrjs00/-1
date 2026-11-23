import { afterEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEY } from '../constants'
import { emptyEventForm, eventToForm, type EventFormValues } from '../lib/eventForm'
import {
  DRAFT_KEY_PREFIX,
  clearAllEventDrafts,
  clearEventDraft,
  clearEventDraftsFor,
  draftKey,
  formatDraftSavedAt,
  isDraftStorageAvailable,
  loadEventDraft,
  pruneEventDrafts,
  sanitizeDraftValues,
  saveEventDraft,
  type DraftTarget,
} from '../lib/eventDraft'
import { createSampleEvents } from '../data/samples'

const NOW = new Date('2026-11-23T03:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000
const NEW: DraftTarget = { kind: 'new' }
const editOf = (eventId: string): DraftTarget => ({ kind: 'edit', eventId })

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

function useMemoryStorage(initial: Record<string, string> = {}) {
  const ls = memoryStorage(initial)
  vi.stubGlobal('localStorage', ls)
  return ls
}

function formWith(p: Partial<EventFormValues> = {}): EventFormValues {
  return { ...emptyEventForm(), ...p }
}

const [sample, sampleB] = createSampleEvents()

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('draftKey', () => {
  it('uses keys separate from the main data key, one per target', () => {
    expect(draftKey(NEW)).toBe('subcul-trip-planner:v1:draft:new')
    expect(draftKey(editOf('evt_1'))).toBe('subcul-trip-planner:v1:draft:edit:evt_1')
    expect(draftKey(editOf('a/b c'))).toBe(`subcul-trip-planner:v1:draft:edit:${encodeURIComponent('a/b c')}`)
    expect(draftKey(NEW)).not.toBe(STORAGE_KEY)
    expect(DRAFT_KEY_PREFIX.startsWith(`${STORAGE_KEY}:`)).toBe(true)
  })
})

describe('save / load / clear', () => {
  it('round-trips a new-event draft with the stored shape', () => {
    const ls = useMemoryStorage()
    const values = formWith({ title: '작성 중', works: ['genshin'], memo: '메모' })
    expect(saveEventDraft(NEW, values, null, NOW)).toBe(true)

    const stored = JSON.parse(ls.map.get(draftKey(NEW))!)
    expect(stored).toEqual({ v: 1, kind: 'new', eventId: null, baseUpdatedAt: null, savedAt: NOW.toISOString(), values })

    const loaded = loadEventDraft(NEW, emptyEventForm(), { now: NOW })
    expect(loaded).toEqual({ values, savedAt: NOW.toISOString(), baseUpdatedAt: null, eventChanged: false })
  })

  it('does not touch the main data key', () => {
    const ls = useMemoryStorage({ [STORAGE_KEY]: '{"keep":true}' })
    saveEventDraft(NEW, formWith({ title: 'x' }), null, NOW)
    clearAllEventDrafts()
    expect(ls.map.get(STORAGE_KEY)).toBe('{"keep":true}')
  })

  it('clearEventDraft removes only that target', () => {
    const ls = useMemoryStorage()
    saveEventDraft(NEW, formWith({ title: 'new' }), null, NOW)
    saveEventDraft(editOf(sample.id), { ...eventToForm(sample), title: 'edit' }, sample.updatedAt, NOW)
    clearEventDraft(NEW)
    expect(ls.map.has(draftKey(NEW))).toBe(false)
    expect(ls.map.has(draftKey(editOf(sample.id)))).toBe(true)
  })

  it('clearEventDraftsFor removes edit drafts of the given events only', () => {
    const ls = useMemoryStorage()
    saveEventDraft(NEW, formWith({ title: 'new' }), null, NOW)
    saveEventDraft(editOf(sample.id), { ...eventToForm(sample), title: 'A' }, sample.updatedAt, NOW)
    saveEventDraft(editOf(sampleB.id), { ...eventToForm(sampleB), title: 'B' }, sampleB.updatedAt, NOW)
    clearEventDraftsFor([sample.id])
    expect(ls.map.has(draftKey(editOf(sample.id)))).toBe(false)
    expect(ls.map.has(draftKey(editOf(sampleB.id)))).toBe(true)
    expect(ls.map.has(draftKey(NEW))).toBe(true)
  })

  it('clearAllEventDrafts removes every draft and nothing else', () => {
    const ls = useMemoryStorage({ other: '1' })
    saveEventDraft(NEW, formWith({ title: 'new' }), null, NOW)
    saveEventDraft(editOf('evt_1'), formWith({ title: 'e' }), 'x', NOW)
    saveEventDraft(editOf('evt_2'), formWith({ title: 'e' }), 'x', NOW)
    clearAllEventDrafts()
    expect(Array.from(ls.map.keys())).toEqual(['other'])
  })

  it('a draft equal to the initial values is dropped silently', () => {
    const ls = useMemoryStorage()
    saveEventDraft(NEW, emptyEventForm(), null, NOW)
    expect(loadEventDraft(NEW, emptyEventForm(), { now: NOW })).toBeNull()
    expect(ls.map.has(draftKey(NEW))).toBe(false)

    const initial = eventToForm(sample)
    saveEventDraft(editOf(sample.id), initial, sample.updatedAt, NOW)
    expect(loadEventDraft(editOf(sample.id), initial, { now: NOW, event: sample })).toBeNull()
    expect(ls.map.has(draftKey(editOf(sample.id)))).toBe(false)
  })
})

describe('kind / eventId separation', () => {
  it('an edit draft for A is never returned for B or for a new event', () => {
    useMemoryStorage()
    const a = { ...eventToForm(sample), title: 'A 수정 중' }
    saveEventDraft(editOf(sample.id), a, sample.updatedAt, NOW)

    expect(loadEventDraft(editOf(sampleB.id), eventToForm(sampleB), { now: NOW, event: sampleB })).toBeNull()
    expect(loadEventDraft(NEW, emptyEventForm(), { now: NOW })).toBeNull()
    expect(loadEventDraft(editOf(sample.id), eventToForm(sample), { now: NOW, event: sample })?.values.title).toBe('A 수정 중')
  })

  it('a new-event draft is never returned for an edit', () => {
    useMemoryStorage()
    saveEventDraft(NEW, formWith({ title: '새 행사 작성 중' }), null, NOW)
    expect(loadEventDraft(editOf(sample.id), eventToForm(sample), { now: NOW, event: sample })).toBeNull()
    expect(loadEventDraft(NEW, emptyEventForm(), { now: NOW })?.values.title).toBe('새 행사 작성 중')
  })

  it('checks the stored kind/eventId, not just the key', () => {
    const values = { ...eventToForm(sampleB), title: 'B 초안' }
    // B 의 초안이 A 의 키에 잘못 들어 있는 경우
    const wrong = { v: 1, kind: 'edit', eventId: sampleB.id, baseUpdatedAt: sampleB.updatedAt, savedAt: NOW.toISOString(), values }
    const ls = useMemoryStorage({
      [draftKey(editOf(sample.id))]: JSON.stringify(wrong),
      // 새 행사 키에 수정 초안이 들어 있는 경우
      [draftKey(NEW)]: JSON.stringify(wrong),
    })
    expect(loadEventDraft(editOf(sample.id), eventToForm(sample), { now: NOW, event: sample })).toBeNull()
    expect(loadEventDraft(NEW, emptyEventForm(), { now: NOW })).toBeNull()
    // 잘못 들어 있던 초안은 정리된다
    expect(ls.map.size).toBe(0)
  })

  it('event ids with special characters do not collide', () => {
    useMemoryStorage()
    saveEventDraft(editOf('a:b'), formWith({ title: 'colon' }), 't', NOW)
    saveEventDraft(editOf('a%3Ab'), formWith({ title: 'percent' }), 't', NOW)
    expect(loadEventDraft(editOf('a:b'), emptyEventForm(), { now: NOW, event: { updatedAt: 't' } })?.values.title).toBe('colon')
    expect(loadEventDraft(editOf('a%3Ab'), emptyEventForm(), { now: NOW, event: { updatedAt: 't' } })?.values.title).toBe('percent')
  })
})

describe('edit drafts and the current event', () => {
  it('flags a draft whose event was updated after the draft started', () => {
    useMemoryStorage()
    saveEventDraft(editOf(sample.id), { ...eventToForm(sample), memo: '초안 메모' }, sample.updatedAt, NOW)
    const same = loadEventDraft(editOf(sample.id), eventToForm(sample), { now: NOW, event: sample })
    expect(same?.eventChanged).toBe(false)

    const updated = { ...sample, updatedAt: '2026-11-23T05:00:00.000Z' }
    const changed = loadEventDraft(editOf(sample.id), eventToForm(updated), { now: NOW, event: updated })
    expect(changed?.eventChanged).toBe(true)
    expect(changed?.values.memo).toBe('초안 메모')
    expect(changed?.baseUpdatedAt).toBe(sample.updatedAt)
  })

  it('drops the draft when the event no longer exists', () => {
    const ls = useMemoryStorage()
    saveEventDraft(editOf('evt_gone'), formWith({ title: 'x' }), 't', NOW)
    expect(loadEventDraft(editOf('evt_gone'), emptyEventForm(), { now: NOW, event: null })).toBeNull()
    expect(ls.map.has(draftKey(editOf('evt_gone')))).toBe(false)
  })

  it('prune with eventExists drops edit drafts of deleted events but keeps the rest', () => {
    const ls = useMemoryStorage()
    saveEventDraft(NEW, formWith({ title: 'new' }), null, NOW)
    saveEventDraft(editOf('evt_alive'), formWith({ title: 'a' }), 't', NOW)
    saveEventDraft(editOf('evt_gone'), formWith({ title: 'g' }), 't', NOW)
    expect(pruneEventDrafts({ now: NOW, eventExists: (id) => id === 'evt_alive' })).toBe(1)
    expect(ls.map.has(draftKey(NEW))).toBe(true)
    expect(ls.map.has(draftKey(editOf('evt_alive')))).toBe(true)
    expect(ls.map.has(draftKey(editOf('evt_gone')))).toBe(false)
  })

  it('loadEventDraft also prunes drafts of other deleted events when eventExists is given', () => {
    const ls = useMemoryStorage()
    saveEventDraft(editOf('evt_gone'), formWith({ title: 'g' }), 't', NOW)
    saveEventDraft(NEW, formWith({ title: 'new' }), null, NOW)
    expect(loadEventDraft(NEW, emptyEventForm(), { now: NOW, eventExists: () => false })?.values.title).toBe('new')
    expect(ls.map.has(draftKey(editOf('evt_gone')))).toBe(false)
  })
})

describe('sanitizing', () => {
  const initial = emptyEventForm()

  it('keeps the initial value for wrong types, unknown keys and bad enum values', () => {
    const out = sanitizeDraftValues(
      {
        title: 42,
        works: ['genshin', 'not-a-work', 'genshin', 7],
        type: 'rave',
        reservationRequired: 'maybe',
        country: { nested: true },
        city: ['도쿄'],
        memo: '남길 메모',
        venue: null,
        injected: '<script>',
        __proto__: { polluted: true },
      },
      initial,
    )
    expect(out).toEqual({ ...initial, memo: '남길 메모' })
    expect(Object.keys(out)).toEqual(Object.keys(initial))
    expect((out as unknown as Record<string, unknown>).injected).toBeUndefined()
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('accepts valid works (deduped, unknown ids removed) and valid enum values', () => {
    const out = sanitizeDraftValues(
      { works: ['zzz', 'nope', 'zzz', 'other'], type: 'cafe', reservationRequired: 'required', timezone: 'Asia/Seoul' },
      initial,
    )
    expect(out.works).toEqual(['zzz', 'other'])
    expect(out.type).toBe('cafe')
    expect(out.reservationRequired).toBe('required')
    expect(out.timezone).toBe('Asia/Seoul')
  })

  it('returns the initial values for non-object input', () => {
    for (const raw of [null, undefined, 'x', 3, [], true]) expect(sanitizeDraftValues(raw, initial)).toEqual(initial)
  })

  it('works generically for other value shapes (strings, booleans, numbers, string arrays)', () => {
    const base = { a: '', b: false, c: 0, d: [] as string[] }
    expect(sanitizeDraftValues({ a: 'x', b: true, c: 5, d: ['p', 'p', 'q'] }, base)).toEqual({ a: 'x', b: true, c: 5, d: ['p', 'q'] })
    expect(sanitizeDraftValues({ a: 1, b: 'true', c: Number.NaN, d: [1] }, base)).toEqual(base)
  })

  it('an older-shape or junk draft cannot crash loading', () => {
    const junk = [
      'not json',
      '"string"',
      'null',
      '[]',
      JSON.stringify({ v: 2, kind: 'new', eventId: null, savedAt: NOW.toISOString(), values: {} }),
      JSON.stringify({ v: 1, kind: 'other', eventId: null, savedAt: NOW.toISOString(), values: {} }),
      JSON.stringify({ v: 1, kind: 'new', eventId: 'x', savedAt: NOW.toISOString(), values: { title: 'a' } }),
      JSON.stringify({ v: 1, kind: 'new', eventId: null, savedAt: 'yesterday', values: { title: 'a' } }),
      JSON.stringify({ v: 1, kind: 'new', eventId: null, savedAt: NOW.toISOString(), values: 'title' }),
      JSON.stringify({ v: 1, kind: 'new', eventId: null, savedAt: NOW.toISOString() }),
    ]
    for (const raw of junk) {
      const ls = useMemoryStorage({ [draftKey(NEW)]: raw })
      expect(loadEventDraft(NEW, emptyEventForm(), { now: NOW }), raw).toBeNull()
      expect(ls.map.has(draftKey(NEW)), raw).toBe(false)
      vi.unstubAllGlobals()
    }
  })

  it('an older-shape draft with partly known keys restores just those keys', () => {
    useMemoryStorage({
      [draftKey(NEW)]: JSON.stringify({
        v: 1,
        kind: 'new',
        eventId: null,
        baseUpdatedAt: null,
        savedAt: NOW.toISOString(),
        values: { title: '옛 초안', reservationStartAt: '2027-01-01T10:00' },
      }),
    })
    const loaded = loadEventDraft(NEW, emptyEventForm(), { now: NOW })
    expect(loaded?.values).toEqual({ ...emptyEventForm(), title: '옛 초안' })
  })
})

describe('pruning', () => {
  it('removes drafts older than 30 days, keeps recent ones', () => {
    const ls = useMemoryStorage()
    saveEventDraft(NEW, formWith({ title: 'old' }), null, new Date(NOW.getTime() - 31 * DAY))
    saveEventDraft(editOf('evt_recent'), formWith({ title: 'recent' }), 't', new Date(NOW.getTime() - 29 * DAY))
    expect(pruneEventDrafts({ now: NOW })).toBe(1)
    expect(ls.map.has(draftKey(NEW))).toBe(false)
    expect(ls.map.has(draftKey(editOf('evt_recent')))).toBe(true)
  })

  it('loading prunes expired drafts and does not return them', () => {
    const ls = useMemoryStorage()
    saveEventDraft(NEW, formWith({ title: 'old' }), null, new Date(NOW.getTime() - 40 * DAY))
    expect(loadEventDraft(NEW, emptyEventForm(), { now: NOW })).toBeNull()
    expect(ls.map.size).toBe(0)
  })

  it('removes unreadable drafts and drafts stored under the wrong key, but nothing outside the prefix', () => {
    const ls = useMemoryStorage({
      [STORAGE_KEY]: 'main data',
      [`${STORAGE_KEY}:corrupt-backup`]: 'backup',
      [`${DRAFT_KEY_PREFIX}edit:evt_1`]: 'broken',
      [`${DRAFT_KEY_PREFIX}edit:evt_2`]: JSON.stringify({
        v: 1,
        kind: 'edit',
        eventId: 'evt_3',
        baseUpdatedAt: 't',
        savedAt: NOW.toISOString(),
        values: { title: 'x' },
      }),
    })
    expect(pruneEventDrafts({ now: NOW })).toBe(2)
    expect(Array.from(ls.map.keys()).sort()).toEqual([STORAGE_KEY, `${STORAGE_KEY}:corrupt-backup`].sort())
  })
})

describe('storage failures never throw', () => {
  const throwing = () => {
    throw new Error('SecurityError')
  }

  it('storage that throws on every access', () => {
    vi.stubGlobal('localStorage', {
      getItem: throwing,
      setItem: throwing,
      removeItem: throwing,
      key: throwing,
      clear: throwing,
      get length(): number {
        throw new Error('SecurityError')
      },
    })
    expect(isDraftStorageAvailable()).toBe(false)
    expect(saveEventDraft(NEW, formWith({ title: 'x' }), null, NOW)).toBe(false)
    expect(loadEventDraft(NEW, emptyEventForm(), { now: NOW })).toBeNull()
    expect(() => clearEventDraft(NEW)).not.toThrow()
    expect(() => clearEventDraftsFor(['a'])).not.toThrow()
    expect(() => clearAllEventDrafts()).not.toThrow()
    expect(pruneEventDrafts({ now: NOW })).toBe(0)
  })

  it('accessing the localStorage global itself throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError')
      },
    })
    try {
      expect(isDraftStorageAvailable()).toBe(false)
      expect(saveEventDraft(NEW, formWith({ title: 'x' }), null, NOW)).toBe(false)
      expect(loadEventDraft(NEW, emptyEventForm(), { now: NOW })).toBeNull()
      expect(() => clearAllEventDrafts()).not.toThrow()
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage
    }
  })

  it('quota exceeded on save → false, existing drafts still readable', () => {
    const ls = useMemoryStorage()
    saveEventDraft(NEW, formWith({ title: '먼저 저장된 초안' }), null, NOW)
    ls.setItem = () => {
      throw new Error('QuotaExceededError')
    }
    expect(saveEventDraft(NEW, formWith({ title: '새 내용' }), null, NOW)).toBe(false)
    expect(isDraftStorageAvailable()).toBe(false)
    expect(loadEventDraft(NEW, emptyEventForm(), { now: NOW })?.values.title).toBe('먼저 저장된 초안')
  })

  it('no localStorage at all (non-browser)', () => {
    expect(typeof (globalThis as { localStorage?: unknown }).localStorage).toBe('undefined')
    expect(isDraftStorageAvailable()).toBe(false)
    expect(saveEventDraft(NEW, formWith({ title: 'x' }), null, NOW)).toBe(false)
    expect(loadEventDraft(NEW, emptyEventForm(), { now: NOW })).toBeNull()
  })
})

describe('formatDraftSavedAt', () => {
  it('formats in local time as M월 D일 HH:mm', () => {
    const d = new Date(2026, 0, 5, 7, 3) // 로컬 시각 기준
    expect(formatDraftSavedAt(d.toISOString())).toBe('1월 5일 07:03')
    const e = new Date(2026, 10, 23, 21, 45)
    expect(formatDraftSavedAt(e.toISOString())).toBe('11월 23일 21:45')
  })

  it('does not invent a time for an invalid value', () => {
    expect(formatDraftSavedAt('nope')).toBe('시각 확인 필요')
  })
})
