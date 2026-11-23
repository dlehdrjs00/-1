import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Locator, Page } from '@playwright/test'
import {
  test,
  expect,
  openRoute,
  readStored,
  infoValue,
  toast,
  eventForm,
  eventFormActions,
  STORAGE_KEY,
  type StoredData,
} from './helpers'

/**
 * 이전 버전 데이터 호환 (2차 변경 전 커밋 1f29aea 에서 만든 데이터를 지금 버전이 그대로 읽는지).
 *
 * 고정 자료 (e2e/fixtures/, 이전 버전 화면을 실제 사용자처럼 조작해 만든 값):
 * - legacy-1f29aea-localstorage.json : localStorage 'subcul-trip-planner:v1' 원문
 *     raw               마지막 변경 직후 그대로 (이전 버전이 변경 때 쓴 문자열)
 *     rawAfterOldReload 이전 버전에서 새로고침한 뒤 다시 저장된 문자열 (같은 데이터, 키 순서만 검증 순서)
 * - legacy-1f29aea-backup.json       : 이전 버전 '정보 관리 > JSON 내보내기' 파일 원본
 * - legacy-1f29aea-expected.json     : 이전 버전 화면이 보여 준 내용 (행사 목록·상세·관심·여행 일정)
 *
 * 이전 데이터에는 날짜만 있는 예약 시각이 없으므로(모두 'YYYY-MM-DDTHH:mm' 또는 null),
 * 지금 버전은 아무것도 바꾸지 않고 읽어야 하며 상태 배지도 이전과 같아야 한다.
 */

const FIXTURES = new URL('./fixtures/', import.meta.url)
const fixturePath = (name: string) => fileURLToPath(new URL(name, FIXTURES))
const fixtureText = (name: string) => readFileSync(fixturePath(name), 'utf8')

interface LegacyLocalStorage {
  key: string
  raw: string
  rawAfterOldReload: string
}

interface ExpectedCard {
  id: string
  title: string
  progress: string
  reservation: string
  meta?: string
}

interface ExpectedItem {
  title: string
  time: string
  memo: string | null
  place: string | null
  statuses: { progress: string; reservation: string } | null
  warnings: string[]
}

interface ExpectedTrip {
  name: string
  summary: {
    period: string
    stats: string[]
    accommodationName: string
    accommodationMemo: string | null
    info: Record<string, string>
    tzNote: string
  }
  days: { head: string; items: ExpectedItem[] }[]
}

interface Expected {
  ids: {
    reservationWithTimes: string
    unknownFields: string
    permanentShop: string
    editedSample: string
    deletedSample: string
    secondTrip: string
  }
  counts: { events: number; samples: number; favorites: number; trips: number }
  manageCounts: string
  eventsResultBar: string
  eventsList: ExpectedCard[]
  eventsResultBarWithEnded: string
  eventsListWithEnded: ExpectedCard[]
  details: Record<
    string,
    { heading: string; progress: string; reservation: string; favoritePressed: 'true' | 'false'; info: Record<string, string> }
  >
  favorites: string[]
  activeTripHeading: string
  trips: ExpectedTrip[]
}

const LS = JSON.parse(fixtureText('legacy-1f29aea-localstorage.json')) as LegacyLocalStorage
const LEGACY = JSON.parse(LS.raw) as StoredData
const BACKUP_FILE = fixturePath('legacy-1f29aea-backup.json')
const BACKUP_TEXT = fixtureText('legacy-1f29aea-backup.json')
const BACKUP = JSON.parse(BACKUP_TEXT) as StoredData & { app: string; exportedAt: string }
const EXPECTED = JSON.parse(fixtureText('legacy-1f29aea-expected.json')) as Expected

/** 백업 파일에서 앱 데이터 부분 (app·exportedAt 제외) */
function dataPart(payload: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([k]) => k !== 'app' && k !== 'exportedAt'))
}

const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

/* ---------------- 도우미 ---------------- */

/** 화면 글자 비교용: 여러 공백(줄바꿈 없는 공백 U+00A0 포함)을 한 칸으로 */
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const clean = async (loc: Locator) => norm(await loc.innerText())
/** 문구 전체 일치 정규식. 날짜 문구 안의 공백은 줄바꿈 없는 공백일 수 있어 공백은 \s+ 로 비교 */
const textRe = (text: string) => {
  const body = norm(text)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/ /g, '\\s+')
  return new RegExp(`^${body}$`)
}

/**
 * 앱 스크립트보다 먼저 localStorage 에 이전 버전 원문을 넣는다.
 * 새로고침 때 다시 넣으면 '아무것도 안 바꾸고 새로고침' 확인이 의미 없어지므로 탭마다 한 번만 넣는다.
 */
async function seedLegacyStorage(page: Page, raw: string) {
  await page.addInitScript(
    ({ key, value }) => {
      try {
        if (sessionStorage.getItem('e2e-legacy-seeded') === '1') return
        localStorage.clear()
        localStorage.setItem(key, value)
        sessionStorage.setItem('e2e-legacy-seeded', '1')
      } catch {
        /* about:blank 등 저장소를 쓸 수 없는 문서 */
      }
    },
    { key: LS.key, value: raw },
  )
}

async function rawStored(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
}

/** 이 앱이 쓰는 localStorage 키 전체 */
async function appStorageKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith('subcul-trip-planner')) out.push(k)
    }
    return out.sort()
  })
}

async function expectNoCorruptNotice(page: Page) {
  await expect(page.locator('main.main')).toBeVisible()
  await expect(page.getByText('저장된 데이터를 읽지 못했어요')).toHaveCount(0)
  await expect(page.getByText('저장 실패', { exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('subcul-trip-planner:v1:corrupt-backup'))).toBeNull()
}

async function eventCards(page: Page): Promise<ExpectedCard[]> {
  const cards = page.locator('li.ev-card')
  const out: ExpectedCard[] = []
  for (let i = 0; i < (await cards.count()); i++) {
    const c = cards.nth(i)
    const link = c.locator('.ev-card__link')
    out.push({
      id: decodeURIComponent(((await link.getAttribute('href')) ?? '').replace(/^#\/events\//, '')),
      title: (await link.innerText()).trim(),
      progress: await clean(c.getByTitle('행사 진행 상태')),
      reservation: await clean(c.getByTitle('예약 상태')),
      meta: await clean(c.locator('.ev-card__meta')),
    })
  }
  return out
}

/** 영역 안 정보 행(dt/dd) 값. (helpers 의 infoValue 는 Locator 범위에서 dt 조건이 범위 기준으로 다시 잡혀 맞지 않는다) */
function rowValue(scope: Locator, label: string): Locator {
  return scope
    .locator('dl.info-list > div')
    .filter({ has: scope.page().locator('dt').filter({ hasText: new RegExp(`^${label}$`) }) })
    .locator('dd')
}

function tripSummary(page: Page, name: string): Locator {
  return page.getByRole('region', { name, exact: true })
}

async function tripDays(page: Page): Promise<ExpectedTrip['days']> {
  const days = page.locator('section.tp-day')
  const out: ExpectedTrip['days'] = []
  for (let d = 0; d < (await days.count()); d++) {
    const day = days.nth(d)
    const items = day.locator('ol.tp-items > li')
    const list: ExpectedItem[] = []
    for (let k = 0; k < (await items.count()); k++) {
      const it = items.nth(k)
      const memo = it.locator('.tp-item__memo')
      const place = it.locator('.tp-item__place')
      const status = it.locator('.tp-item__status')
      list.push({
        title: (await it.locator('.tp-item__title').innerText()).replace(/\s*샘플\s*$/, '').trim(),
        time: (await it.locator('.tp-time').innerText()).trim(),
        memo: (await memo.count()) ? (await memo.innerText()).replace(/^메모:\s*/, '').trim() : null,
        place: (await place.count()) ? await clean(place) : null,
        statuses: (await status.count())
          ? { progress: await clean(status.getByTitle('행사 진행 상태')), reservation: await clean(status.getByTitle('예약 상태')) }
          : null,
        warnings: (await it.locator('.tp-warn').allInnerTexts()).map(norm),
      })
    }
    out.push({ head: await clean(day.locator('h3')), items: list })
  }
  return out
}

/** 여행 머리 카드 + 날짜별 일정이 이전 버전 화면과 같은지 */
async function expectTripMatches(page: Page, exp: ExpectedTrip) {
  await expect(page.getByRole('heading', { level: 2, name: exp.name, exact: true })).toBeVisible()
  const s = tripSummary(page, exp.name)
  // 기본 정보는 펼친 상태가 기본 (접기 기록 없음)
  await expect(s.getByRole('button', { name: '기본 정보 접기' })).toHaveAttribute('aria-expanded', 'true')
  expect(await clean(s.locator('.tp-summary__period'))).toBe(exp.summary.period)
  expect((await s.locator('.tp-stat').allInnerTexts()).map(norm)).toEqual(exp.summary.stats)
  await expect(s.locator('.tp-acc__name')).toHaveText(exp.summary.accommodationName)
  if (exp.summary.accommodationMemo === null) await expect(s.locator('.tp-acc__memo')).toHaveCount(0)
  // 숙소 메모는 줄바꿈까지 그대로
  else expect(await s.locator('.tp-acc__memo').innerText()).toBe(exp.summary.accommodationMemo)
  for (const label of ['도시', '시간대', '숙소 주소', '숙소 메모'] as const) {
    const v = exp.summary.info[label]
    if (v === undefined) continue
    expect(await clean(rowValue(s, label)), `여행 '${exp.name}' ${label}`).toBe(v)
  }
  expect(await clean(s.locator('.tp-tz-note'))).toBe(exp.summary.tzNote)
  expect(await tripDays(page)).toEqual(exp.days)
}

async function switchTrip(page: Page, name: string) {
  await page.getByRole('navigation', { name: '여행 선택' }).getByRole('button', { name: new RegExp(name) }).click()
  await expect(page.getByRole('heading', { level: 2, name, exact: true })).toBeVisible()
}

/* ---------------- (a) localStorage 원문 ---------------- */

test.describe('이전 버전(1f29aea) localStorage 데이터', () => {
  test('그대로 읽고 아무것도 바꾸지 않는다: 손상 안내 없음, 새로고침해도 저장값 동일', async ({ page }) => {
    await seedLegacyStorage(page, LS.raw)
    await openRoute(page, '/events')
    await expectNoCorruptNotice(page)

    // 첫 화면 표시 때 한 번 저장하지만 내용은 그대로 (키 순서만 검증 순서로 정리될 수 있음)
    const afterLoad = await rawStored(page)
    expect(afterLoad).not.toBeNull()
    expect(JSON.parse(afterLoad!)).toStrictEqual(LEGACY)
    // 이전 버전이 새로고침 때 쓴 문자열과 바이트까지 같다
    expect(afterLoad).toBe(LS.rawAfterOldReload)
    // 화면만 보고 다닌 것으로 초안·화면 설정 키가 생기지 않는다
    expect(await appStorageKeys(page)).toEqual([STORAGE_KEY])

    // 아무것도 바꾸지 않고 새로고침 → 바이트까지 같음
    await page.reload()
    await expectNoCorruptNotice(page)
    expect(await rawStored(page)).toBe(afterLoad)
    expect(await page.locator('li.ev-card').count()).toBe(EXPECTED.eventsList.length)
  })

  test('이전 버전에서 새로고침 뒤 저장된 원문도 바이트 그대로 유지', async ({ page }) => {
    await seedLegacyStorage(page, LS.rawAfterOldReload)
    await openRoute(page, '/trips')
    await expectNoCorruptNotice(page)
    expect(await rawStored(page)).toBe(LS.rawAfterOldReload)
    await page.reload()
    await expect(page.getByRole('heading', { level: 2, name: EXPECTED.activeTripHeading, exact: true })).toBeVisible()
    expect(await rawStored(page)).toBe(LS.rawAfterOldReload)
  })

  test('화면에 이전 버전과 같은 행사·상태·관심·여행 일정이 보인다', async ({ page }) => {
    const ids = EXPECTED.ids
    await seedLegacyStorage(page, LS.raw)

    // ---------- 행사 목록: 순서·제목·진행/예약 상태·예약 시각(시간대 표기) ----------
    await openRoute(page, '/events')
    await expectNoCorruptNotice(page)
    await expect(page.locator('li.ev-card')).toHaveCount(EXPECTED.eventsList.length)
    expect(await clean(page.locator('.ev-resultbar'))).toBe(EXPECTED.eventsResultBar)
    expect(await eventCards(page)).toEqual(EXPECTED.eventsList)
    // 예약 접수 중 행사 카드: 마감 시각이 시각·시간대와 함께 ('시각 미정' 아님)
    const cardA = page.locator('li.ev-card').filter({ has: page.locator(`a[href="#/events/${ids.reservationWithTimes}"]`) })
    await expect(cardA.locator('.ev-card__meta')).toContainText(/예약 마감\s*2027\.\s+1\.\s+5\.\s+\(화\)\s+21:00\s+\(일본 시간\)/)
    await expect(page.locator('li.ev-card .ev-card__meta')).not.toContainText(['시각 미정'])

    await page.getByRole('button', { name: /종료 \d+개 숨김 · 보기/ }).click()
    await expect(page.locator('li.ev-card')).toHaveCount(EXPECTED.eventsListWithEnded.length)
    expect(await clean(page.locator('.ev-resultbar'))).toBe(EXPECTED.eventsResultBarWithEnded)
    expect((await eventCards(page)).map((c) => ({ id: c.id, title: c.title, progress: c.progress, reservation: c.reservation }))).toEqual(
      EXPECTED.eventsListWithEnded,
    )
    // 삭제한 샘플은 없다
    await expect(page.locator(`a[href="#/events/${ids.deletedSample}"]`)).toHaveCount(0)

    // ---------- 행사 상세: 모든 정보 행·상태 배지·관심 여부 ----------
    for (const [id, exp] of Object.entries(EXPECTED.details)) {
      await openRoute(page, `/events/${encodeURIComponent(id)}`)
      await expect(page.getByRole('heading', { level: 1 })).toContainText(exp.heading)
      const hero = page.locator('.ev-hero')
      expect(await clean(hero.getByTitle('행사 진행 상태')), `${id} 진행 상태`).toBe(exp.progress)
      expect(await clean(hero.getByTitle('예약 상태')), `${id} 예약 상태`).toBe(exp.reservation)
      const rows = page.locator('dl.info-list > div')
      const info: Record<string, string> = {}
      for (let i = 0; i < (await rows.count()); i++) {
        info[(await rows.nth(i).locator('dt').innerText()).trim()] = await clean(rows.nth(i).locator('dd'))
      }
      expect(info, `${id} 상세 정보`).toEqual(exp.info)
      const fav =
        exp.favoritePressed === 'true'
          ? page.getByRole('button', { name: '관심 저장 취소', exact: true })
          : page.getByRole('button', { name: '관심 저장', exact: true })
      await expect(fav.first()).toHaveAttribute('aria-pressed', exp.favoritePressed)
    }
    // 예약 시각은 날짜+시각+현지 시간대로 표시 (이전 데이터는 '시각 미정'이 되지 않는다)
    await openRoute(page, `/events/${encodeURIComponent(ids.reservationWithTimes)}`)
    await expect(infoValue(page, '예약 시작')).toHaveText(textRe('2026. 11. 20. (금) 10:00 (일본 시간)'))
    await expect(infoValue(page, '예약 종료')).toHaveText(textRe('2027. 1. 5. (화) 21:00 (일본 시간)'))
    await expect(page.locator('.ev-hero').getByTitle('예약 상태')).toHaveText(/예약 접수 중/)
    // 이전 샘플(sample_005)의 시각 있는 예약 시작은 새 샘플처럼 날짜만으로 바뀌지 않는다
    await openRoute(page, '/events/sample_005')
    await expect(infoValue(page, '예약 시작')).toHaveText(textRe('2026. 12. 10. (목) 12:00 (일본 시간)'))
    await expect(page.locator('.ev-hero').getByTitle('예약 상태')).toHaveText(/예약 오픈 전/)

    // ---------- 관심 ----------
    await openRoute(page, '/favorites')
    await expect(page.locator('.favs-card')).toHaveCount(EXPECTED.counts.favorites)
    expect((await page.locator('.favs-card .ev-card__title a').allInnerTexts()).map((t) => t.trim())).toEqual(EXPECTED.favorites)

    // ---------- 내 여행: 활성 여행(두 번째 여행) → 도쿄 여행 → 다시 원래 활성 여행 ----------
    await openRoute(page, '/trips')
    await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText(EXPECTED.activeTripHeading)
    await expect(page.getByRole('navigation', { name: '여행 선택' }).getByRole('button')).toHaveCount(EXPECTED.counts.trips)
    const active = EXPECTED.trips.find((t) => t.name === EXPECTED.activeTripHeading)!
    await expectTripMatches(page, active)
    for (const t of EXPECTED.trips.filter((x) => x !== active)) {
      await switchTrip(page, t.name)
      await expectTripMatches(page, t)
    }
    await switchTrip(page, active.name)

    // ---------- 정보 관리 ----------
    await openRoute(page, '/manage')
    await expect(page.locator('.manage-backup__box').first()).toContainText(EXPECTED.manageCounts)

    // 보기만 했으므로 (여행 전환도 원래대로 되돌림) 저장값은 이전 데이터 그대로
    expect(await readStored(page)).toStrictEqual(LEGACY)
    expect(await appStorageKeys(page)).toEqual([STORAGE_KEY])
  })

  test('이전 행사를 수정 폼으로 열면 예약 시각이 날짜·시각 칸으로 나뉘고, 그대로 저장해도 값이 바뀌지 않는다', async ({
    page,
  }) => {
    const id = EXPECTED.ids.reservationWithTimes
    const before = LEGACY.events.find((e) => e.id === id)!
    await seedLegacyStorage(page, LS.raw)
    await openRoute(page, `/manage/edit/${encodeURIComponent(id)}`)
    const form = eventForm(page)
    await expect(form).toBeVisible()
    // 초안이 없으므로 복구 안내도 없다
    await expect(page.getByText(/저장하지 않은 초안이 있어요/)).toHaveCount(0)
    await expect(form.getByRole('textbox', { name: '행사명' })).toHaveValue(before.title)
    const startGroup = form.getByRole('group', { name: '예약 시작 (행사 현지 시간: 일본 시간)' })
    const endGroup = form.getByRole('group', { name: '예약 종료 (행사 현지 시간: 일본 시간)' })
    await expect(startGroup.getByLabel('예약 시작 날짜', { exact: true })).toHaveValue('2026-11-20')
    await expect(startGroup.getByLabel('예약 시작 시각', { exact: true })).toHaveValue('10:00')
    await expect(endGroup.getByLabel('예약 종료 날짜', { exact: true })).toHaveValue('2027-01-05')
    await expect(endGroup.getByLabel('예약 종료 시각', { exact: true })).toHaveValue('21:00')

    // 아무것도 바꾸지 않고 취소 → 확인 없이 나가고 저장값·키 그대로
    await eventFormActions(page).getByRole('button', { name: '취소' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(eventForm(page)).toHaveCount(0)
    expect(await readStored(page)).toStrictEqual(LEGACY)
    expect(await appStorageKeys(page)).toEqual([STORAGE_KEY])

    // 다시 열어 바꾸지 않고 저장 → updatedAt 만 바뀌고 예약 시각은 시각 있는 형식 그대로
    await openRoute(page, `/manage/edit/${encodeURIComponent(id)}`)
    await expect(eventForm(page).getByRole('textbox', { name: '행사명' })).toHaveValue(before.title)
    await eventFormActions(page).getByRole('button', { name: '변경 내용 저장' }).click()
    await expect(toast(page, '저장했어요')).toBeVisible()
    const after = await readStored(page)
    const saved = after.events.find((e) => e.id === id)! as unknown as Record<string, unknown>
    const { updatedAt: newUpdatedAt, ...savedRest } = saved
    const { updatedAt: oldUpdatedAt, ...beforeRest } = before as unknown as Record<string, unknown>
    expect(savedRest).toStrictEqual(beforeRest)
    expect(newUpdatedAt).not.toBe(oldUpdatedAt)
    expect(saved.reservationStart).toBe('2026-11-20T10:00')
    expect(saved.reservationEnd).toBe('2027-01-05T21:00')
    // 다른 데이터는 그대로, 초안은 남지 않는다
    expect({ ...after, events: after.events.filter((e) => e.id !== id) }).toStrictEqual({
      ...LEGACY,
      events: LEGACY.events.filter((e) => e.id !== id),
    })
    expect(await appStorageKeys(page)).toEqual([STORAGE_KEY])
  })
})

/* ---------------- (b) 이전 버전 JSON 백업 불러오기 ---------------- */

test.describe('이전 버전(1f29aea) JSON 백업', () => {
  test('정보 관리에서 불러오면 백업 내용과 똑같이 복원된다', async ({ page }) => {
    await openRoute(page, '/manage')
    await page.getByLabel('불러올 JSON 백업 파일 선택').setInputFiles(BACKUP_FILE)
    const dlg = page.getByRole('dialog', { name: '이 파일로 데이터를 바꿀까요?' })
    await expect(dlg).toBeVisible()
    await expect(dlg).toContainText(`행사 ${EXPECTED.counts.events}개 (샘플 ${EXPECTED.counts.samples}개 포함)`)
    await expect(dlg).toContainText(`관심 ${EXPECTED.counts.favorites}개`)
    await expect(dlg).toContainText(`여행 ${EXPECTED.counts.trips}개`)
    await dlg.getByRole('button', { name: '불러와서 바꾸기' }).click()
    await expect(dlg).toBeHidden()
    await expect(
      toast(
        page,
        `불러오기 완료: 행사 ${EXPECTED.counts.events}개, 관심 ${EXPECTED.counts.favorites}개, 여행 ${EXPECTED.counts.trips}개`,
      ),
    ).toBeVisible()
    await expect(page.getByRole('alert').filter({ hasText: '불러오지 못했어요' })).toHaveCount(0)

    const stored = await readStored(page)
    expect(stored).toStrictEqual(dataPart(BACKUP))
    // localStorage 원문과도 같은 데이터
    expect(stored).toStrictEqual(LEGACY)
    // 이전 버전이 같은 데이터를 저장한 문자열과 바이트까지 같다
    const raw = await rawStored(page)
    expect(raw).toBe(LS.rawAfterOldReload)

    await page.reload()
    await expectNoCorruptNotice(page)
    expect(await rawStored(page)).toBe(raw)

    // 화면 확인 (요약)
    await expect(page.locator('.manage-backup__box').first()).toContainText(EXPECTED.manageCounts)
    await openRoute(page, '/favorites')
    expect((await page.locator('.favs-card .ev-card__title a').allInnerTexts()).map((t) => t.trim())).toEqual(EXPECTED.favorites)
    await openRoute(page, '/trips')
    await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText(EXPECTED.activeTripHeading)
    await switchTrip(page, '도쿄 여행')
    await expectTripMatches(page, EXPECTED.trips.find((t) => t.name === '도쿄 여행')!)
    await openRoute(page, `/events/${encodeURIComponent(EXPECTED.ids.reservationWithTimes)}`)
    await expect(infoValue(page, '예약 시작')).toHaveText(textRe('2026. 11. 20. (금) 10:00 (일본 시간)'))
    await expect(page.locator('.ev-hero').getByTitle('예약 상태')).toHaveText(/예약 접수 중/)
  })
})

/* ---------------- (c) 지금 버전에서 내보내기 ---------------- */

test.describe('이전 데이터를 지금 버전에서 내보내기', () => {
  test('schemaVersion 1, 이전 백업과 같은 모양·내용 (내보낸 시각만 다름)', async ({ page }) => {
    await seedLegacyStorage(page, LS.raw)
    await openRoute(page, '/manage')
    await expectNoCorruptNotice(page)
    await expect(page.locator('.manage-backup__box').first()).toContainText(EXPECTED.manageCounts)
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'JSON 내보내기' }).click(),
    ])
    expect(download.suggestedFilename()).toBe('subcul-trip-planner-20261123.json')
    const text = readFileSync(await download.path(), 'utf8')
    const exported = JSON.parse(text) as Record<string, unknown> & StoredData

    expect(exported.app).toBe('subcul-trip-planner')
    expect(exported.schemaVersion).toBe(1)
    expect(Object.keys(exported)).toEqual(Object.keys(BACKUP))
    expect(dataPart(exported)).toStrictEqual(dataPart(BACKUP))
    expect(dataPart(exported)).toStrictEqual(LEGACY)
    // 항목별 키 구성·순서도 이전 백업과 같다
    exported.events.forEach((e, i) => expect(Object.keys(e)).toEqual(Object.keys(BACKUP.events[i])))
    exported.trips.forEach((t, i) => {
      expect(Object.keys(t)).toEqual(Object.keys(BACKUP.trips[i]))
      t.items.forEach((it, j) => expect(Object.keys(it)).toEqual(Object.keys(BACKUP.trips[i].items[j])))
    })
    // 파일 글자 그대로 비교 (exportedAt 값만 다름)
    const withoutExportedAt = (s: string) => s.replace(/"exportedAt": "[^"]*"/, '"exportedAt": "-"')
    expect(withoutExportedAt(text)).toBe(withoutExportedAt(BACKUP_TEXT))
    // 날짜만 있는 예약 시각이 없으므로 이전 버전에서도 불러올 수 있는 형식 (이전 검증: YYYY-MM-DDTHH:mm 또는 null)
    for (const e of exported.events) {
      for (const v of [e.reservationStart, e.reservationEnd]) {
        if (v !== null) expect(v, `${e.title} 예약 시각`).toMatch(DATETIME_RE)
      }
    }
  })
})
