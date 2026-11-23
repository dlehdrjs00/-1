import {
  test,
  expect,
  navTo,
  openRoute,
  fillEventForm,
  submitEventForm,
  toast,
  infoValue,
  dayCard,
  readStored,
  SAMPLE_COUNT,
} from './helpers'

/**
 * 기획서 [검증] 1번 흐름:
 * 행사 등록 → 관심 저장 → 여행에 추가 → 새로고침 후 유지
 */
test('행사 등록 → 관심 저장 → 여행에 추가 → 새로고침 후에도 유지', async ({ page }) => {
  const TITLE = 'E2E 프세카 콜라보 카페 겨울'
  const MEMO = '입장 특전 코스터 확인'

  await openRoute(page, '/events')

  // ---------- 정보 관리 → 행사 등록 ----------
  await navTo(page, '정보 관리')
  await expect(page.getByRole('heading', { level: 1, name: '정보 관리' })).toBeVisible()
  await page.getByRole('link', { name: '+ 행사 등록' }).first().click()
  await expect(page).toHaveURL(/#\/manage\/new$/)
  await expect(page.getByRole('heading', { level: 1, name: '행사 등록' })).toBeVisible()

  await fillEventForm(page, {
    title: TITLE,
    works: ['프로젝트 세카이'],
    type: '콜라보 카페',
    country: '일본',
    city: '도쿄',
    venue: 'E2E 테스트 카페 시부야점',
    startDate: '2027-01-08',
    endDate: '2027-01-12',
    reservation: '필수',
    reservationStart: '2026-11-20T10:00',
    reservationEnd: '2026-12-31T23:59',
  })
  // 국가를 '일본'으로 고르면 시간대가 일본 시간으로 맞춰진다
  await expect(page.getByLabel('시간대')).toHaveValue('Asia/Tokyo')
  await expect(page.getByRole('group', { name: '예약 시작 (행사 현지 시간: 일본 시간)' })).toBeVisible()
  await expect(page.getByLabel('예약 시작 날짜', { exact: true })).toHaveValue('2026-11-20')
  await expect(page.getByLabel('예약 시작 시각', { exact: true })).toHaveValue('10:00')

  await submitEventForm(page)

  // ---------- 저장 완료 → 상세 ----------
  await expect(toast(page, '저장했어요')).toBeVisible()
  await expect(page).toHaveURL(/#\/events\/evt/)
  const eventId = decodeURIComponent(new URL(page.url()).hash.replace(/^#\/events\//, ''))

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(TITLE)
  await expect(infoValue(page, '행사명')).toHaveText(TITLE)
  await expect(infoValue(page, '관련 작품')).toHaveText('프로젝트 세카이')
  await expect(infoValue(page, '행사 유형')).toContainText('콜라보 카페')
  await expect(infoValue(page, '국가·도시')).toHaveText('일본 · 도쿄')
  await expect(infoValue(page, '장소')).toHaveText('E2E 테스트 카페 시부야점')
  await expect(infoValue(page, '시작일')).toHaveText('2027. 1. 8. (금)')
  await expect(infoValue(page, '종료일')).toHaveText('2027. 1. 12. (화)')
  await expect(infoValue(page, '예약 필요 여부')).toHaveText('예약 필수')
  // 시각은 행사 현지 시간대와 함께 표시
  await expect(infoValue(page, '예약 시작')).toHaveText('2026. 11. 20. (금) 10:00 (일본 시간)')
  await expect(infoValue(page, '예약 종료')).toHaveText('2026. 12. 31. (목) 23:59 (일본 시간)')
  await expect(page.getByText('시각은 모두 일본 시간(Asia/Tokyo) 기준이에요.')).toBeVisible()
  // 진행 상태와 예약 상태를 따로 표시
  const hero = page.locator('.ev-hero')
  await expect(hero.getByTitle('행사 진행 상태')).toHaveText(/진행 예정/)
  await expect(hero.getByTitle('예약 상태')).toHaveText(/예약 접수 중/)

  // ---------- 관심 저장 ----------
  const favBtn = page.getByRole('button', { name: '관심 저장', exact: true })
  await favBtn.click()
  await expect(toast(page, '관심 행사에 저장했어요.')).toBeVisible()
  const favOn = page.getByRole('button', { name: '관심 저장 취소', exact: true })
  await expect(favOn).toHaveAttribute('aria-pressed', 'true')

  // ---------- 관심 탭 ----------
  await navTo(page, '관심')
  await expect(page).toHaveURL(/#\/favorites$/)
  await expect(page.getByRole('heading', { level: 1, name: '관심 행사' })).toBeVisible()
  const favCard = page.locator('.favs-card').filter({ hasText: TITLE })
  await expect(favCard).toHaveCount(1)
  await expect(page.locator('.favs-card')).toHaveCount(1)

  // ---------- 여행에 추가 (1/10, 14:00, 메모) ----------
  await favCard.getByRole('button', { name: '여행에 추가' }).click()
  const dlg = page.getByRole('dialog', { name: '여행에 추가' })
  await expect(dlg).toBeVisible()
  await expect(dlg.getByLabel('여행', { exact: true })).toHaveValue('trip_tokyo_2027')
  await dlg.getByLabel('날짜').selectOption('2027-01-10')
  await dlg.getByLabel('방문 시각').fill('14:00')
  await dlg.getByLabel('메모').fill(MEMO)
  // 1/10 은 행사 기간(1/8~1/12) 안이라 경고 안내가 없다 (1/13 선택지에는 '행사 기간 밖' 표시)
  await expect(dlg.getByRole('status')).toHaveCount(0)
  await expect(dlg.getByRole('option', { name: /1\/13 .*행사 기간 밖/ })).toHaveCount(1)
  await dlg.getByRole('button', { name: '일정에 추가' }).click()
  await expect(dlg).toBeHidden()
  await expect(toast(page, "'도쿄 여행' 1/10 (일) 일정에 추가했어요.")).toBeVisible()
  await expect(favCard.getByText('일정에 추가됨: 1/10')).toBeVisible()

  // ---------- 내 여행 ----------
  await navTo(page, '내 여행')
  await expect(page.getByRole('heading', { level: 2, name: '도쿄 여행' })).toBeVisible()
  const checkTrip = async () => {
    const day2 = dayCard(page, '2027. 1. 10.')
    await expect(day2).toBeVisible()
    await expect(day2.getByRole('heading', { level: 3 })).toContainText('2일차')
    const item = day2.locator('ol.tp-items > li').filter({ hasText: TITLE })
    await expect(item).toHaveCount(1)
    await expect(item.locator('.tp-time')).toHaveText('14:00')
    await expect(item).toContainText(MEMO)
    await expect(item.getByRole('link', { name: TITLE })).toHaveAttribute('href', `#/events/${eventId}`)
    // 다른 날짜에는 들어가지 않았다
    for (const d of ['2027. 1. 9.', '2027. 1. 11.', '2027. 1. 12.', '2027. 1. 13.']) {
      await expect(dayCard(page, d).getByText(TITLE)).toHaveCount(0)
    }
  }
  await checkTrip()

  // ---------- 새로고침 후 유지 ----------
  await page.reload()
  await expect(page.getByRole('heading', { level: 2, name: '도쿄 여행' })).toBeVisible()
  await checkTrip()

  const stored = await readStored(page)
  expect(stored.events).toHaveLength(SAMPLE_COUNT + 1)
  const saved = stored.events.find((e) => e.id === eventId)!
  expect(saved).toMatchObject({
    title: TITLE,
    works: ['pjsk'],
    type: 'cafe',
    country: '일본',
    city: '도쿄',
    startDate: '2027-01-08',
    endDate: '2027-01-12',
    timezone: 'Asia/Tokyo',
    reservationRequired: 'required',
    reservationStart: '2026-11-20T10:00',
    reservationEnd: '2026-12-31T23:59',
    isSample: false,
  })
  expect(stored.favorites).toEqual([eventId])
  expect(stored.trips[0].items).toEqual([
    expect.objectContaining({ date: '2027-01-10', kind: 'event', eventId, time: '14:00', memo: MEMO }),
  ])

  // 관심 목록도 유지
  await navTo(page, '관심')
  await expect(page.locator('.favs-card').filter({ hasText: TITLE })).toHaveCount(1)

  // 행사 목록에도 있고 '일정에 있음' 표시
  await navTo(page, '행사')
  const card = page.locator('ul.ev-list > li').filter({ hasText: TITLE })
  await expect(card).toHaveCount(1)
  await expect(card.getByText('일정에 있음')).toBeVisible()
  await expect(card.getByRole('button', { name: '관심 저장 취소' })).toHaveAttribute('aria-pressed', 'true')

  // 상세에도 값과 일정이 유지
  await card.getByRole('link', { name: TITLE }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(TITLE)
  await expect(infoValue(page, '예약 시작')).toHaveText('2026. 11. 20. (금) 10:00 (일본 시간)')
  await expect(page.getByRole('button', { name: '관심 저장 취소', exact: true })).toBeVisible()
  const sched = page.locator('section').filter({ has: page.getByRole('heading', { name: '내 여행 일정' }) })
  await expect(sched).toContainText('도쿄 여행')
  await expect(sched).toContainText('1/10 (일) 14:00')
})
