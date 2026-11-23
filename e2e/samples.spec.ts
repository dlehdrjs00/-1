import {
  test,
  expect,
  openRoute,
  toast,
  answerConfirm,
  readStored,
  registerEvent,
  addCurrentEventToTrip,
  dayCard,
  SAMPLE_COUNT,
} from './helpers'

test.describe('샘플 데이터', () => {
  test('첫 실행 시 샘플 13개가 [샘플]·샘플 배지로 표시된다', async ({ page }) => {
    await openRoute(page, '/events')
    const cards = page.locator('ul.ev-list > li')
    // 종료된 샘플 1개(sample_004)는 기본으로 숨김
    await expect(cards).toHaveCount(SAMPLE_COUNT - 1)
    await expect(page.getByRole('button', { name: '종료 1개 숨김 · 보기' })).toBeVisible()
    for (const card of await cards.all()) {
      await expect(card.getByRole('heading', { level: 2 })).toContainText('[샘플]')
      await expect(card.locator('.badge--sample')).toHaveText('샘플')
    }
    await page.getByRole('button', { name: '종료 1개 숨김 · 보기' }).click()
    await expect(cards).toHaveCount(SAMPLE_COUNT)

    // 샘플에는 공식 URL 을 지어내지 않는다
    const stored = await readStored(page)
    expect(stored.events.every((e) => e.isSample && e.title.startsWith('[샘플]'))).toBe(true)
  })

  test('샘플 모두 삭제 → 목록·관심·일정에서 샘플이 모두 빠지고 직접 등록한 행사는 남는다', async ({ page }) => {
    // 준비: 직접 등록한 행사 1개, 샘플 관심 2개 + 일정 2개, 직접 추가 장소 1개, 내 행사 관심·일정
    const MINE = 'E2E 내가 등록한 원신 팝업'
    const mineId = await registerEvent(page, { title: MINE, works: ['원신'], startDate: '2027-01-09', endDate: '2027-01-13' })
    await page.getByRole('button', { name: '관심 저장', exact: true }).click()
    await addCurrentEventToTrip(page, { date: '2027-01-11' })

    for (const id of ['sample_001', 'sample_003']) {
      await openRoute(page, `/events/${id}`)
      await page.getByRole('button', { name: '관심 저장', exact: true }).click()
      await addCurrentEventToTrip(page, { date: '2027-01-10' })
    }
    await openRoute(page, '/trips')
    await dayCard(page, '2027. 1. 10.').getByRole('button', { name: '+ 장소 직접 추가' }).click()
    const placeDlg = page.getByRole('dialog', { name: '장소 직접 추가' })
    await placeDlg.getByLabel('장소명').fill('E2E 직접 추가 장소')
    await placeDlg.getByRole('button', { name: '일정에 추가' }).click()
    await expect(placeDlg).toBeHidden()

    // ---------- 정보 관리 → 샘플 모두 삭제 ----------
    await openRoute(page, '/manage')
    await page.getByRole('button', { name: '샘플 모두 삭제' }).click()
    const dlg = page.getByRole('dialog', { name: '샘플 행사를 모두 삭제할까요?' })
    await expect(dlg).toContainText(`시연용 샘플 행사 ${SAMPLE_COUNT}개를 삭제합니다.`)
    await expect(dlg).toContainText('관심 목록에서 샘플 행사 2개가 함께 빠집니다.')
    await expect(dlg).toContainText('여행 일정에 담긴 샘플 행사 2개도 함께 삭제됩니다.')
    await answerConfirm(page, '샘플 행사를 모두 삭제할까요?', '샘플 모두 삭제')
    await expect(toast(page, `샘플 행사 ${SAMPLE_COUNT}개를 삭제했어요.`)).toBeVisible()
    await expect(page.getByText('샘플 데이터가 없어요.')).toBeVisible()

    const verify = async () => {
      // 행사 목록: 샘플 없음, 내 행사만
      await openRoute(page, '/events')
      await expect(page.locator('main')).not.toContainText('[샘플]')
      await expect(page.locator('main .badge--sample')).toHaveCount(0)
      await expect(page.locator('ul.ev-list > li')).toHaveCount(1)
      await expect(page.locator('ul.ev-list > li')).toContainText(MINE)
      // 관심: 내 행사만
      await openRoute(page, '/favorites')
      await expect(page.locator('.favs-card')).toHaveCount(1)
      await expect(page.locator('.favs-card')).toContainText(MINE)
      // 내 여행: 샘플 일정 없음, 내 행사·직접 추가 장소는 유지
      await openRoute(page, '/trips')
      await expect(page.locator('main')).not.toContainText('[샘플]')
      await expect(page.locator('main')).not.toContainText('삭제된 행사')
      await expect(dayCard(page, '2027. 1. 10.').locator('ol.tp-items > li')).toHaveCount(1)
      await expect(dayCard(page, '2027. 1. 10.')).toContainText('E2E 직접 추가 장소')
      await expect(dayCard(page, '2027. 1. 11.')).toContainText(MINE)
      // 샘플 상세 주소는 '찾을 수 없음'
      await openRoute(page, '/events/sample_001')
      await expect(page.getByText('행사를 찾을 수 없어요')).toBeVisible()

      const stored = await readStored(page)
      expect(stored.events.map((e) => e.id)).toEqual([mineId])
      expect(stored.favorites).toEqual([mineId])
      expect(stored.trips[0].items.every((i) => i.kind === 'place' || i.eventId === mineId)).toBe(true)
      expect(stored.trips[0].items).toHaveLength(2)
    }
    await verify()
    await page.reload()
    await verify()
  })

  test('샘플 모두 삭제를 취소하면 그대로 남는다', async ({ page }) => {
    await openRoute(page, '/manage')
    await page.getByRole('button', { name: '샘플 모두 삭제' }).click()
    await answerConfirm(page, '샘플 행사를 모두 삭제할까요?', '취소')
    expect((await readStored(page)).events).toHaveLength(SAMPLE_COUNT)
    await expect(page.getByRole('button', { name: '샘플 모두 삭제' })).toBeVisible()
  })

  test('행사 하나 삭제 시 관심·일정에서도 빠진다', async ({ page }) => {
    await openRoute(page, '/events/sample_005')
    await page.getByRole('button', { name: '관심 저장', exact: true }).click()
    await addCurrentEventToTrip(page, { date: '2027-01-12' })

    await openRoute(page, '/manage')
    await page.getByRole('button', { name: '[샘플] 가상 라이브 공연 E 삭제' }).click()
    const dlg = page.getByRole('dialog', { name: '이 행사를 삭제할까요?' })
    await expect(dlg).toContainText('(현재 관심 저장됨)')
    await expect(dlg).toContainText('여행 일정 1개에서도 삭제됩니다.')
    await answerConfirm(page, '이 행사를 삭제할까요?', '삭제')
    await expect(toast(page, '행사를 삭제했어요. 여행 일정 1개도 함께 삭제했어요.')).toBeVisible()

    const stored = await readStored(page)
    expect(stored.events).toHaveLength(SAMPLE_COUNT - 1)
    expect(stored.favorites).toEqual([])
    expect(stored.trips[0].items).toEqual([])
  })
})
