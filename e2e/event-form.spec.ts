import {
  test,
  expect,
  openRoute,
  eventForm,
  fillEventForm,
  submitEventForm,
  registerEvent,
  infoValue,
  readStored,
  toast,
  SAMPLE_COUNT,
} from './helpers'

test.describe('행사 등록 폼 검증', () => {
  test('빈 폼을 저장하면 한국어 오류가 표시되고 아무것도 저장되지 않는다', async ({ page }) => {
    await openRoute(page, '/manage/new')
    const form = eventForm(page)
    await submitEventForm(page)

    // 오류 요약
    const summary = page.getByRole('alert').filter({ hasText: '입력 내용을 확인해 주세요' })
    await expect(summary).toBeVisible()
    await expect(summary).toContainText('입력 내용을 확인해 주세요 (2개)')
    await expect(summary).toContainText('행사명: 행사명을 입력하세요.')
    await expect(summary).toContainText('관련 작품: 관련 작품을 1개 이상 선택하세요.')

    // 각 항목 옆 인라인 오류 (입력 칸의 설명으로 연결)
    const title = form.getByRole('textbox', { name: '행사명' })
    await expect(title).toHaveAttribute('aria-invalid', 'true')
    await expect(title).toHaveAccessibleDescription('행사명을 입력하세요.')
    await expect(form.getByRole('group', { name: '관련 작품' })).toHaveAccessibleDescription(/관련 작품을 1개 이상 선택하세요/)
    // 첫 번째 오류 칸으로 포커스 이동
    await expect(title).toBeFocused()

    // 저장되지 않음: 화면 그대로, 저장소에도 추가 없음
    await expect(page).toHaveURL(/#\/manage\/new$/)
    await expect(toast(page, '저장했어요')).toHaveCount(0)
    const stored = await readStored(page)
    expect(stored.events).toHaveLength(SAMPLE_COUNT)

    // 행사명만 입력하면 작품 오류만 남는다
    await title.fill('작품 빠진 행사')
    await expect(title).not.toHaveAttribute('aria-invalid', 'true')
    await expect(summary).toContainText('(1개)')
    await submitEventForm(page)
    await expect(page).toHaveURL(/#\/manage\/new$/)
    expect((await readStored(page)).events).toHaveLength(SAMPLE_COUNT)

    // 새로고침해도 저장된 것이 없다
    await openRoute(page, '/manage')
    await page.reload()
    await expect(page.getByRole('heading', { level: 2, name: /전체 행사/ })).toContainText(String(SAMPLE_COUNT))
    await expect(page.getByText('작품 빠진 행사')).toHaveCount(0)
  })

  test('종료일이 시작일보다 빠르면 오류가 표시되고 저장되지 않는다', async ({ page }) => {
    await openRoute(page, '/manage/new')
    const form = eventForm(page)
    await fillEventForm(page, {
      title: '날짜가 뒤바뀐 행사',
      works: ['원신'],
      startDate: '2027-01-13',
      endDate: '2027-01-09',
    })
    await submitEventForm(page)

    const end = form.getByLabel('종료일', { exact: true })
    await expect(end).toHaveAttribute('aria-invalid', 'true')
    await expect(end).toHaveAccessibleDescription('종료일은 시작일과 같거나 그 이후여야 해요.')
    await expect(page.getByRole('alert').filter({ hasText: '입력 내용을 확인해 주세요' })).toContainText(
      '종료일: 종료일은 시작일과 같거나 그 이후여야 해요.',
    )
    await expect(page).toHaveURL(/#\/manage\/new$/)
    let stored = await readStored(page)
    expect(stored.events).toHaveLength(SAMPLE_COUNT)
    expect(stored.events.some((e) => e.title === '날짜가 뒤바뀐 행사')).toBe(false)

    // 고치면 저장된다
    await end.fill('2027-01-14')
    await expect(end).not.toHaveAttribute('aria-invalid', 'true')
    await submitEventForm(page)
    await expect(toast(page, '저장했어요')).toBeVisible()
    await expect(page).toHaveURL(/#\/events\/evt/)
    stored = await readStored(page)
    expect(stored.events).toHaveLength(SAMPLE_COUNT + 1)
    expect(stored.events.find((e) => e.title === '날짜가 뒤바뀐 행사')).toMatchObject({
      startDate: '2027-01-13',
      endDate: '2027-01-14',
    })
  })

  test('예약 종료 시각이 시작 시각보다 빠르면 오류', async ({ page }) => {
    await openRoute(page, '/manage/new')
    const form = eventForm(page)
    await fillEventForm(page, {
      title: '예약 시각 뒤바뀜',
      works: ['명조'],
      reservation: '필수',
      reservationStart: '2026-12-10T12:00',
      reservationEnd: '2026-12-01T12:00',
    })
    await submitEventForm(page)
    const resEnd = form.getByLabel(/^예약 종료 \(행사 현지 시간/)
    await expect(resEnd).toHaveAttribute('aria-invalid', 'true')
    await expect(resEnd).toHaveAccessibleDescription('예약 종료 시각은 예약 시작 시각보다 늦어야 해요.')
    await expect(page).toHaveURL(/#\/manage\/new$/)
    expect((await readStored(page)).events).toHaveLength(SAMPLE_COUNT)
  })
})

test.describe('모르는 정보는 확인 필요로 표시', () => {
  test('행사명과 작품만 등록하면 빈 항목은 모두 확인 필요, 예약 접수 중은 표시하지 않음', async ({ page }) => {
    const TITLE = '정보 거의 없는 스텔라이브 행사'
    const id = await registerEvent(page, { title: TITLE, works: ['스텔라이브'] })

    // ---------- 상세 ----------
    await expect(infoValue(page, '국가·도시')).toHaveText('국가 확인 필요 · 도시 확인 필요')
    await expect(infoValue(page, '장소')).toHaveText('확인 필요')
    await expect(infoValue(page, '주소')).toHaveText('확인 필요')
    await expect(infoValue(page, '시작일')).toHaveText('확인 필요')
    await expect(infoValue(page, '종료일')).toHaveText('확인 필요')
    await expect(infoValue(page, '예약 필요 여부')).toHaveText('확인 필요')
    await expect(infoValue(page, '예약 시작')).toHaveText('확인 필요')
    await expect(infoValue(page, '예약 종료')).toHaveText('확인 필요')
    await expect(infoValue(page, '예약 URL')).toHaveText('확인 필요')
    await expect(infoValue(page, '공식 공지')).toHaveText('확인 필요')
    await expect(infoValue(page, '마지막 확인')).toHaveText('확인 필요')

    const hero = page.locator('.ev-hero')
    await expect(hero.getByTitle('행사 진행 상태')).toHaveText(/기간 확인 필요/)
    await expect(hero.getByTitle('예약 상태')).toHaveText(/예약 확인 필요/)
    await expect(hero.locator('dl')).toContainText('기간 확인 필요')
    await expect(page.getByRole('status').filter({ hasText: '예약 정보 확인 필요' })).toBeVisible()

    // 어디에도 '예약 접수 중'으로 표시하지 않는다 (상태 배지에도 '예약 가능' 류 표현 없음)
    await expect(page.locator('main')).not.toContainText('예약 접수 중')
    await expect(page.locator('.badge').filter({ hasText: /예약 가능|접수 중/ })).toHaveCount(0)

    // ---------- 목록 카드 ----------
    await openRoute(page, '/events')
    const card = page.locator('ul.ev-list > li').filter({ hasText: TITLE })
    await expect(card).toHaveCount(1)
    await expect(card).toContainText('기간 확인 필요')
    await expect(card).toContainText('확인 필요')
    await expect(card.getByTitle('예약 상태')).toHaveText(/예약 확인 필요/)
    await expect(card).not.toContainText('예약 접수 중')

    // 저장된 값도 비어 있음 (임의로 채우지 않음)
    const stored = await readStored(page)
    expect(stored.events.find((e) => e.id === id)).toMatchObject({
      country: '',
      city: '',
      startDate: null,
      endDate: null,
      reservationRequired: 'unknown',
      reservationStart: null,
      reservationEnd: null,
    })
  })

  test('예약 필수지만 종료 시각을 모르면 예약 접수 중이 아니다', async ({ page }) => {
    const TITLE = '예약 종료 미정 행사'
    await registerEvent(page, {
      title: TITLE,
      works: ['명일방주'],
      startDate: '2026-11-01',
      endDate: '2027-02-01',
      reservation: '필수',
      reservationStart: '2026-11-01T10:00',
    })
    await expect(infoValue(page, '예약 필요 여부')).toHaveText('예약 필수')
    await expect(infoValue(page, '예약 종료')).toHaveText('확인 필요')
    await expect(page.locator('.ev-hero').getByTitle('예약 상태')).toHaveText(/예약 확인 필요/)
    await expect(page.locator('main')).not.toContainText('예약 접수 중')
  })
})
