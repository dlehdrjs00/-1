import { describe, expect, it } from 'vitest'
import type { AppData, EventItem, ItineraryItem, Trip } from '../types'
import { createInitialData } from '../data/initial'
import { toExportPayload, validateAppData } from '../lib/validate'

const T = '2026-11-23T00:00:00.000Z'

function makeEvent(p: Partial<EventItem> = {}): EventItem {
  return {
    id: 'evt_1',
    isSample: false,
    title: '테스트 행사',
    works: ['starrail'],
    type: 'cafe',
    country: '일본',
    city: '도쿄',
    venue: '테스트 장소',
    address: '테스트 주소',
    startDate: '2026-12-20',
    endDate: '2027-01-31',
    timezone: 'Asia/Tokyo',
    reservationRequired: 'required',
    reservationStart: '2026-12-01T18:00',
    reservationEnd: '2027-01-30T23:59',
    officialUrl: '',
    reservationUrl: '',
    lastCheckedDate: '2026-11-20',
    memo: '',
    createdAt: T,
    updatedAt: T,
    ...p,
  }
}

function makeItem(p: Partial<ItineraryItem> = {}): ItineraryItem {
  return {
    id: 'item_1',
    date: '2027-01-09',
    kind: 'event',
    eventId: 'evt_1',
    placeName: '',
    placeAddress: '',
    time: '10:00',
    memo: '',
    ...p,
  }
}

function makeTrip(p: Partial<Trip> = {}): Trip {
  return {
    id: 'trip_1',
    name: '도쿄 여행',
    startDate: '2027-01-09',
    endDate: '2027-01-13',
    timezone: 'Asia/Tokyo',
    city: '도쿄',
    accommodation: { name: '숙소', address: '', memo: '' },
    items: [makeItem()],
    createdAt: T,
    updatedAt: T,
    ...p,
  }
}

function makeData(p: Partial<AppData> = {}): AppData {
  return {
    schemaVersion: 1,
    events: [makeEvent()],
    favorites: ['evt_1'],
    trips: [makeTrip()],
    activeTripId: 'trip_1',
    ...p,
  }
}

/** JSON 왕복 후 검증 (실제 가져오기와 같은 경로) */
function roundTrip(v: unknown) {
  return validateAppData(JSON.parse(JSON.stringify(v)))
}

function expectErrors(v: unknown): string[] {
  const res = roundTrip(v)
  expect(res.ok).toBe(false)
  return res.ok ? [] : res.errors
}

describe('validateAppData — accepts valid data', () => {
  it('round-trips the initial data through the export payload', () => {
    const data = createInitialData()
    const payload = toExportPayload(data)
    expect(payload.app).toBe('subcul-trip-planner')
    expect(typeof payload.exportedAt).toBe('string')

    const res = validateAppData(JSON.parse(JSON.stringify(payload)))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data).toEqual(data)
  })

  it('round-trips hand-built data with favorites and itinerary', () => {
    const data = makeData({
      trips: [
        makeTrip({
          items: [
            makeItem(),
            makeItem({ id: 'item_2', kind: 'place', eventId: null, placeName: '숙소 체크인', time: null }),
          ],
        }),
      ],
    })
    const res = roundTrip(toExportPayload(data))
    expect(res).toEqual({ ok: true, data })
  })

  it('accepts data without the app marker (e.g. raw localStorage value)', () => {
    expect(roundTrip(makeData()).ok).toBe(true)
  })

  it("normalizes '' dates/times to null", () => {
    const res = roundTrip(
      makeData({ events: [makeEvent({ startDate: '' as never, reservationStart: '' as never, lastCheckedDate: '' as never })] }),
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.events[0].startDate).toBeNull()
    expect(res.data.events[0].reservationStart).toBeNull()
    expect(res.data.events[0].lastCheckedDate).toBeNull()
  })

  it('falls back activeTripId to the first trip when it points nowhere', () => {
    const res = roundTrip(makeData({ activeTripId: 'trip_missing' }))
    expect(res.ok && res.data.activeTripId).toBe('trip_1')
    const res2 = roundTrip(makeData({ trips: [], activeTripId: 'trip_1', favorites: [] }))
    expect(res2.ok && res2.data.activeTripId).toBeNull()
  })
})

describe('validateAppData — rejects', () => {
  it('non-objects', () => {
    for (const v of [null, undefined, 42, 'text', [], [makeData()], true]) {
      const res = validateAppData(v)
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.errors[0]).toContain('JSON 객체')
    }
  })

  it('wrong or missing schemaVersion', () => {
    for (const v of [2, '1', 0]) {
      const errs = expectErrors({ ...makeData(), schemaVersion: v })
      expect(errs[0]).toContain('지원하지 않는 버전의 백업 파일')
      expect(errs[0]).not.toContain('undefined')
    }
    expect(expectErrors({ ...makeData(), schemaVersion: undefined })[0]).toBe('이 앱에서 내보낸 백업 파일이 아니에요.')
  })

  it('a different app marker', () => {
    const errs = expectErrors({ ...toExportPayload(makeData()), app: 'some-other-app' })
    expect(errs).toEqual(['다른 앱에서 내보낸 파일로 보입니다.'])
  })

  it('events / favorites / trips not arrays', () => {
    expect(expectErrors({ ...makeData(), events: {} })).toContain('행사 목록(events)이 배열이 아닙니다.')
    expect(expectErrors({ ...makeData(), favorites: 'evt_1' })).toContain('관심 목록(favorites)이 배열이 아닙니다.')
    expect(expectErrors({ ...makeData(), trips: null })).toContain('여행 목록(trips)이 배열이 아닙니다.')
  })

  it('event with a bad date format', () => {
    for (const bad of ['2027/01/09', '2027-1-9', '2027-02-30', 20270109]) {
      const errs = expectErrors(makeData({ events: [makeEvent({ startDate: bad as never })] }))
      expect(errs.some((e) => e.includes('날짜 형식'))).toBe(true)
    }
    const errs = expectErrors(makeData({ events: [makeEvent({ lastCheckedDate: '11/20' })] }))
    expect(errs.some((e) => e.includes('마지막 확인 날짜'))).toBe(true)
  })

  it('event with start date after end date', () => {
    const errs = expectErrors(makeData({ events: [makeEvent({ startDate: '2027-02-01', endDate: '2027-01-31' })] }))
    expect(errs.some((e) => e.includes('시작일이 종료일보다 늦습니다'))).toBe(true)
  })

  it('event with a bad reservation time format', () => {
    for (const bad of ['2026-12-01 18:00', '2026-12-01T18:00:00', '2026-12-01T25:00', '2026-12-01']) {
      const errs = expectErrors(makeData({ events: [makeEvent({ reservationStart: bad })] }))
      expect(errs.some((e) => e.includes('예약 시각 형식'))).toBe(true)
    }
  })

  it('event with a bad timezone', () => {
    for (const tz of ['Tokyo', 'Asia/Nowhere', '', 9]) {
      const errs = expectErrors(makeData({ events: [makeEvent({ timezone: tz as never })] }))
      expect(errs.some((e) => e.includes('시간대'))).toBe(true)
    }
  })

  it('event with an unknown work id / bad works', () => {
    expect(
      expectErrors(makeData({ events: [makeEvent({ works: ['genshin', 'not_a_work' as never] })] })).some((e) =>
        e.includes('관련 작품'),
      ),
    ).toBe(true)
    expect(
      expectErrors(makeData({ events: [makeEvent({ works: 'genshin' as never })] })).some((e) => e.includes('관련 작품')),
    ).toBe(true)
  })

  it('event with unknown type / reservationRequired / missing id or title / non-object', () => {
    expect(expectErrors(makeData({ events: [makeEvent({ type: 'party' as never })] })).some((e) => e.includes('행사 유형'))).toBe(
      true,
    )
    expect(
      expectErrors(makeData({ events: [makeEvent({ reservationRequired: 'yes' as never })] })).some((e) =>
        e.includes('예약 필요 여부'),
      ),
    ).toBe(true)
    expect(
      expectErrors(makeData({ events: [makeEvent({ id: '' })], favorites: [], trips: [] })).some((e) => e.includes('id가 없습니다')),
    ).toBe(true)
    expect(expectErrors(makeData({ events: [makeEvent({ title: '   ' })] })).some((e) => e.includes('행사명이 없습니다'))).toBe(
      true,
    )
    expect(expectErrors({ ...makeData(), events: ['oops'] }).some((e) => e.includes('객체 형식이 아닙니다'))).toBe(true)
  })

  it('duplicate event ids', () => {
    const errs = expectErrors(makeData({ events: [makeEvent(), makeEvent({ title: '다른 행사' })] }))
    expect(errs).toContain("행사 id 'evt_1'가 중복됩니다.")
  })

  it('duplicate trip ids', () => {
    const errs = expectErrors(makeData({ trips: [makeTrip(), makeTrip({ name: '다른 여행' })] }))
    expect(errs).toContain("여행 id 'trip_1'가 중복됩니다.")
  })

  it('trip with a bad itinerary time', () => {
    for (const bad of ['25:00', '9:00', '10:00:00', 1000]) {
      const errs = expectErrors(makeData({ trips: [makeTrip({ items: [makeItem({ time: bad as never })] })] }))
      expect(errs.some((e) => e.includes('방문 시각 형식'))).toBe(true)
    }
  })

  it('trip with bad dates / reversed dates / bad timezone / missing items', () => {
    expect(expectErrors(makeData({ trips: [makeTrip({ startDate: '2027-1-9' })] })).some((e) => e.includes('여행 날짜 형식'))).toBe(
      true,
    )
    expect(
      expectErrors(makeData({ trips: [makeTrip({ startDate: '2027-01-14' })] })).some((e) => e.includes('시작일이 종료일보다')),
    ).toBe(true)
    expect(expectErrors(makeData({ trips: [makeTrip({ timezone: 'Asia/Nowhere' })] })).some((e) => e.includes('시간대'))).toBe(true)
    expect(
      expectErrors(makeData({ trips: [makeTrip({ items: undefined as never })] })).some((e) => e.includes('일정 목록(items)')),
    ).toBe(true)
    expect(expectErrors(makeData({ trips: [makeTrip({ name: '' })] })).some((e) => e.includes('여행 이름'))).toBe(true)
  })

  it('itinerary items with bad kind / date / missing eventId / empty placeName', () => {
    const bad = (p: Partial<ItineraryItem>) => expectErrors(makeData({ trips: [makeTrip({ items: [makeItem(p)] })] }))
    expect(bad({ kind: 'hotel' as never }).some((e) => e.includes('일정 종류'))).toBe(true)
    expect(bad({ date: '2027-01-32' }).some((e) => e.includes('날짜 형식'))).toBe(true)
    expect(bad({ eventId: null }).some((e) => e.includes('연결된 행사 id'))).toBe(true)
    expect(bad({ kind: 'place', eventId: null, placeName: '  ' }).some((e) => e.includes('장소명'))).toBe(true)
  })

  it('caps the error list at 8 + a summary line', () => {
    const events = Array.from({ length: 12 }, (_, i) => makeEvent({ id: `evt_${i}`, type: 'bad' as never }))
    const errs = expectErrors(makeData({ events, favorites: [], trips: [] }))
    expect(errs).toHaveLength(9)
    expect(errs[8]).toBe('그 외 오류 4건')
  })

  it('does not add a summary line when there are 8 or fewer errors', () => {
    const events = Array.from({ length: 8 }, (_, i) => makeEvent({ id: `evt_${i}`, type: 'bad' as never }))
    const errs = expectErrors(makeData({ events, favorites: [], trips: [] }))
    expect(errs).toHaveLength(8)
    expect(errs.some((e) => e.startsWith('그 외 오류'))).toBe(false)
  })
})

/*
 * 알려진 검증 누락 (shared logic 버그 — 여기서 고치지 않음, 리드에게 보고).
 * it.fails: 현재 동작이 기대와 다르다는 것을 기록. 로직이 고쳐지면 이 테스트가 실패하므로 it 로 바꾸면 된다.
 */
describe('validateAppData — previously known gaps (fixed)', () => {
  // BUG: validateTrip/validateAppData 는 일정 항목 id 중복을 검사하지 않는다.
  // AppStore 의 updateItineraryItem / removeItineraryItem / moveItineraryItem 은 item id 로 찾으므로
  // 중복 id 를 가져오면 한 항목을 지울 때 다른 항목까지 같이 지워지는 등 오동작한다.
  it('rejects duplicate itinerary item ids within a trip', () => {
    const items = [
      makeItem({ id: 'dup', kind: 'place', eventId: null, placeName: 'A' }),
      makeItem({ id: 'dup', kind: 'place', eventId: null, placeName: 'B' }),
    ]
    expect(roundTrip(makeData({ trips: [makeTrip({ items })] })).ok).toBe(false)
  })

  // BUG: 행사 기간은 start > end 를 거부하지만, 예약 시각은 reservationStart > reservationEnd 를 그대로 통과시킨다.
  // getReservationStatus 는 이런 값에서 'before_open' → (시작 전인데도) 'closed' 로 바로 넘어간다.
  it('rejects reservationStart after reservationEnd', () => {
    const e = makeEvent({ reservationStart: '2027-01-30T23:59', reservationEnd: '2026-12-01T18:00' })
    expect(roundTrip(makeData({ events: [e] })).ok).toBe(false)
  })
})

describe('validateAppData — cleans dangling references (not an error)', () => {
  it('drops favorites / event items pointing to missing events, keeps places, dedupes favorites', () => {
    const data = makeData({
      events: [makeEvent(), makeEvent({ id: 'evt_2', title: '두 번째' })],
      favorites: ['evt_missing', 'evt_1', 'evt_1', 'evt_2', 42 as never],
      trips: [
        makeTrip({
          items: [
            makeItem({ id: 'a', eventId: 'evt_1' }),
            makeItem({ id: 'b', eventId: 'evt_missing' }),
            makeItem({ id: 'c', kind: 'place', eventId: null, placeName: '숙소' }),
            makeItem({ id: 'd', eventId: 'evt_2', date: '2027-01-10' }),
          ],
        }),
      ],
    })
    const res = roundTrip(data)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.favorites).toEqual(['evt_1', 'evt_2'])
    expect(res.data.trips[0].items.map((i) => i.id)).toEqual(['a', 'c', 'd'])
  })

  it('assigns ids to items that have none', () => {
    const res = roundTrip(makeData({ trips: [makeTrip({ items: [makeItem({ id: '' })] })] }))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.trips[0].items[0].id).toMatch(/^item_\w+/)
  })
})

describe('validateAppData — trip length limit', () => {
  it('rejects trips longer than 366 days', () => {
    const res = validateAppData(JSON.parse(JSON.stringify(makeData({ trips: [makeTrip({ startDate: '2027-01-01', endDate: '2028-06-30' })] }))))
    expect(res.ok).toBe(false)
  })
})
