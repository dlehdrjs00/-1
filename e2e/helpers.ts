import { test as base, expect, type Locator, type Page } from '@playwright/test'

/**
 * 공통 E2E 도우미.
 *
 * - 매 테스트는 새 브라우저 컨텍스트에서 시작하므로 localStorage 는 비어 있고,
 *   첫 로드 때 샘플 행사 13개와 기본 여행('도쿄 여행' 2027-01-09~13)이 들어간다.
 * - 행사 상태(진행 예정/예약 접수 중 등)는 '오늘' 날짜에 따라 달라지므로
 *   브라우저 시계를 기획 기준일(2026-11-23, 한국 시간 정오)로 고정한다.
 *   setFixedTime 은 Date 만 고정하고 타이머(토스트 사라짐 등)는 그대로 돌아간다.
 */

export const FIXED_NOW = new Date('2026-11-23T12:00:00+09:00')
export const STORAGE_KEY = 'subcul-trip-planner:v1'
export const SAMPLE_COUNT = 13
export const DEFAULT_TRIP_ID = 'trip_tokyo_2027'

export const test = base.extend({
  page: async ({ page }, provide) => {
    await page.clock.setFixedTime(FIXED_NOW)
    await provide(page)
  },
})

export { expect }

/* ---------------- 저장소 ---------------- */

export interface StoredEvent {
  id: string
  isSample: boolean
  title: string
  works: string[]
  type: string
  country: string
  city: string
  startDate: string | null
  endDate: string | null
  timezone: string
  reservationRequired: string
  reservationStart: string | null
  reservationEnd: string | null
}

export interface StoredItem {
  id: string
  date: string
  kind: 'event' | 'place'
  eventId: string | null
  placeName: string
  placeAddress: string
  time: string | null
  memo: string
}

export interface StoredData {
  schemaVersion: number
  events: StoredEvent[]
  favorites: string[]
  trips: {
    id: string
    name: string
    startDate: string
    endDate: string
    timezone: string
    city: string
    accommodation: { name: string; address: string; memo: string }
    items: StoredItem[]
  }[]
  activeTripId: string | null
}

/** 브라우저 localStorage 에 저장된 앱 데이터 */
export async function readStored(page: Page): Promise<StoredData> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
  expect(raw, '앱 데이터가 localStorage 에 저장되어 있어야 함').not.toBeNull()
  return JSON.parse(raw!) as StoredData
}

/* ---------------- 이동 ---------------- */

/** 해시 경로로 이동하고 앱이 그려질 때까지 기다린다 */
export async function openRoute(page: Page, path: string) {
  await page.goto(`/#${path}`)
  await expect(page.locator('main.main')).toBeVisible()
}

/** 지금 화면에 보이는 주 메뉴(모바일: 하단 메뉴, 데스크톱: 상단 메뉴) */
export function mainNav(page: Page): Locator {
  return page.getByRole('navigation', { name: /^(주 메뉴|하단 메뉴)$/ }).filter({ visible: true })
}

export async function navTo(page: Page, label: '행사' | '관심' | '내 여행' | '정보 관리') {
  await mainNav(page).getByRole('link', { name: new RegExp(`^${label}`) }).click()
}

/* ---------------- 공용 UI ---------------- */

/** 토스트 알림 (문자열이면 앞의 아이콘을 뺀 전체 문구가 일치해야 함) */
export function toast(page: Page, text: string | RegExp): Locator {
  // 날짜 문구에는 줄바꿈 없는 공백(U+00A0)이 들어가므로 공백은 \s+ 로 비교
  const re =
    typeof text === 'string'
      ? new RegExp(`^[✓!i]?\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')}\\s*$`)
      : text
  return page.locator('.toasts .toast').filter({ hasText: re }).last()
}

/** useConfirm 확인 대화상자에서 버튼 누르기 */
export async function answerConfirm(page: Page, title: string | RegExp, button: string) {
  const dlg = page.getByRole('dialog', { name: title })
  await expect(dlg).toBeVisible()
  await dlg.getByRole('button', { name: button, exact: true }).click()
  await expect(dlg).toBeHidden()
}

/** 행사 상세의 정보 행(dt/dd) 값 */
export function infoValue(scope: Page | Locator, label: string): Locator {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return scope
    .locator('dl.info-list > div')
    .filter({ has: scope.locator('dt').filter({ hasText: new RegExp(`^${esc}$`) }) })
    .locator('dd')
}

/** 내 여행 화면의 날짜 카드 (예: dayCard(page, '2027. 1. 10.')) */
export function dayCard(page: Page, dateText: string): Locator {
  const esc = dateText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return page.getByRole('region', { name: new RegExp(esc) })
}

/** 날짜 카드 안 일정 제목 목록 (화면 순서) */
export async function dayItemTitles(day: Locator): Promise<string[]> {
  const titles = await day.locator('ol.tp-items > li .tp-item__title').allTextContents()
  return titles.map((t) => t.replace(/\s*샘플\s*$/, '').trim())
}

/* ---------------- 행사 등록 폼 ---------------- */

export interface EventFormInput {
  title?: string
  works?: string[]
  type?: string
  country?: string
  city?: string
  venue?: string
  startDate?: string
  endDate?: string
  reservation?: '필수' | '불필요' | '확인 필요'
  reservationStart?: string
  reservationEnd?: string
  memo?: string
}

export function eventForm(page: Page): Locator {
  return page.getByRole('form', { name: /^행사 (등록|수정)$/ })
}

export async function fillEventForm(page: Page, v: EventFormInput) {
  const form = eventForm(page)
  await expect(form).toBeVisible()
  if (v.title !== undefined) await form.getByRole('textbox', { name: '행사명' }).fill(v.title)
  for (const w of v.works ?? []) {
    await form.getByRole('group', { name: '관련 작품' }).getByRole('button', { name: w, exact: true }).click()
  }
  if (v.type) await form.getByRole('radio', { name: v.type, exact: true }).check()
  if (v.country) {
    await form.getByRole('group', { name: '국가 빠른 선택' }).getByRole('button', { name: v.country, exact: true }).click()
  }
  if (v.city) {
    await form
      .getByRole('group', { name: `${v.country ?? ''} 도시 빠른 선택`.trim() })
      .getByRole('button', { name: v.city, exact: true })
      .click()
  }
  if (v.venue) await form.getByLabel('장소명', { exact: true }).fill(v.venue)
  if (v.startDate) await form.getByLabel('시작일', { exact: true }).fill(v.startDate)
  if (v.endDate) await form.getByLabel('종료일', { exact: true }).fill(v.endDate)
  if (v.reservation) await form.getByRole('radio', { name: v.reservation, exact: true }).check()
  // 예약 시각: 'YYYY-MM-DD' (시각 미정) 또는 'YYYY-MM-DDTHH:mm' → 날짜 칸 + 시각 칸
  for (const [label, val] of [
    ['예약 시작', v.reservationStart],
    ['예약 종료', v.reservationEnd],
  ] as const) {
    if (!val) continue
    const [d, t] = val.split('T')
    await form.getByLabel(`${label} 날짜`, { exact: true }).fill(d)
    if (t) await form.getByLabel(`${label} 시각`, { exact: true }).fill(t)
  }
  if (v.memo) await form.getByLabel('메모', { exact: true }).fill(v.memo)
}

/** 행사 폼의 저장·취소 버튼 영역 (짧은 화면에서도 하단 메뉴에 가리지 않도록 form 밖에 있음) */
export function eventFormActions(page: Page): Locator {
  return page.getByRole('group', { name: '저장·취소' })
}

export async function submitEventForm(page: Page) {
  await eventFormActions(page).getByRole('button', { name: /^(저장|변경 내용 저장)$/ }).click()
}

/** 정보 관리 → 행사 등록 → 입력 → 저장. 저장 후 상세 화면에 도착할 때까지 기다린다. */
export async function registerEvent(page: Page, v: EventFormInput): Promise<string> {
  await openRoute(page, '/manage/new')
  await fillEventForm(page, v)
  await submitEventForm(page)
  await expect(page).toHaveURL(/#\/events\/evt/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(v.title ?? '')
  return decodeURIComponent(new URL(page.url()).hash.replace(/^#\/events\//, ''))
}

/* ---------------- 여행에 추가 대화상자 ---------------- */

export async function openAddToTrip(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: '여행에 추가' }).first().click()
  const dlg = page.getByRole('dialog', { name: '여행에 추가' })
  await expect(dlg).toBeVisible()
  return dlg
}

/** 상세 화면에서 '여행에 추가' → 날짜·시각·메모 → 추가 */
export async function addCurrentEventToTrip(page: Page, opts: { date: string; time?: string; memo?: string }) {
  const dlg = await openAddToTrip(page)
  await dlg.getByLabel('날짜').selectOption(opts.date)
  if (opts.time) await dlg.getByLabel('방문 시각').fill(opts.time)
  if (opts.memo) await dlg.getByLabel('메모').fill(opts.memo)
  await dlg.getByRole('button', { name: /^(일정에 추가|그래도 추가)$/ }).click()
  await expect(dlg).toBeHidden()
}

/* ---------------- 레이아웃 ---------------- */

export async function horizontalOverflow(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    innerWidth: window.innerWidth,
  }))
}
