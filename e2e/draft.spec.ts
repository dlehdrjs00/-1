/**
 * 행사 등록·수정 폼 초안 (2차 변경 2).
 * - 키: 'subcul-trip-planner:v1:draft:new' / '...:draft:edit:<encodeURIComponent(id)>'
 * - 새로고침·브라우저 뒤로 가기 뒤 다시 열면 '저장하지 않은 초안이 있어요 (…)' + [초안 복구]/[버리기]
 *   (고르기 전까지 폼은 inert)
 * - 저장·버리기·나가기 확인·행사 삭제·샘플 모두 삭제·전체 초기화 때 초안을 지운다
 * - 초안을 만든 뒤 행사가 바뀌었으면 경고
 */
import type { Dialog } from '@playwright/test'
import {
  test,
  expect,
  openRoute,
  navTo,
  eventForm,
  eventFormActions,
  submitEventForm,
  registerEvent,
  answerConfirm,
  readStored,
  toast,
} from './helpers'
import {
  DRAFT_NEW_KEY,
  draftEditKey,
  draftBanner,
  readDraft,
  waitForDraft,
  rawEventForm,
  canFocus,
  openEventFormRoute,
} from './round2-helpers'

const SAMPLE_001_TITLE = '[샘플] 가상 콜라보 카페 A'

test.describe('행사 폼 초안', () => {
  test('새 행사: 입력 → 새로고침 → 초안 안내(폼 잠김) → 복구 → 저장하면 초안이 사라진다', async ({ page }) => {
    const dialogs: string[] = []
    page.on('dialog', (d: Dialog) => {
      dialogs.push(d.type())
      void d.accept()
    })
    await openRoute(page, '/manage/new')
    await expect(draftBanner(page)).toHaveCount(0)
    const form = eventForm(page)
    const title = form.getByRole('textbox', { name: '행사명' })
    // 클릭·타자로 입력 (사용자 활성화가 있어야 beforeunload 경고가 뜰 수 있으므로 실제 입력처럼)
    await title.click()
    await page.keyboard.type('E2E 초안 새 행사')
    await form.getByRole('group', { name: '관련 작품' }).getByRole('button', { name: '명일방주', exact: true }).click()

    // 자동 저장(약 0.4초) 기다리지 않고 바로 새로고침: 페이지를 떠날 때 바로 저장되어야 한다
    await page.reload()
    await expect(page.locator('main.main')).toBeVisible()
    expect(dialogs, '새로고침 때 beforeunload 경고가 뜨지 않아야 함 (초안으로 보관됨)').toEqual([])

    const draft = await readDraft(page, DRAFT_NEW_KEY)
    expect(draft).toMatchObject({ v: 1, kind: 'new', eventId: null, baseUpdatedAt: null })
    expect(draft!.values).toMatchObject({ title: 'E2E 초안 새 행사', works: ['arknights'] })

    // 안내 + 폼·저장 바는 잠김
    const banner = draftBanner(page)
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('저장하지 않은 초안이 있어요 (11월 23일 12:00)')
    await expect(banner).not.toContainText('이 초안을 만든 뒤 행사가 수정되었어요')
    await expect(rawEventForm(page)).toHaveAttribute('inert')
    await expect(page.locator('.ef-actions')).toHaveAttribute('inert')
    expect(await canFocus(rawEventForm(page).locator('input[type="text"]').first()), '잠긴 폼에는 포커스가 가지 않음').toBe(false)
    // 고르기 전에는 빈 폼 (초안으로 덮어쓰지 않음) + 초안도 그대로
    await expect(rawEventForm(page).locator('input[type="text"]').first()).toHaveValue('')
    expect((await readDraft(page, DRAFT_NEW_KEY))?.values.title).toBe('E2E 초안 새 행사')

    // 복구
    await banner.getByRole('button', { name: '초안 복구' }).click()
    await expect(toast(page, '초안을 복구했어요')).toBeVisible()
    await expect(draftBanner(page)).toHaveCount(0)
    await expect(rawEventForm(page)).not.toHaveAttribute('inert')
    await expect(title).toHaveValue('E2E 초안 새 행사')
    await expect(form.getByRole('group', { name: '관련 작품' }).getByRole('button', { name: '명일방주', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // 저장 → 초안 삭제
    await submitEventForm(page)
    await expect(page).toHaveURL(/#\/events\/evt/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('E2E 초안 새 행사')
    expect(await readDraft(page, DRAFT_NEW_KEY)).toBeNull()
    await openEventFormRoute(page, '/manage/new')
    await expect(eventForm(page)).toBeVisible()
    await expect(draftBanner(page)).toHaveCount(0)
    await expect(eventForm(page).getByRole('textbox', { name: '행사명' })).toHaveValue('')
    expect(await readDraft(page, DRAFT_NEW_KEY)).toBeNull()
    expect((await readStored(page)).events.filter((e) => e.title === 'E2E 초안 새 행사')).toHaveLength(1)
    expect(dialogs).toEqual([])
  })

  test('브라우저 뒤로 가기로 나갔다가 앞으로 가기/다시 열면 초안을 복구할 수 있다', async ({ page }) => {
    await openRoute(page, '/manage')
    await page.getByRole('link', { name: '+ 행사 등록' }).first().click()
    await expect(page).toHaveURL(/#\/manage\/new$/)
    await eventForm(page).getByRole('textbox', { name: '행사명' }).fill('E2E 뒤로 가기 초안')
    await eventForm(page).getByLabel('메모', { exact: true }).fill('뒤로 가기 전에 적은 메모')

    // 브라우저 뒤로 가기 (메뉴 이동 확인 없이 나감) → 화면을 벗어날 때 바로 저장
    await page.goBack()
    await expect(page).toHaveURL(/#\/manage$/)
    await expect(page.getByRole('heading', { level: 1, name: '정보 관리' })).toBeVisible()
    expect((await readDraft(page, DRAFT_NEW_KEY))?.values).toMatchObject({
      title: 'E2E 뒤로 가기 초안',
      memo: '뒤로 가기 전에 적은 메모',
    })

    // 앞으로 가기 → 안내 → 복구
    await page.goForward()
    await expect(page).toHaveURL(/#\/manage\/new$/)
    await expect(draftBanner(page)).toBeVisible()
    await draftBanner(page).getByRole('button', { name: '초안 복구' }).click()
    await expect(eventForm(page).getByRole('textbox', { name: '행사명' })).toHaveValue('E2E 뒤로 가기 초안')
    await expect(eventForm(page).getByLabel('메모', { exact: true })).toHaveValue('뒤로 가기 전에 적은 메모')

    // 다시 뒤로 가기 → 메뉴에서 새로 열어도 안내
    await page.goBack()
    await expect(page).toHaveURL(/#\/manage$/)
    await page.getByRole('link', { name: '+ 행사 등록' }).first().click()
    await expect(draftBanner(page)).toBeVisible()
    await draftBanner(page).getByRole('button', { name: '초안 복구' }).click()
    await expect(eventForm(page).getByRole('textbox', { name: '행사명' })).toHaveValue('E2E 뒤로 가기 초안')
  })

  test('행사별 수정 초안: sample_001 초안은 sample_002 수정·새 행사에서는 나오지 않고 sample_001 에서만 나온다', async ({ page }) => {
    await openRoute(page, '/manage/edit/sample_001')
    await eventForm(page).getByRole('textbox', { name: '행사명' }).fill('E2E sample_001 수정 초안')
    await waitForDraft(page, draftEditKey('sample_001'), 'E2E sample_001 수정 초안')
    const d = await readDraft(page, draftEditKey('sample_001'))
    expect(d).toMatchObject({ kind: 'edit', eventId: 'sample_001' })
    expect(typeof d!.baseUpdatedAt).toBe('string')

    await openEventFormRoute(page, '/manage/edit/sample_002', '[샘플] 가상 겨울 팝업스토어 B')
    await expect(eventForm(page)).toBeVisible()
    await expect(draftBanner(page)).toHaveCount(0)
    await expect(eventForm(page).getByRole('textbox', { name: '행사명' })).toHaveValue('[샘플] 가상 겨울 팝업스토어 B')

    await openEventFormRoute(page, '/manage/new')
    await expect(eventForm(page)).toBeVisible()
    await expect(draftBanner(page)).toHaveCount(0)
    await expect(eventForm(page).getByRole('textbox', { name: '행사명' })).toHaveValue('')

    // 다른 화면을 연 것만으로는 sample_001 초안이 지워지지 않는다
    expect((await readDraft(page, draftEditKey('sample_001')))?.values.title).toBe('E2E sample_001 수정 초안')
    expect(await readDraft(page, DRAFT_NEW_KEY)).toBeNull()
    expect(await readDraft(page, draftEditKey('sample_002'))).toBeNull()

    await openEventFormRoute(page, '/manage/edit/sample_001', SAMPLE_001_TITLE)
    await expect(draftBanner(page)).toBeVisible()
    await expect(draftBanner(page)).not.toContainText('이 초안을 만든 뒤 행사가 수정되었어요')
    // 고르기 전에는 저장된 값 그대로
    await expect(rawEventForm(page).locator('input[type="text"]').first()).toHaveValue(SAMPLE_001_TITLE)
    await draftBanner(page).getByRole('button', { name: '초안 복구' }).click()
    await expect(eventForm(page).getByRole('textbox', { name: '행사명' })).toHaveValue('E2E sample_001 수정 초안')
    // 복구만으로는 저장되지 않는다
    expect((await readStored(page)).events.find((e) => e.id === 'sample_001')!.title).toBe(SAMPLE_001_TITLE)
  })

  test('버리기: 초안을 지우고 저장된 값을 그대로 보여 준다', async ({ page }) => {
    await openRoute(page, '/manage/edit/sample_001')
    await eventForm(page).getByRole('textbox', { name: '행사명' }).fill('E2E 버릴 초안')
    await waitForDraft(page, draftEditKey('sample_001'), 'E2E 버릴 초안')
    await page.reload()

    await expect(draftBanner(page)).toBeVisible()
    await draftBanner(page).getByRole('button', { name: '버리기' }).click()
    await expect(draftBanner(page)).toHaveCount(0)
    await expect(rawEventForm(page)).not.toHaveAttribute('inert')
    await expect(eventForm(page).getByRole('textbox', { name: '행사명' })).toHaveValue(SAMPLE_001_TITLE)
    expect(await readDraft(page, draftEditKey('sample_001'))).toBeNull()
    expect((await readStored(page)).events.find((e) => e.id === 'sample_001')!.title).toBe(SAMPLE_001_TITLE)

    // 버린 뒤 다시 열어도 안내 없음, 그대로 편집 가능
    await page.reload()
    await expect(eventForm(page)).toBeVisible()
    await expect(draftBanner(page)).toHaveCount(0)
    expect(await canFocus(eventForm(page).getByRole('textbox', { name: '행사명' }))).toBe(true)
  })

  test('메뉴 이동 확인에서 나가기를 고르면 초안을 지우고, 취소하면 남긴다', async ({ page }) => {
    await openRoute(page, '/manage/edit/sample_001')
    await eventForm(page).getByRole('textbox', { name: '행사명' }).fill('E2E 나가기 초안')
    await waitForDraft(page, draftEditKey('sample_001'), 'E2E 나가기 초안')

    // 취소 → 폼에 남고 초안도 그대로
    await navTo(page, '행사')
    await answerConfirm(page, '저장하지 않고 나갈까요?', '취소')
    await expect(page).toHaveURL(/#\/manage\/edit\/sample_001$/)
    expect((await readDraft(page, draftEditKey('sample_001')))?.values.title).toBe('E2E 나가기 초안')

    // 나가기 → 초안 삭제
    await navTo(page, '행사')
    await answerConfirm(page, '저장하지 않고 나갈까요?', '나가기')
    await expect(page).toHaveURL(/#\/events$/)
    await expect(page.getByRole('heading', { level: 1, name: '행사 목록' })).toBeVisible()
    expect(await readDraft(page, draftEditKey('sample_001'))).toBeNull()

    await openEventFormRoute(page, '/manage/edit/sample_001', SAMPLE_001_TITLE)
    await expect(eventForm(page)).toBeVisible()
    await expect(draftBanner(page)).toHaveCount(0)
    await expect(eventForm(page).getByRole('textbox', { name: '행사명' })).toHaveValue(SAMPLE_001_TITLE)
    // 폼 안 '취소' 버튼 → 나가기 도 초안을 지운다
    await eventForm(page).getByRole('textbox', { name: '행사명' }).fill('E2E 취소 버튼 초안')
    await waitForDraft(page, draftEditKey('sample_001'), 'E2E 취소 버튼 초안')
    await eventFormActions(page).getByRole('button', { name: '취소' }).click()
    await answerConfirm(page, '저장하지 않고 나갈까요?', '나가기')
    await expect(page).not.toHaveURL(/#\/manage\/edit\//)
    expect(await readDraft(page, draftEditKey('sample_001'))).toBeNull()
  })

  test('수정 화면에서 행사를 삭제하면 그 행사의 초안도 지운다', async ({ page }) => {
    const id = await registerEvent(page, { title: 'E2E 초안 있는 삭제 행사', works: ['기타'] })
    const key = draftEditKey(id)
    await openRoute(page, `/manage/edit/${encodeURIComponent(id)}`)
    await eventForm(page).getByLabel('메모', { exact: true }).fill('삭제 전에 적은 메모')
    await waitForDraft(page, key)

    await page.getByRole('button', { name: '이 행사 삭제' }).click()
    await answerConfirm(page, '이 행사를 삭제할까요?', '삭제')
    await expect(page).toHaveURL(/#\/manage$/)
    // 화면을 벗어나며 다시 저장하지 않도록
    await page.waitForTimeout(600)
    expect(await readDraft(page, key)).toBeNull()
    expect((await readStored(page)).events.some((e) => e.id === id)).toBe(false)
  })

  test('샘플 모두 삭제는 샘플 수정 초안만, 전체 초기화는 모든 초안을 지운다', async ({ page }) => {
    // 샘플 수정 초안 + 새 행사 초안 (화면 이동은 해시로 바로 → 나가기 확인 없이 초안이 남는다)
    await openRoute(page, '/manage/edit/sample_002')
    await eventForm(page).getByLabel('메모', { exact: true }).fill('샘플 초안')
    await waitForDraft(page, draftEditKey('sample_002'))
    await openEventFormRoute(page, '/manage/new')
    await eventForm(page).getByRole('textbox', { name: '행사명' }).fill('E2E 새 행사 초안 (초기화 전)')
    await waitForDraft(page, DRAFT_NEW_KEY, 'E2E 새 행사 초안 (초기화 전)')
    await openRoute(page, '/manage')
    await expect(page.getByRole('heading', { level: 1, name: '정보 관리' })).toBeVisible()
    expect(await readDraft(page, draftEditKey('sample_002'))).not.toBeNull()

    await page.getByRole('button', { name: '샘플 모두 삭제' }).click()
    await answerConfirm(page, '샘플 행사를 모두 삭제할까요?', '샘플 모두 삭제')
    await expect(toast(page, '샘플 행사 13개를 삭제했어요.')).toBeVisible()
    expect(await readDraft(page, draftEditKey('sample_002'))).toBeNull()
    expect((await readDraft(page, DRAFT_NEW_KEY))?.values.title).toBe('E2E 새 행사 초안 (초기화 전)')

    await page.getByRole('button', { name: '모든 데이터 초기화' }).click()
    const dlg = page.getByRole('dialog', { name: '모든 데이터를 초기화할까요?' })
    await dlg.getByRole('textbox').fill('초기화')
    await dlg.getByRole('button', { name: '초기화', exact: true }).click()
    await expect(toast(page, '모든 데이터를 초기화했어요.')).toBeVisible()
    const left = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes(':draft:')))
    expect(left).toEqual([])
    await openEventFormRoute(page, '/manage/new')
    await expect(eventForm(page)).toBeVisible()
    await expect(draftBanner(page)).toHaveCount(0)
  })

  test('초안을 만든 뒤 행사가 다른 곳(다른 탭)에서 수정되면 복구 안내에 경고가 나온다', async ({ page, context }) => {
    await openRoute(page, '/events')
    // 다른 탭: 30분 뒤 시각으로 (수정 시각 updatedAt 이 달라지도록)
    const other = await context.newPage()
    await other.clock.setFixedTime(new Date('2026-11-23T12:30:00+09:00'))
    await openRoute(other, '/manage/edit/sample_001')
    await expect(eventForm(other)).toBeVisible()

    // 이 탭: 수정 초안 작성 (기준 시각 = 지금 저장된 updatedAt)
    await expect(page.getByRole('heading', { level: 1, name: '행사 목록' })).toBeVisible()
    await openEventFormRoute(page, '/manage/edit/sample_001', SAMPLE_001_TITLE)
    const title = eventForm(page).getByRole('textbox', { name: '행사명' })
    await title.fill('E2E 이 탭의 초안')
    await waitForDraft(page, draftEditKey('sample_001'), 'E2E 이 탭의 초안')
    const base = (await readDraft(page, draftEditKey('sample_001')))!.baseUpdatedAt

    // 다른 탭에서 같은 행사를 수정·저장
    await eventForm(other).getByLabel('메모', { exact: true }).fill('E2E 다른 탭에서 저장한 메모')
    await eventFormActions(other).getByRole('button', { name: '변경 내용 저장' }).click()
    await expect(other).toHaveURL(/#\/events\/sample_001$/)
    const updated = (await readStored(page)).events.find((e) => e.id === 'sample_001') as unknown as { updatedAt: string }
    expect(updated.updatedAt).not.toBe(base)
    await other.close()

    // 이 탭에서 계속 입력 → 초안 (기준 시각은 처음 그대로)
    await title.fill('E2E 이 탭의 초안 (계속)')
    await waitForDraft(page, draftEditKey('sample_001'), 'E2E 이 탭의 초안 (계속)')
    expect((await readDraft(page, draftEditKey('sample_001')))!.baseUpdatedAt).toBe(base)

    await page.reload()
    const banner = draftBanner(page)
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('이 초안을 만든 뒤 행사가 수정되었어요')
    await expect(page.locator('.notice--warning').filter({ hasText: '저장하지 않은 초안이 있어요' })).toBeVisible()
    // 고르기 전에는 지금 저장된 값(다른 탭의 수정 포함)
    await expect(rawEventForm(page).locator('textarea')).toHaveValue('E2E 다른 탭에서 저장한 메모')
    await banner.getByRole('button', { name: '초안 복구' }).click()
    await expect(title).toHaveValue('E2E 이 탭의 초안 (계속)')
  })

  test('입력 중 새로고침은 beforeunload 경고 없이 바로 끝난다', async ({ page }) => {
    const dialogs: string[] = []
    page.on('dialog', (d: Dialog) => {
      dialogs.push(d.type())
      void d.accept()
    })
    await openRoute(page, '/manage/edit/sample_003')
    const title = eventForm(page).getByRole('textbox', { name: '행사명' })
    await title.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' (E2E 새로고침)')
    await eventForm(page).getByRole('radio', { name: '전시', exact: true }).check()
    await page.reload({ timeout: 10_000 })
    await expect(draftBanner(page)).toBeVisible()
    expect(dialogs).toEqual([])
    await draftBanner(page).getByRole('button', { name: '초안 복구' }).click()
    await expect(title).toHaveValue(/\(E2E 새로고침\)$/)
  })

  test('입력을 원래 값으로 되돌리면 초안도 지운다', async ({ page }) => {
    await openRoute(page, '/manage/edit/sample_001')
    const title = eventForm(page).getByRole('textbox', { name: '행사명' })
    await title.fill('E2E 잠깐 바꾼 제목')
    await waitForDraft(page, draftEditKey('sample_001'), 'E2E 잠깐 바꾼 제목')
    await title.fill(SAMPLE_001_TITLE)
    await expect.poll(() => readDraft(page, draftEditKey('sample_001'))).toBeNull()
    await page.reload()
    await expect(eventForm(page)).toBeVisible()
    await expect(draftBanner(page)).toHaveCount(0)
  })

  // 2차 검증에서 발견해 수정: 초안 키는 행사별로 탭끼리 공유되므로 다른 탭이 저장하며 지울 수 있다.
  // 이제 이 탭은 페이지를 떠날 때(pagehide·beforeunload·화면 이탈) 입력이 바뀌어 있으면 항상 초안을 다시 쓴다.
  test('다른 탭이 같은 행사를 저장해도, 이 탭의 저장하지 않은 입력은 새로고침 뒤 초안으로 남는다', async ({ page, context }) => {
    const dialogs: string[] = []
    page.on('dialog', (d: Dialog) => {
      dialogs.push(d.type())
      void d.accept()
    })
    await openRoute(page, '/events')
    const other = await context.newPage()
    await other.clock.setFixedTime(new Date('2026-11-23T12:30:00+09:00'))
    await openRoute(other, '/manage/edit/sample_001')
    await expect(eventForm(other)).toBeVisible()

    await expect(page.getByRole('heading', { level: 1, name: '행사 목록' })).toBeVisible()
    await openEventFormRoute(page, '/manage/edit/sample_001', SAMPLE_001_TITLE)
    await eventForm(page).getByRole('textbox', { name: '행사명' }).fill('E2E 이 탭에서만 고친 제목')
    await waitForDraft(page, draftEditKey('sample_001'), 'E2E 이 탭에서만 고친 제목')

    // 다른 탭: 메모만 고쳐 저장
    await eventForm(other).getByLabel('메모', { exact: true }).fill('E2E 다른 탭 메모')
    await eventFormActions(other).getByRole('button', { name: '변경 내용 저장' }).click()
    await expect(other).toHaveURL(/#\/events\/sample_001$/)
    await other.close()

    // 이 탭: 더 입력하지 않고 새로고침 → 경고도 없었으므로 초안으로 남아 있어야 한다
    await page.reload()
    await expect(eventForm(page).or(rawEventForm(page))).toBeVisible()
    expect(dialogs).toEqual([])
    await expect(draftBanner(page)).toBeVisible({ timeout: 3_000 })
    await draftBanner(page).getByRole('button', { name: '초안 복구' }).click()
    await expect(eventForm(page).getByRole('textbox', { name: '행사명' })).toHaveValue('E2E 이 탭에서만 고친 제목')
  })
})
