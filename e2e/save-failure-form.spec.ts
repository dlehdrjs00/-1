/**
 * 행사 등록·수정 폼: 앱 본문 저장(localStorage 'subcul-trip-planner:v1')이 실패할 때.
 * - 초안은 먼저 정상 저장된 상태에서, 본문 키의 setItem 만 실패시킨다 (초안 키는 계속 저장됨).
 * - 실패하면: 성공 알림·화면 이동·초안 삭제가 없고, 폼·입력값·초안이 그대로 남으며, 오류 알림과 안내가 뜬다.
 * - 저장을 되살린 뒤 다시 저장하면 정확히 한 번 저장되고(행사가 둘 생기지 않음), 새로고침 뒤에도 남는다.
 */
import type { Locator, Page } from '@playwright/test'
import { test, expect, eventForm, eventFormActions, readStored, toast, navTo, answerConfirm, openRoute } from './helpers'
import { DRAFT_NEW_KEY, draftEditKey, readDraft, openEventFormRoute } from './round2-helpers'
import { failMainSave, recoverMainSave } from './save-failure-helpers'

const SAVE_FAILED_MESSAGE = '저장하지 못했어요. 브라우저 저장 공간을 확인한 뒤 다시 시도해 주세요.'
const SAMPLE_ID = 'sample_001'
const SAMPLE_TITLE = '[샘플] 가상 콜라보 카페 A'

type RawEvent = { id: string; title: string; memo: string; updatedAt: string; works: string[] }

async function storedEvents(page: Page): Promise<RawEvent[]> {
  return (await readStored(page)).events as unknown as RawEvent[]
}

function saveButton(page: Page): Locator {
  return eventFormActions(page).getByRole('button', { name: /^(저장|변경 내용 저장)$/ })
}

/** 저장 실패 오류 알림 (토스트) */
function failToast(page: Page): Locator {
  return page.locator('.toasts .toast--error').filter({ hasText: '저장하지 못했어요' })
}

/** 폼 안 저장 실패 안내 (role=alert) */
function failNotice(page: Page, mode: 'new' | 'edit'): Locator {
  return page
    .getByRole('alert')
    .filter({ hasText: mode === 'new' ? '행사가 등록되지 않았어요' : '변경 내용이 저장되지 않았어요' })
}

function successToast(page: Page): Locator {
  return page.locator('.toasts .toast').filter({ hasText: '저장했어요' })
}

function workChip(page: Page, name: string): Locator {
  return eventForm(page).getByRole('group', { name: '관련 작품' }).getByRole('button', { name, exact: true })
}

/** 새 행사 폼에 제목 + 작품을 입력하고 초안이 정상 저장될 때까지 기다린다 */
async function fillNewAndWaitDraft(page: Page, title: string) {
  await openEventFormRoute(page, '/manage/new')
  await eventForm(page).getByRole('textbox', { name: '행사명' }).fill(title)
  await workChip(page, '명일방주').click()
  await expect
    .poll(async () => {
      const d = await readDraft(page, DRAFT_NEW_KEY)
      return d && { title: d.values.title, works: d.values.works }
    }, { message: '새 행사 초안이 정상 저장되어야 함' })
    .toEqual({ title, works: ['arknights'] })
}

/** 실패 직후 공통 확인: 성공 안내·이동·초안 삭제 없음, 오류 알림·안내 있음 */
async function expectFailureKeptForm(page: Page, mode: 'new' | 'edit', url: RegExp) {
  await expect(failToast(page)).toBeVisible()
  await expect(failToast(page)).toContainText(SAVE_FAILED_MESSAGE)
  const notice = failNotice(page, mode)
  await expect(notice).toBeVisible()
  await expect(notice).toContainText(SAVE_FAILED_MESSAGE)
  await expect(notice).toContainText('입력한 내용과 초안은 그대로 남아 있어요.')
  await expect(successToast(page)).toHaveCount(0)
  await expect(page).toHaveURL(url)
  await expect(eventForm(page)).toBeVisible()
}

test.describe('행사 폼 저장 실패', () => {
  test('새 행사: 실패하면 폼·초안 유지, 성공 안내·이동 없음 → 되살린 뒤 다시 저장하면 한 번만 저장되고 새로고침 뒤에도 남는다', async ({
    page,
  }) => {
    const TITLE = 'E2E 저장 실패 새 행사'
    await fillNewAndWaitDraft(page, TITLE)
    const before = (await storedEvents(page)).length

    await failMainSave(page)
    // 두 번 실패시켜 본다 (다시 눌러도 아무것도 쌓이지 않음)
    for (let i = 0; i < 2; i++) {
      await saveButton(page).click()
      await expectFailureKeptForm(page, 'new', /#\/manage\/new$/)
    }

    // 입력값 그대로
    await expect(eventForm(page).getByRole('textbox', { name: '행사명' })).toHaveValue(TITLE)
    await expect(workChip(page, '명일방주')).toHaveAttribute('aria-pressed', 'true')
    // 초안 그대로 (입력값 포함)
    const draft = await readDraft(page, DRAFT_NEW_KEY)
    expect(draft?.values).toMatchObject({ title: TITLE, works: ['arknights'] })
    // 저장된 본문은 그대로
    const storedAfterFail = await storedEvents(page)
    expect(storedAfterFail.length).toBe(before)
    expect(storedAfterFail.filter((e) => e.title === TITLE)).toHaveLength(0)

    // 저장하지 않은 변경이 있으므로 메뉴 이동은 여전히 확인을 묻는다 → 취소하면 그대로
    await navTo(page, '행사')
    await answerConfirm(page, '저장하지 않고 나갈까요?', '취소')
    await expect(page).toHaveURL(/#\/manage\/new$/)
    expect((await readDraft(page, DRAFT_NEW_KEY))?.values.title).toBe(TITLE)

    // 되살리고 다시 저장 → 한 번만 저장
    await recoverMainSave(page)
    await saveButton(page).click()
    await expect(toast(page, '저장했어요')).toBeVisible()
    // 저장이 되살아나면 낡은 '저장하지 못했어요' 오류 알림은 성공 알림과 함께 남지 않는다
    await expect(page.locator('.toasts .toast--error')).toHaveCount(0)
    await expect(page).toHaveURL(/#\/events\/evt_/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(TITLE)
    const id = decodeURIComponent(new URL(page.url()).hash.replace(/^#\/events\//, ''))

    const after = await storedEvents(page)
    expect(after.length).toBe(before + 1)
    expect(after.filter((e) => e.title === TITLE).map((e) => e.id)).toEqual([id])
    expect(await readDraft(page, DRAFT_NEW_KEY)).toBeNull()

    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toContainText(TITLE)
    const reloaded = await storedEvents(page)
    expect(reloaded.length).toBe(before + 1)
    expect(reloaded.filter((e) => e.title === TITLE).map((e) => e.id)).toEqual([id])
    expect(await readDraft(page, DRAFT_NEW_KEY)).toBeNull()
  })

  test('새 행사: 실패 뒤 되살려 저장을 빠르게 두 번 눌러도 행사는 하나만 생긴다', async ({ page }) => {
    const TITLE = 'E2E 저장 두 번 누름 행사'
    await fillNewAndWaitDraft(page, TITLE)
    const before = (await storedEvents(page)).length

    await failMainSave(page)
    await saveButton(page).click()
    await expectFailureKeptForm(page, 'new', /#\/manage\/new$/)

    await recoverMainSave(page)
    // 같은 순간에 두 번 (화면이 다시 그려지기 전) + 이어서 더블클릭
    await page.evaluate(() => {
      const btn = document.querySelector<HTMLButtonElement>('.ef-actions button[type="submit"]')!
      btn.click()
      btn.click()
    })
    await saveButton(page)
      .dblclick({ timeout: 1000 })
      .catch(() => {
        /* 이미 화면이 바뀌었으면 누를 버튼이 없다 */
      })
    await expect(page).toHaveURL(/#\/events\/evt_/)
    await expect(toast(page, '저장했어요')).toBeVisible()
    const id = decodeURIComponent(new URL(page.url()).hash.replace(/^#\/events\//, ''))

    const after = await storedEvents(page)
    expect(after.length).toBe(before + 1)
    expect(after.filter((e) => e.title === TITLE).map((e) => e.id)).toEqual([id])

    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toContainText(TITLE)
    const reloaded = await storedEvents(page)
    expect(reloaded.length).toBe(before + 1)
    expect(reloaded.filter((e) => e.title === TITLE)).toHaveLength(1)
  })

  test('수정: 실패하면 폼·수정 초안 유지 → 되살린 뒤 다시 저장하면 한 번 저장되고 새로고침 뒤에도 남는다', async ({ page }) => {
    const MEMO = 'E2E 저장 실패 뒤 다시 저장한 메모'
    const DRAFT_KEY = draftEditKey(SAMPLE_ID)
    await openEventFormRoute(page, `/manage/edit/${SAMPLE_ID}`, SAMPLE_TITLE)
    const beforeAll = await storedEvents(page)
    const original = beforeAll.find((e) => e.id === SAMPLE_ID)!
    expect(original.memo).not.toBe(MEMO)

    const memo = eventForm(page).getByLabel('메모', { exact: true })
    await memo.fill(MEMO)
    await expect
      .poll(async () => (await readDraft(page, DRAFT_KEY))?.values.memo, { message: '수정 초안이 정상 저장되어야 함' })
      .toBe(MEMO)

    await failMainSave(page)
    await saveButton(page).click()
    await expectFailureKeptForm(page, 'edit', /#\/manage\/edit\/sample_001$/)
    await expect(memo).toHaveValue(MEMO)
    expect((await readDraft(page, DRAFT_KEY))?.values.memo).toBe(MEMO)
    const afterFail = await storedEvents(page)
    expect(afterFail.length).toBe(beforeAll.length)
    expect(afterFail.find((e) => e.id === SAMPLE_ID)).toMatchObject({ memo: original.memo, updatedAt: original.updatedAt })

    await recoverMainSave(page)
    await saveButton(page).click()
    await expect(toast(page, '저장했어요')).toBeVisible()
    // 바로 연 수정 화면이므로 상세로 이동
    await expect(page).toHaveURL(/#\/events\/sample_001$/)
    const after = await storedEvents(page)
    expect(after.length).toBe(beforeAll.length)
    expect(after.filter((e) => e.id === SAMPLE_ID)).toHaveLength(1)
    expect(after.find((e) => e.id === SAMPLE_ID)?.memo).toBe(MEMO)
    expect(await readDraft(page, DRAFT_KEY)).toBeNull()

    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toContainText(SAMPLE_TITLE)
    const reloaded = await storedEvents(page)
    expect(reloaded.length).toBe(beforeAll.length)
    expect(reloaded.find((e) => e.id === SAMPLE_ID)?.memo).toBe(MEMO)
    expect(await readDraft(page, DRAFT_KEY)).toBeNull()
  })

  test('수정: 저장 성공 뒤 빠르게 다시 눌러도 한 번만 뒤로 간다', async ({ page }) => {
    // 행사 목록 → 정보 관리 → 수정 (앱 안 기록 3개). 저장하면 정보 관리로 한 번만 돌아가야 한다.
    await openRoute(page, '/events')
    await expect(page.getByRole('heading', { level: 1, name: '행사 목록' })).toBeVisible()
    await page.evaluate(() => {
      window.location.hash = '/manage'
    })
    await expect(page.getByRole('heading', { level: 1, name: '정보 관리' })).toBeVisible()
    await page.evaluate((id) => {
      window.location.hash = `/manage/edit/${id}`
    }, SAMPLE_ID)
    await expect(eventForm(page)).toBeVisible()
    await eventForm(page).getByLabel('메모', { exact: true }).fill('E2E 두 번 누름 메모')

    await failMainSave(page)
    await saveButton(page).click()
    await expectFailureKeptForm(page, 'edit', /#\/manage\/edit\/sample_001$/)
    await recoverMainSave(page)
    await page.evaluate(() => {
      const btn = document.querySelector<HTMLButtonElement>('.ef-actions button[type="submit"]')!
      btn.click()
      btn.click()
    })
    await expect(page).toHaveURL(/#\/manage$/)
    await expect(page.getByRole('heading', { level: 1, name: '정보 관리' })).toBeVisible()
    expect((await storedEvents(page)).find((e) => e.id === SAMPLE_ID)?.memo).toBe('E2E 두 번 누름 메모')
  })

  test('수정 화면에서 삭제: 저장이 실패하면 삭제 안내 없이 그 화면에 남고, 새로고침 뒤에도 행사·초안이 남는다', async ({ page }) => {
    const MEMO = 'E2E 삭제 실패 전에 적은 메모'
    const DRAFT_KEY = draftEditKey(SAMPLE_ID)
    await openEventFormRoute(page, `/manage/edit/${SAMPLE_ID}`, SAMPLE_TITLE)
    const before = (await storedEvents(page)).length
    const memo = eventForm(page).getByLabel('메모', { exact: true })
    await memo.fill(MEMO)
    await expect.poll(async () => (await readDraft(page, DRAFT_KEY))?.values.memo).toBe(MEMO)

    await failMainSave(page)
    await page.getByRole('button', { name: '이 행사 삭제' }).click()
    await answerConfirm(page, '이 행사를 삭제할까요?', '삭제')
    await expect(failToast(page)).toBeVisible()
    await expect(page.locator('.toasts .toast').filter({ hasText: '삭제했어요' })).toHaveCount(0)
    await expect(page).toHaveURL(/#\/manage\/edit\/sample_001$/)
    await expect(eventForm(page)).toBeVisible()
    await expect(memo).toHaveValue(MEMO)
    expect((await readDraft(page, DRAFT_KEY))?.values.memo).toBe(MEMO)
    const afterFail = await storedEvents(page)
    expect(afterFail.length).toBe(before)
    expect(afterFail.some((e) => e.id === SAMPLE_ID)).toBe(true)

    // 새로고침(저장 실패 흉내도 풀림) → 행사와 초안이 남아 있다
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('행사 수정')
    await expect(page.getByText('행사를 찾을 수 없어요')).toHaveCount(0)
    const reloaded = await storedEvents(page)
    expect(reloaded.length).toBe(before)
    expect(reloaded.some((e) => e.id === SAMPLE_ID)).toBe(true)
    expect((await readDraft(page, DRAFT_KEY))?.values.memo).toBe(MEMO)
    await expect(page.getByRole('status').filter({ hasText: '저장하지 않은 초안이 있어요' })).toBeVisible()
  })
})
