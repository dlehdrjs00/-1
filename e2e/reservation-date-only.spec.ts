/**
 * 예약 시작·종료를 날짜만('YYYY-MM-DD', 시각 미정) 저장하는 경우 (2차 변경 1).
 * - 표시: '… · 시각 미정' / 시각이 있으면 '… HH:mm (일본 시간)'
 * - 저장: 00:00 · 23:59 같은 시각을 지어내지 않는다
 * - 상태: 날짜만 있는 시작일·종료일 당일에는 '예약 접수 중'으로 단정하지 않는다 ('예약 확인 필요')
 * 날짜별 상태는 브라우저 시계를 일본 시각으로 옮겨 가며 확인한다 (일본·한국은 같은 UTC+9).
 */
import {
  test,
  expect,
  openRoute,
  registerEvent,
  eventForm,
  fillEventForm,
  submitEventForm,
  eventFormActions,
  infoValue,
  readStored,
  SAMPLE_COUNT,
  type StoredEvent,
} from './helpers'
import { heroReservationBadge, setTokyoNow } from './round2-helpers'
import type { Page } from '@playwright/test'

const START_DATE_ONLY = {
  title: 'E2E 시작 시각 미정 예약',
  works: ['원신'],
  country: '일본',
  city: '도쿄',
  startDate: '2026-12-01',
  endDate: '2027-01-31',
  reservation: '필수' as const,
  reservationStart: '2026-12-05',
  reservationEnd: '2026-12-20T18:00',
}

const END_DATE_ONLY = {
  title: 'E2E 종료 시각 미정 예약',
  works: ['명조'],
  country: '일본',
  city: '오사카',
  startDate: '2026-12-01',
  endDate: '2027-01-31',
  reservation: '필수' as const,
  reservationStart: '2026-12-01T10:00',
  reservationEnd: '2026-12-15',
}

function eventCard(page: Page, title: string) {
  return page.locator('ul.ev-list > li').filter({ hasText: title })
}

async function storedEvent(page: Page, id: string): Promise<StoredEvent> {
  const ev = (await readStored(page)).events.find((e) => e.id === id)
  expect(ev, `저장된 행사 ${id}`).toBeTruthy()
  return ev!
}

/** 상세 화면의 예약 상태 배지 확인 (+ '예약 접수 중'이 아닐 때는 화면 어디에도 없어야 함) */
async function expectBadge(page: Page, label: '예약 오픈 전' | '예약 확인 필요' | '예약 접수 중' | '예약 마감') {
  await expect(heroReservationBadge(page)).toHaveText(new RegExp(label))
  if (label !== '예약 접수 중') await expect(page.locator('main')).not.toContainText('예약 접수 중')
}

test.describe('예약 시작·종료 날짜만 (시각 미정)', () => {
  test('시작은 날짜만, 종료는 날짜+시각: 상세·카드는 시각 미정, 저장값에 시각을 지어내지 않는다', async ({ page }) => {
    const id = await registerEvent(page, START_DATE_ONLY)

    // ---------- 상세 ----------
    await expect(infoValue(page, '예약 필요 여부')).toHaveText('예약 필수')
    await expect(infoValue(page, '예약 시작')).toHaveText('2026. 12. 5. (토) · 시각 미정')
    // '시각 미정'은 모르는 값 표시(경고색)로
    await expect(infoValue(page, '예약 시작').locator('.unknown')).toHaveText('시각 미정')
    await expect(infoValue(page, '예약 종료')).toHaveText('2026. 12. 20. (일) 18:00 (일본 시간)')
    await expect(page.getByText('시각은 모두 일본 시간(Asia/Tokyo) 기준이에요.')).toBeVisible()
    // 오늘(11/23)은 시작일 전이므로 오픈 전
    await expectBadge(page, '예약 오픈 전')
    await expect(page.locator('main')).not.toContainText('00:00')

    // ---------- 목록 카드: 예약 오픈 줄에 시각 미정 ----------
    await openRoute(page, '/events')
    const card = eventCard(page, START_DATE_ONLY.title)
    await expect(card).toHaveCount(1)
    const open = card.locator('dl.ev-card__meta > div').filter({ hasText: '예약 오픈' })
    await expect(open.locator('dd')).toHaveText('2026. 12. 5. (토) · 시각 미정')
    await expect(card.getByTitle('예약 상태')).toHaveText(/예약 오픈 전/)
    await expect(card).not.toContainText('00:00')

    // ---------- 저장값 ----------
    const ev = await storedEvent(page, id)
    expect(ev.reservationRequired).toBe('required')
    expect(ev.reservationStart).toBe('2026-12-05')
    expect(ev.reservationEnd).toBe('2026-12-20T18:00')

    // 새로고침 후에도 그대로
    await page.reload()
    await expect(eventCard(page, START_DATE_ONLY.title).locator('dl.ev-card__meta')).toContainText('2026. 12. 5. (토) · 시각 미정')
    expect((await storedEvent(page, id)).reservationStart).toBe('2026-12-05')
  })

  test('날짜만 있는 시작일 당일은 예약 접수 중이 아니고(확인 필요), 다음 날부터 접수 중', async ({ page }) => {
    const id = await registerEvent(page, START_DATE_ONLY)
    const detail = `/events/${encodeURIComponent(id)}`

    // 시작일 전날 밤: 오픈 전
    await setTokyoNow(page, '2026-12-04T23:30')
    await expectBadge(page, '예약 오픈 전')

    // 시작일 당일: 몇 시에 열리는지 모름 → 확인 필요 (접수 중 아님)
    for (const t of ['2026-12-05T00:00', '2026-12-05T12:00', '2026-12-05T23:59']) {
      await setTokyoNow(page, t)
      await expect(page).toHaveURL(new RegExp(`#${detail}$`))
      await expectBadge(page, '예약 확인 필요')
      await expect(page.getByRole('status').filter({ hasText: '예약 정보 확인 필요' })).toBeVisible()
    }
    // 목록 카드도 같은 판정
    await openRoute(page, '/events')
    await expect(eventCard(page, START_DATE_ONLY.title).getByTitle('예약 상태')).toHaveText(/예약 확인 필요/)
    await expect(eventCard(page, START_DATE_ONLY.title)).not.toContainText('예약 접수 중')

    // 다음 날 + 종료 시각은 아직: 접수 중, 카드에 예약 마감 시각 표시
    await setTokyoNow(page, '2026-12-06T00:01')
    await expect(eventCard(page, START_DATE_ONLY.title).getByTitle('예약 상태')).toHaveText(/예약 접수 중/)
    await expect(
      eventCard(page, START_DATE_ONLY.title).locator('dl.ev-card__meta > div').filter({ hasText: '예약 마감' }).locator('dd'),
    ).toHaveText('2026. 12. 20. (일) 18:00 (일본 시간)')
    await openRoute(page, detail)
    await expectBadge(page, '예약 접수 중')

    // 종료 시각(18:00) 그 분까지는 접수 중, 지나면 마감
    await setTokyoNow(page, '2026-12-20T18:00')
    await expectBadge(page, '예약 접수 중')
    await setTokyoNow(page, '2026-12-20T18:01')
    await expectBadge(page, '예약 마감')
  })

  test('날짜만 있는 종료일: 전날은 접수 중, 종료일 당일은 확인 필요, 다음 날은 예약 마감', async ({ page }) => {
    const id = await registerEvent(page, END_DATE_ONLY)
    await expect(infoValue(page, '예약 시작')).toHaveText('2026. 12. 1. (화) 10:00 (일본 시간)')
    await expect(infoValue(page, '예약 종료')).toHaveText('2026. 12. 15. (화) · 시각 미정')
    const ev = await storedEvent(page, id)
    expect(ev.reservationStart).toBe('2026-12-01T10:00')
    expect(ev.reservationEnd).toBe('2026-12-15')

    // 종료일 전날: 접수 중 (카드의 마감 줄에도 시각 미정)
    await setTokyoNow(page, '2026-12-14T23:30')
    await expectBadge(page, '예약 접수 중')
    await openRoute(page, '/events')
    await expect(
      eventCard(page, END_DATE_ONLY.title).locator('dl.ev-card__meta > div').filter({ hasText: '예약 마감' }).locator('dd'),
    ).toHaveText('2026. 12. 15. (화) · 시각 미정')
    await openRoute(page, `/events/${encodeURIComponent(id)}`)

    // 종료일 당일: 언제 닫히는지 모름 → 접수 중으로 단정하지 않음
    for (const t of ['2026-12-15T00:00', '2026-12-15T09:00', '2026-12-15T23:59']) {
      await setTokyoNow(page, t)
      await expectBadge(page, '예약 확인 필요')
    }

    // 다음 날: 확실히 지남 → 마감
    await setTokyoNow(page, '2026-12-16T00:00')
    await expectBadge(page, '예약 마감')
  })

  test('sample_005: 예약 시작 날짜만 발표(12/10) → 시각 미정, 시작일 당일은 확인 필요', async ({ page }) => {
    await openRoute(page, '/events/sample_005')
    await expect(infoValue(page, '예약 시작')).toHaveText('2026. 12. 10. (목) · 시각 미정')
    await expect(infoValue(page, '예약 종료')).toHaveText('2026. 12. 20. (일) 23:59 (일본 시간)')
    await expectBadge(page, '예약 오픈 전')
    const ev = await storedEvent(page, 'sample_005')
    expect(ev.reservationStart).toBe('2026-12-10')

    await setTokyoNow(page, '2026-12-10T15:00')
    await expectBadge(page, '예약 확인 필요')
    await setTokyoNow(page, '2026-12-11T09:00')
    await expectBadge(page, '예약 접수 중')
  })

  test('수정 폼: 날짜·시각 칸이 나뉘어 채워지고, 바꾸지 않고 저장하면 저장값이 그대로', async ({ page }) => {
    // 샘플(시작 날짜만) + 직접 등록(종료 날짜만) 두 경우
    const userId = await registerEvent(page, END_DATE_ONLY)
    const cases = [
      { id: 'sample_005', start: ['2026-12-10', ''], end: ['2026-12-20', '23:59'] },
      { id: userId, start: ['2026-12-01', '10:00'], end: ['2026-12-15', ''] },
    ]
    for (const c of cases) {
      const before = await storedEvent(page, c.id)
      await openRoute(page, `/manage/edit/${encodeURIComponent(c.id)}`)
      const form = eventForm(page)
      await expect(form.getByRole('radio', { name: '필수', exact: true })).toBeChecked()
      const startGroup = form.getByRole('group', { name: '예약 시작 (행사 현지 시간: 일본 시간)' })
      const endGroup = form.getByRole('group', { name: '예약 종료 (행사 현지 시간: 일본 시간)' })
      await expect(startGroup).toBeVisible()
      await expect(endGroup).toBeVisible()
      await expect(startGroup.getByLabel('예약 시작 날짜', { exact: true })).toHaveValue(c.start[0])
      await expect(startGroup.getByLabel('예약 시작 시각', { exact: true })).toHaveValue(c.start[1])
      await expect(endGroup.getByLabel('예약 종료 날짜', { exact: true })).toHaveValue(c.end[0])
      await expect(endGroup.getByLabel('예약 종료 시각', { exact: true })).toHaveValue(c.end[1])

      await eventFormActions(page).getByRole('button', { name: '변경 내용 저장' }).click()
      await expect(page).not.toHaveURL(/#\/manage\/edit\//)
      const after = await storedEvent(page, c.id)
      const strip = ({ updatedAt: _u, ...rest }: StoredEvent & { updatedAt?: string }) => rest
      expect(strip(after)).toEqual(strip(before))
      expect(after.reservationStart).toBe(before.reservationStart)
      expect(after.reservationEnd).toBe(before.reservationEnd)
    }
    expect((await readStored(page)).events).toHaveLength(SAMPLE_COUNT + 1)
  })

  test('검증: 시각만 있고 날짜가 없으면 오류, 예약 종료일이 시작일보다 빠르면 오류', async ({ page }) => {
    await openRoute(page, '/manage/new')
    const form = eventForm(page)
    await fillEventForm(page, { title: 'E2E 예약 검증', works: ['기타'], reservation: '필수' })
    const startDate = form.getByLabel('예약 시작 날짜', { exact: true })
    const startTime = form.getByLabel('예약 시작 시각', { exact: true })
    const endDate = form.getByLabel('예약 종료 날짜', { exact: true })
    const endTime = form.getByLabel('예약 종료 시각', { exact: true })
    const summary = page.getByRole('alert').filter({ hasText: '입력 내용을 확인해 주세요' })

    // 시각만 → 날짜를 먼저 입력하세요
    await startTime.fill('10:00')
    await endTime.fill('18:00')
    await submitEventForm(page)
    await expect(startDate).toHaveAttribute('aria-invalid', 'true')
    await expect(startDate).toHaveAccessibleDescription('날짜를 먼저 입력하세요.')
    await expect(endDate).toHaveAttribute('aria-invalid', 'true')
    await expect(endDate).toHaveAccessibleDescription('날짜를 먼저 입력하세요.')
    await expect(summary).toContainText('예약 시작 날짜: 날짜를 먼저 입력하세요.')
    await expect(summary).toContainText('예약 종료 날짜: 날짜를 먼저 입력하세요.')
    await expect(startDate).toBeFocused()
    await expect(page).toHaveURL(/#\/manage\/new$/)
    expect((await readStored(page)).events).toHaveLength(SAMPLE_COUNT)

    // 종료일이 시작일보다 빠름 (날짜+시각)
    await startDate.fill('2026-12-10')
    await endDate.fill('2026-12-05')
    await expect(startDate).not.toHaveAttribute('aria-invalid', 'true')
    await expect(endDate).toHaveAccessibleDescription('예약 종료일은 예약 시작일과 같거나 그 이후여야 해요.')
    await submitEventForm(page)
    await expect(summary).toContainText('예약 종료 날짜: 예약 종료일은 예약 시작일과 같거나 그 이후여야 해요.')
    await expect(page).toHaveURL(/#\/manage\/new$/)

    // 시각을 비워 날짜만 남겨도 마찬가지
    await form.getByRole('button', { name: '예약 시작 시각 비우기' }).click()
    await form.getByRole('button', { name: '예약 종료 시각 비우기' }).click()
    await expect(startTime).toHaveValue('')
    await submitEventForm(page)
    await expect(endDate).toHaveAttribute('aria-invalid', 'true')
    await expect(endDate).toHaveAccessibleDescription('예약 종료일은 예약 시작일과 같거나 그 이후여야 해요.')
    expect((await readStored(page)).events).toHaveLength(SAMPLE_COUNT)

    // 날짜만이면 같은 날은 허용 → 저장, 저장값은 날짜만
    await endDate.fill('2026-12-10')
    await expect(summary).toHaveCount(0)
    await submitEventForm(page)
    await expect(page).toHaveURL(/#\/events\/evt/)
    await expect(infoValue(page, '예약 시작')).toHaveText('2026. 12. 10. (목) · 시각 미정')
    await expect(infoValue(page, '예약 종료')).toHaveText('2026. 12. 10. (목) · 시각 미정')
    const saved = (await readStored(page)).events.find((e) => e.title === 'E2E 예약 검증')!
    expect(saved).toMatchObject({ reservationStart: '2026-12-10', reservationEnd: '2026-12-10' })
  })
})
