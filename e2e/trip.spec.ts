import {
  test,
  expect,
  openRoute,
  toast,
  answerConfirm,
  dayCard,
  dayItemTitles,
  readStored,
  openAddToTrip,
  addCurrentEventToTrip,
  DEFAULT_TRIP_ID,
} from './helpers'
import type { Page } from '@playwright/test'

function summary(page: Page) {
  return page.getByRole('region', { name: '도쿄 여행' })
}

async function addPlace(page: Page, dateText: string, name: string, opts: { address?: string; time?: string; memo?: string } = {}) {
  const day = dayCard(page, dateText)
  await day.getByRole('button', { name: '+ 장소 직접 추가' }).click()
  const dlg = page.getByRole('dialog', { name: '장소 직접 추가' })
  await expect(dlg).toBeVisible()
  await dlg.getByLabel('장소명').fill(name)
  if (opts.address) await dlg.getByLabel('주소').fill(opts.address)
  if (opts.time) await dlg.getByLabel('방문 시각').fill(opts.time)
  if (opts.memo) await dlg.getByLabel('메모').fill(opts.memo)
  await dlg.getByRole('button', { name: '일정에 추가' }).click()
  await expect(dlg).toBeHidden()
}

test.describe('내 여행', () => {
  test('기본 여행이 들어 있다 (도쿄 2027-01-09~13, 아사쿠사바시 숙소)', async ({ page }) => {
    await openRoute(page, '/trips')
    const s = summary(page)
    await expect(s).toContainText('2027. 1. 9. (토) ~ 2027. 1. 13. (수)')
    await expect(s).toContainText('4박 5일')
    await expect(s).toContainText('아사쿠사바시 근처 숙소')
    await expect(s).toContainText('일본 시간 기준')
    await expect(page.getByRole('region', { name: /일차/ })).toHaveCount(5)
  })

  test('여행 기간과 숙소를 수정하면 새로고침 후에도 유지된다', async ({ page }) => {
    await openRoute(page, '/trips')
    await summary(page).getByRole('button', { name: '여행 정보 수정' }).click()
    const dlg = page.getByRole('dialog', { name: '여행 정보 수정' })
    await expect(dlg).toBeVisible()
    await expect(dlg.getByLabel('숙소 이름')).toHaveValue('아사쿠사바시 근처 숙소')

    await dlg.getByLabel('시작일').fill('2027-01-10')
    await dlg.getByLabel('종료일').fill('2027-01-15')
    await expect(dlg.getByText('5박 6일')).toBeVisible()
    await dlg.getByLabel('숙소 이름').fill('아사쿠사바시 E2E 호텔')
    await dlg.getByLabel('숙소 주소').fill('도쿄도 다이토구 E2E 1-2-3')
    await dlg.getByRole('button', { name: '저장', exact: true }).click()
    await expect(dlg).toBeHidden()
    await expect(toast(page, '저장했어요')).toBeVisible()

    const check = async () => {
      const s = summary(page)
      await expect(s).toContainText('2027. 1. 10. (일) ~ 2027. 1. 15. (금)')
      await expect(s).toContainText('5박 6일')
      await expect(s).toContainText('아사쿠사바시 E2E 호텔')
      await expect(s).toContainText('도쿄도 다이토구 E2E 1-2-3')
      await expect(page.getByRole('region', { name: /일차/ })).toHaveCount(6)
      await expect(dayCard(page, '2027. 1. 9.')).toHaveCount(0)
      await expect(dayCard(page, '2027. 1. 15.')).toContainText('6일차')
    }
    await check()
    await page.reload()
    await check()

    const trip = (await readStored(page)).trips[0]
    expect(trip).toMatchObject({
      startDate: '2027-01-10',
      endDate: '2027-01-15',
      accommodation: { name: '아사쿠사바시 E2E 호텔', address: '도쿄도 다이토구 E2E 1-2-3' },
    })
  })

  test('여행 수정: 종료일이 시작일보다 빠르면 오류, 저장 안 됨', async ({ page }) => {
    await openRoute(page, '/trips')
    await summary(page).getByRole('button', { name: '여행 정보 수정' }).click()
    const dlg = page.getByRole('dialog', { name: '여행 정보 수정' })
    await dlg.getByLabel('종료일').fill('2027-01-05')
    await dlg.getByRole('button', { name: '저장', exact: true }).click()
    await expect(dlg).toBeVisible()
    await expect(dlg.getByLabel('종료일')).toHaveAccessibleDescription('종료일은 시작일과 같거나 그 뒤여야 해요.')
    await dlg.getByRole('button', { name: '취소' }).click()
    await expect(dlg).toBeHidden()
    expect((await readStored(page)).trips[0].endDate).toBe('2027-01-13')
  })

  test('장소 직접 추가 → ▲/▼ 순서 변경 → 삭제, 새로고침 후 유지', async ({ page }) => {
    await openRoute(page, '/trips')
    const D1 = '2027. 1. 9.'
    const day1 = dayCard(page, D1)
    await expect(day1).toContainText('아직 일정이 없어요')

    await addPlace(page, D1, 'E2E 장소 A 아키하바라', { address: '도쿄도 지요다구 소토칸다', time: '10:00', memo: '굿즈숍 거리' })
    await expect(toast(page, '1/9 (토) 일정에 추가했어요.')).toBeVisible()
    await addPlace(page, D1, 'E2E 장소 B 이케부쿠로')
    await addPlace(page, D1, 'E2E 장소 C 나카노')

    const itemA = day1.locator('ol.tp-items > li').filter({ hasText: 'E2E 장소 A 아키하바라' })
    await expect(itemA.getByText('직접 추가')).toBeVisible()
    await expect(itemA.locator('.tp-time')).toHaveText('10:00')
    await expect(itemA).toContainText('도쿄도 지요다구 소토칸다')
    await expect(itemA).toContainText('굿즈숍 거리')
    await expect(day1.locator('ol.tp-items > li').filter({ hasText: 'E2E 장소 B 이케부쿠로' }).locator('.tp-time')).toHaveText(
      '시간 미정',
    )
    await expect(day1).toContainText('일정 3개')
    expect(await dayItemTitles(day1)).toEqual(['E2E 장소 A 아키하바라', 'E2E 장소 B 이케부쿠로', 'E2E 장소 C 나카노'])

    // 첫 항목은 위로, 마지막 항목은 아래로 이동할 수 없다
    await expect(day1.getByRole('button', { name: 'E2E 장소 A 아키하바라 위로 이동' })).toBeDisabled()
    await expect(day1.getByRole('button', { name: 'E2E 장소 C 나카노 아래로 이동' })).toBeDisabled()

    // ▼: A 를 아래로 → B, A, C
    await day1.getByRole('button', { name: 'E2E 장소 A 아키하바라 아래로 이동' }).click()
    expect(await dayItemTitles(day1)).toEqual(['E2E 장소 B 이케부쿠로', 'E2E 장소 A 아키하바라', 'E2E 장소 C 나카노'])
    // ▲: C 를 위로 → B, C, A
    await day1.getByRole('button', { name: 'E2E 장소 C 나카노 위로 이동' }).click()
    await expect.poll(() => dayItemTitles(day1)).toEqual(['E2E 장소 B 이케부쿠로', 'E2E 장소 C 나카노', 'E2E 장소 A 아키하바라'])

    // 다른 날짜의 일정은 순서 변경에 끼어들지 않는다
    await addPlace(page, '2027. 1. 10.', 'E2E 다른 날 장소')
    await expect(day1.getByRole('button', { name: 'E2E 장소 A 아키하바라 아래로 이동' })).toBeDisabled()

    await page.reload()
    await expect.poll(() => dayItemTitles(day1)).toEqual(['E2E 장소 B 이케부쿠로', 'E2E 장소 C 나카노', 'E2E 장소 A 아키하바라'])

    // 삭제 (확인 대화상자) — 취소하면 남아 있다
    await day1.getByRole('button', { name: 'E2E 장소 C 나카노 삭제' }).click()
    await answerConfirm(page, '일정을 삭제할까요?', '취소')
    await expect(day1.getByText('E2E 장소 C 나카노')).toBeVisible()

    await day1.getByRole('button', { name: 'E2E 장소 C 나카노 삭제' }).click()
    const confirmDlg = page.getByRole('dialog', { name: '일정을 삭제할까요?' })
    await expect(confirmDlg).toContainText('‘E2E 장소 C 나카노’을(를) 1/9 (토) 일정에서 삭제합니다.')
    await answerConfirm(page, '일정을 삭제할까요?', '삭제')
    await expect(toast(page, '일정을 삭제했어요.')).toBeVisible()
    await expect.poll(() => dayItemTitles(day1)).toEqual(['E2E 장소 B 이케부쿠로', 'E2E 장소 A 아키하바라'])

    await page.reload()
    await expect.poll(() => dayItemTitles(day1)).toEqual(['E2E 장소 B 이케부쿠로', 'E2E 장소 A 아키하바라'])
    expect(await dayItemTitles(dayCard(page, '2027. 1. 10.'))).toEqual(['E2E 다른 날 장소'])
    const items = (await readStored(page)).trips[0].items
    expect(items.map((i) => i.placeName)).toEqual(['E2E 장소 B 이케부쿠로', 'E2E 장소 A 아키하바라', 'E2E 다른 날 장소'])
  })

  test('장소 직접 추가: 장소명이 없으면 오류', async ({ page }) => {
    await openRoute(page, '/trips')
    await dayCard(page, '2027. 1. 9.').getByRole('button', { name: '+ 장소 직접 추가' }).click()
    const dlg = page.getByRole('dialog', { name: '장소 직접 추가' })
    await dlg.getByRole('button', { name: '일정에 추가' }).click()
    await expect(dlg).toBeVisible()
    await expect(dlg.getByLabel('장소명')).toHaveAccessibleDescription('장소명을 입력해 주세요.')
    await expect(dlg.getByLabel('장소명')).toBeFocused()
    expect((await readStored(page)).trips[0].items).toHaveLength(0)
  })

  test('일정 수정: 방문 시각과 메모를 바꿀 수 있다', async ({ page }) => {
    await openRoute(page, '/trips')
    await addPlace(page, '2027. 1. 11.', 'E2E 수정할 장소', { time: '09:30' })
    const day = dayCard(page, '2027. 1. 11.')
    await day.getByRole('button', { name: 'E2E 수정할 장소 수정' }).click()
    const dlg = page.getByRole('dialog', { name: '일정 수정' })
    await expect(dlg.getByLabel('방문 시각')).toHaveValue('09:30')
    await dlg.getByLabel('방문 시각').fill('18:45')
    await dlg.getByLabel('메모').fill('저녁 방문으로 변경')
    await dlg.getByRole('button', { name: '저장', exact: true }).click()
    await expect(dlg).toBeHidden()
    const item = day.locator('ol.tp-items > li').filter({ hasText: 'E2E 수정할 장소' })
    await expect(item.locator('.tp-time')).toHaveText('18:45')
    await expect(item).toContainText('저녁 방문으로 변경')
  })
})

test.describe('일정 추가 안내 (기간 밖 / 중복)', () => {
  test("1/10 에 끝나는 sample_002 를 1/12 에 넣으면 '행사 기간 밖' 안내", async ({ page }) => {
    await openRoute(page, '/events/sample_002')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('[샘플] 가상 겨울 팝업스토어 B')

    const dlg = await openAddToTrip(page)
    // 기본 날짜는 행사 기간 안의 첫 날짜
    await expect(dlg.getByLabel('날짜')).toHaveValue('2027-01-09')
    await expect(dlg.getByRole('status')).toHaveCount(0)
    await expect(dlg.getByRole('option', { name: '1/12 (화) · 행사 기간 밖' })).toHaveCount(1)

    await dlg.getByLabel('날짜').selectOption('2027-01-12')
    const warn = dlg.getByRole('status')
    await expect(warn).toBeVisible()
    await expect(warn).toContainText('선택한 날짜는 행사 기간 밖입니다.')

    // 그래도 추가할 수 있고, 내 여행 일정에도 경고가 남는다
    await dlg.getByRole('button', { name: '일정에 추가' }).click()
    await expect(dlg).toBeHidden()
    await openRoute(page, '/trips')
    const item = dayCard(page, '2027. 1. 12.').locator('ol.tp-items > li').filter({ hasText: '가상 겨울 팝업스토어 B' })
    await expect(item).toContainText('행사 기간 밖입니다')
    await expect(item).toContainText('2027. 1. 10. (일)')
    await expect(summary(page)).toContainText('확인할 일정 1개')
  })

  test('같은 날짜에 같은 행사를 두 번 넣으면 중복 안내', async ({ page }) => {
    await openRoute(page, '/events/sample_002')
    await addCurrentEventToTrip(page, { date: '2027-01-09', time: '11:00' })

    const dlg = await openAddToTrip(page)
    await dlg.getByLabel('날짜').selectOption('2027-01-09')
    const warn = dlg.getByRole('status')
    await expect(warn).toContainText('이 날짜 일정에 같은 행사가 이미 있습니다.')
    await expect(dlg.getByRole('option', { name: /1\/9 \(토\).*이미 추가됨/ })).toHaveCount(1)
    // 버튼도 '그래도 추가'로 바뀐다
    await expect(dlg.getByRole('button', { name: '그래도 추가' })).toBeVisible()
    // 다른 날짜를 고르면 중복 안내가 사라진다
    await dlg.getByLabel('날짜').selectOption('2027-01-10')
    await expect(dlg.getByRole('status')).toHaveCount(0)
    await expect(dlg.getByRole('button', { name: '일정에 추가' })).toBeVisible()
    await dlg.getByLabel('날짜').selectOption('2027-01-09')
    await dlg.getByRole('button', { name: '그래도 추가' }).click()
    await expect(dlg).toBeHidden()

    await openRoute(page, '/trips')
    const items = dayCard(page, '2027. 1. 9.').locator('ol.tp-items > li')
    await expect(items).toHaveCount(2)
    await expect(items.nth(0)).toContainText('같은 날 중복')
    await expect(items.nth(1)).toContainText('같은 날 중복')
    const stored = (await readStored(page)).trips.find((t) => t.id === DEFAULT_TRIP_ID)!
    expect(stored.items.filter((i) => i.eventId === 'sample_002' && i.date === '2027-01-09')).toHaveLength(2)
  })

  test('내 여행 화면의 행사·매장 추가에서도 중복·기간 밖 안내', async ({ page }) => {
    // sample_002 를 관심 저장
    await openRoute(page, '/events/sample_002')
    await page.getByRole('button', { name: '관심 저장', exact: true }).click()

    await openRoute(page, '/trips')
    const day4 = dayCard(page, '2027. 1. 12.')
    await day4.getByRole('button', { name: '+ 행사·매장 추가' }).click()
    let dlg = page.getByRole('dialog', { name: '4일차 · 1/12 (화)에 행사 추가' })
    await expect(dlg).toBeVisible()
    const pick = dlg.getByRole('button', { name: /가상 겨울 팝업스토어 B/ })
    await expect(pick).toContainText('행사 기간 밖')
    await pick.click()
    await expect(dlg.getByRole('status')).toContainText('선택한 날짜는 행사 기간 밖입니다.')
    await dlg.getByRole('button', { name: '일정에 추가' }).click()
    await expect(dlg).toBeHidden()

    // 같은 날 한 번 더
    await day4.getByRole('button', { name: '+ 행사·매장 추가' }).click()
    dlg = page.getByRole('dialog', { name: '4일차 · 1/12 (화)에 행사 추가' })
    await expect(dlg.getByRole('button', { name: /가상 겨울 팝업스토어 B/ })).toContainText('이미 추가됨 · 중복')
    await dlg.getByRole('button', { name: /가상 겨울 팝업스토어 B/ }).click()
    await expect(dlg.getByRole('status')).toContainText('이 날짜 일정에 같은 행사가 이미 있습니다.')
    await expect(dlg.getByRole('status')).toContainText('이미 이 날짜에 있는 행사예요')
    await dlg.getByRole('button', { name: '그래도 추가' }).click()
    await expect(dlg).toBeHidden()
    await expect(day4.locator('ol.tp-items > li')).toHaveCount(2)
    await expect(day4.locator('ol.tp-items > li').first()).toContainText('같은 날 중복')
  })
})
