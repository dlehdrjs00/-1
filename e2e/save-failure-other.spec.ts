/**
 * 저장 실패 처리 — 행사 폼 밖의 저장 동작 (불러오기·관심·여행에 추가·샘플 삭제·여행 만들기).
 *
 * 앱 본문 키 저장만 실패시킨 뒤(failMainSave) 확인한다:
 * - 성공 알림·화면 이동·대화상자 닫기·초안 정리가 일어나지 않는다
 * - 오류 알림이 뜨고, 저장된 데이터와 화면의 데이터는 그대로다
 * - 저장을 되살리면(recoverMainSave) 같은 동작을 다시 해서 정확히 한 번 반영된다
 */
import type { Page } from '@playwright/test'
import {
  test,
  expect,
  openRoute,
  toast,
  answerConfirm,
  readStored,
  openAddToTrip,
  eventForm,
  SAMPLE_COUNT,
  DEFAULT_TRIP_ID,
} from './helpers'
import { failMainSave, recoverMainSave } from './save-failure-helpers'
import { draftEditKey, readDraft, waitForDraft } from './round2-helpers'

const SAVE_FAILED = '저장하지 못했어요. 브라우저 저장 공간을 확인한 뒤 다시 시도해 주세요.'

const errorToast = (page: Page, text: string | RegExp = SAVE_FAILED) =>
  page.locator('.toasts .toast--error').filter({ hasText: text })
const successToasts = (page: Page) => page.locator('.toasts .toast--success')

const exportBox = (page: Page) =>
  page.locator('.manage-backup__box').filter({ has: page.getByRole('heading', { name: 'JSON 내보내기' }) })
const importError = (page: Page) => page.getByRole('alert').filter({ hasText: '불러오지 못했어요' })

test.describe('저장 실패 — 폼 밖의 저장 동작', () => {
  test('JSON 불러오기: 완료 안내 없이 오류, 기존 데이터 유지 → 복구 후 같은 파일을 불러오면 바뀐다', async ({ page }) => {
    await openRoute(page, '/manage')
    await expect(exportBox(page)).toContainText(`행사 ${SAMPLE_COUNT}개 · 관심 0개 · 여행 1개`)
    const before = await readStored(page)
    // 검증을 통과하는 백업 파일: 지금 데이터 + 관심 2개
    const file = {
      name: 'e2e-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ ...before, favorites: ['sample_001', 'sample_002'] }), 'utf8'),
    }
    const importOnce = async () => {
      await page.getByLabel('불러올 JSON 백업 파일 선택').setInputFiles(file)
      await answerConfirm(page, '이 파일로 데이터를 바꿀까요?', '불러와서 바꾸기')
    }

    await failMainSave(page)
    await importOnce()
    await expect(errorToast(page, '기존 데이터는 그대로예요')).toBeVisible()
    await expect(errorToast(page)).toContainText(SAVE_FAILED)
    await expect(page.locator('.toasts .toast').filter({ hasText: '불러오기 완료' })).toHaveCount(0)
    await expect(importError(page)).toContainText('e2e-backup.json')
    await expect(importError(page)).toContainText('기존 데이터는 그대로 유지')
    await expect(exportBox(page)).toContainText(`행사 ${SAMPLE_COUNT}개 · 관심 0개 · 여행 1개`)
    expect(await readStored(page)).toEqual(before)

    await page.reload()
    await expect(exportBox(page)).toContainText(`행사 ${SAMPLE_COUNT}개 · 관심 0개 · 여행 1개`)
    expect(await readStored(page)).toEqual(before)

    // 같은 화면에서 다시 실패 → 저장 복구 → 같은 파일로 재시도
    await failMainSave(page)
    await importOnce()
    await expect(errorToast(page, '기존 데이터는 그대로예요')).toBeVisible()
    await recoverMainSave(page)
    await importOnce()
    await expect(toast(page, `불러오기 완료: 행사 ${SAMPLE_COUNT}개, 관심 2개, 여행 1개`)).toBeVisible()
    await expect(importError(page)).toHaveCount(0)
    await expect(exportBox(page)).toContainText(`행사 ${SAMPLE_COUNT}개 · 관심 2개 · 여행 1개`)

    await page.reload()
    expect((await readStored(page)).favorites).toEqual(['sample_001', 'sample_002'])
  })

  test('관심 저장: 별이 켜지지 않고 오류만 → 복구 후 저장된다', async ({ page }) => {
    await openRoute(page, '/events/sample_001')
    const favBtn = page.getByRole('button', { name: '관심 저장', exact: true })
    await expect(favBtn).toHaveAttribute('aria-pressed', 'false')

    await failMainSave(page)
    await favBtn.click()
    await expect(errorToast(page)).toBeVisible()
    await expect(page.locator('.toasts .toast').filter({ hasText: '관심 행사에 저장했어요.' })).toHaveCount(0)
    await expect(favBtn).toHaveAttribute('aria-pressed', 'false')
    expect((await readStored(page)).favorites).toEqual([])

    await recoverMainSave(page)
    await favBtn.click()
    await expect(toast(page, '관심 행사에 저장했어요.')).toBeVisible()
    await expect(page.getByRole('button', { name: '관심 저장 취소', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.reload()
    expect((await readStored(page)).favorites).toEqual(['sample_001'])
  })

  test('여행에 추가: 대화상자·입력값 유지, 일정 추가 없음 → 복구 후 재시도하면 정확히 하나 추가', async ({ page }) => {
    const MEMO = 'E2E 저장 실패 후 재시도'
    await openRoute(page, '/events/sample_001')
    const itemsOf = async () => (await readStored(page)).trips.find((t) => t.id === DEFAULT_TRIP_ID)!.items
    const before = await itemsOf()

    await failMainSave(page)
    const dlg = await openAddToTrip(page)
    await dlg.getByLabel('날짜').selectOption('2027-01-09')
    await dlg.getByLabel('메모').fill(MEMO)
    const addBtn = dlg.getByRole('button', { name: /^(일정에 추가|그래도 추가)$/ })
    await addBtn.click()
    await expect(errorToast(page)).toBeVisible()
    await expect(successToasts(page)).toHaveCount(0)
    await expect(dlg).toBeVisible()
    await expect(dlg.getByLabel('메모')).toHaveValue(MEMO)
    expect(await itemsOf()).toEqual(before)

    await recoverMainSave(page)
    await addBtn.click()
    await expect(dlg).toBeHidden()
    await expect(toast(page, /일정에 추가했어요/)).toBeVisible()
    await page.reload()
    const after = await itemsOf()
    expect(after).toHaveLength(before.length + 1)
    expect(after.filter((i) => i.memo === MEMO)).toEqual([
      expect.objectContaining({ date: '2027-01-09', kind: 'event', eventId: 'sample_001' }),
    ])
  })

  test('샘플 모두 삭제: 샘플·샘플 수정 초안이 그대로, 완료 안내 없음 → 저장되면 그때 초안도 지운다', async ({ page }) => {
    // 샘플 행사의 저장하지 않은 수정 초안
    await openRoute(page, '/manage/edit/sample_001')
    await eventForm(page).getByRole('textbox', { name: '행사명' }).fill('E2E 샘플 수정 초안')
    await waitForDraft(page, draftEditKey('sample_001'), 'E2E 샘플 수정 초안')

    await openRoute(page, '/manage')
    await failMainSave(page)
    await page.getByRole('button', { name: '샘플 모두 삭제' }).click()
    await answerConfirm(page, '샘플 행사를 모두 삭제할까요?', '샘플 모두 삭제')
    await expect(errorToast(page, '샘플 행사는 삭제되지 않았어요')).toBeVisible()
    await expect(page.locator('.toasts .toast').filter({ hasText: /샘플 행사 \d+개를 삭제했어요/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '샘플 모두 삭제' })).toBeVisible()
    expect((await readDraft(page, draftEditKey('sample_001')))?.values.title).toBe('E2E 샘플 수정 초안')

    await page.reload()
    expect((await readStored(page)).events.filter((e) => e.isSample)).toHaveLength(SAMPLE_COUNT)
    expect((await readDraft(page, draftEditKey('sample_001')))?.values.title).toBe('E2E 샘플 수정 초안')

    // 저장이 되는 상태(새로고침으로 실패 해제)에서는 삭제와 함께 초안도 지운다
    await page.getByRole('button', { name: '샘플 모두 삭제' }).click()
    await answerConfirm(page, '샘플 행사를 모두 삭제할까요?', '샘플 모두 삭제')
    await expect(toast(page, `샘플 행사 ${SAMPLE_COUNT}개를 삭제했어요.`)).toBeVisible()
    expect(await readDraft(page, draftEditKey('sample_001'))).toBeNull()
    expect((await readStored(page)).events.filter((e) => e.isSample)).toHaveLength(0)
  })

  test('새 여행 만들기: 대화상자·입력값 유지, 여행 안 생김, 이동 없음 → 복구 후 하나만 생긴다', async ({ page }) => {
    const NAME = '[샘플] E2E 저장 실패 여행'
    await openRoute(page, '/trips')
    const before = await readStored(page)

    await failMainSave(page)
    await page.getByRole('button', { name: '+ 새 여행' }).click()
    const dlg = page.getByRole('dialog', { name: '새 여행 만들기' })
    await dlg.getByLabel('여행 이름').fill(NAME)
    await dlg.getByLabel('시작일').fill('2027-02-01')
    await dlg.getByLabel('종료일').fill('2027-02-03')
    const saveBtn = dlg.getByRole('button', { name: '저장', exact: true })
    await saveBtn.click()
    await expect(errorToast(page)).toBeVisible()
    await expect(successToasts(page)).toHaveCount(0)
    await expect(dlg).toBeVisible()
    await expect(dlg.getByLabel('여행 이름')).toHaveValue(NAME)
    await expect(page).toHaveURL(/#\/trips$/)
    expect((await readStored(page)).trips).toEqual(before.trips)

    await recoverMainSave(page)
    await saveBtn.click()
    await expect(dlg).toBeHidden()
    await expect(page).toHaveURL(/#\/trips\/trip_/)
    await page.reload()
    const trips = (await readStored(page)).trips
    expect(trips).toHaveLength(before.trips.length + 1)
    expect(trips.filter((t) => t.name === NAME)).toHaveLength(1)
  })

  test('여행 전환은 저장이 실패해도 이동한다 (보기 동작이므로 오류 알림 없음)', async ({ page }) => {
    await openRoute(page, '/trips')
    // 두 번째 여행을 넣고 활성 여행으로 저장
    await page.evaluate(
      ({ key, tripId }) => {
        const d = JSON.parse(localStorage.getItem(key)!)
        const base = d.trips.find((t: { id: string }) => t.id === tripId)
        d.trips.push({ ...base, id: 'trip_e2e_second', name: 'E2E 두 번째 여행', items: [] })
        d.activeTripId = 'trip_e2e_second'
        localStorage.setItem(key, JSON.stringify(d))
      },
      { key: 'subcul-trip-planner:v1', tripId: DEFAULT_TRIP_ID },
    )
    await page.reload()
    await expect(page.getByRole('navigation', { name: '여행 선택' })).toBeVisible()
    await failMainSave(page)
    await page.getByRole('navigation', { name: '여행 선택' }).getByRole('button', { name: /도쿄 여행/ }).click()
    await expect(page).toHaveURL(new RegExp(`#/trips/${DEFAULT_TRIP_ID}$`))
    await expect(page.getByRole('heading', { level: 2, name: '도쿄 여행' })).toBeVisible()
    await expect(errorToast(page)).toHaveCount(0)
    // 활성 여행 저장은 실패했으므로 저장된 값은 그대로
    expect((await readStored(page)).activeTripId).toBe('trip_e2e_second')
    await recoverMainSave(page)
  })
})
