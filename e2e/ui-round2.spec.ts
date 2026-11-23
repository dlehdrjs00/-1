/**
 * 2차 변경 3·4: 알림(토스트) 자리 · 여행 기본 정보 접기.
 * - 알림은 성공·안내 한 자리 + 오류 한 자리. 같은 자리에 새 알림이 오면 바로 바뀐다 (쌓이지 않음).
 * - 여행 머리 카드 '기본 정보 접기/펼치기' (aria-expanded), 여행별로 localStorage 에 기억.
 */
import type { Page } from '@playwright/test'
import { test, expect, openRoute, readStored, toast, DEFAULT_TRIP_ID } from './helpers'

const COLLAPSED_KEY = 'subcul-trip-planner:ui:trip-summary-collapsed'

async function readCollapsed(page: Page): Promise<Record<string, boolean> | null> {
  const raw = await page.evaluate((k) => localStorage.getItem(k), COLLAPSED_KEY)
  return raw === null ? null : (JSON.parse(raw) as Record<string, boolean>)
}

/** 내보내기를 실패하게 만든다 (Blob URL 생성 실패) — 오류 알림을 띄우는 유일한 동작 */
async function breakExport(page: Page, broken: boolean) {
  await page.evaluate((b) => {
    const w = window as unknown as { __origCreateObjectURL?: typeof URL.createObjectURL }
    if (!w.__origCreateObjectURL) w.__origCreateObjectURL = URL.createObjectURL.bind(URL)
    URL.createObjectURL = b
      ? () => {
          throw new Error('E2E: 내보내기 실패 흉내')
        }
      : w.__origCreateObjectURL
  }, broken)
}

test.describe('알림(토스트) 자리', () => {
  test('성공·안내 알림은 한 자리: 빠르게 3번 바꾸면 가장 최근 알림 하나만 보인다', async ({ page }) => {
    await openRoute(page, '/events/sample_001')
    const fav = page.locator('.ev-hero .fav-btn')
    const toasts = page.locator('.toasts .toast')

    await fav.click() // 저장 (success)
    await fav.click() // 취소 (info)
    await expect(toasts).toHaveCount(1)
    await expect(toast(page, '관심 저장을 취소했어요.')).toBeVisible()
    await fav.click() // 다시 저장 (success)

    await expect(toasts).toHaveCount(1)
    await expect(toasts).toHaveText(/관심 행사에 저장했어요\./)
    await expect(toasts.first()).toHaveAttribute('role', 'status')
    // 잠시 지켜봐도 쌓이지 않는다
    for (let i = 0; i < 5; i++) {
      expect(await toasts.count()).toBeLessThanOrEqual(1)
      await page.waitForTimeout(100)
    }
    // 최종 상태도 저장됨
    await expect(fav).toHaveAttribute('aria-pressed', 'true')
    expect((await readStored(page)).favorites).toEqual(['sample_001'])
    // 3초 뒤 사라진다 (마지막 알림 기준)
    await expect(toasts).toHaveCount(0, { timeout: 6_000 })
  })

  test('오류 알림은 따로: 성공 알림이 떠도 오류 알림이 남아 있고, 새 오류는 이전 오류를 바꾼다', async ({ page }) => {
    await openRoute(page, '/manage')
    const exportBtn = page.getByRole('button', { name: 'JSON 내보내기' })
    const errors = page.locator('.toasts .toast--error')
    const notes = page.locator('.toasts .toast:not(.toast--error)')

    await breakExport(page, true)
    await exportBtn.click()
    const err = toast(page, '내보내기에 실패했어요. 다시 시도해 주세요.')
    await expect(err).toBeVisible()
    await expect(err).toHaveAttribute('role', 'alert')

    // 성공 알림 → 오류 알림은 그대로, 두 자리 모두 보임
    await breakExport(page, false)
    const download = page.waitForEvent('download')
    await exportBtn.click()
    await download
    await expect(notes).toHaveCount(1)
    await expect(notes).toHaveText(/파일로 내보냈어요\.$/)
    await expect(errors).toHaveCount(1)
    await expect(err).toBeVisible()
    await expect(page.locator('.toasts .toast')).toHaveCount(2)

    // 다른 성공 알림이 와도 성공 자리만 바뀐다
    const download2 = page.waitForEvent('download')
    await exportBtn.click()
    await download2
    await expect(notes).toHaveCount(1)
    await expect(errors).toHaveCount(1)

    // 새 오류 → 오류 자리 하나만 (이전 오류를 바꿈)
    await breakExport(page, true)
    await exportBtn.click()
    await expect(errors).toHaveCount(1)
    await expect(page.locator('.toasts .toast')).toHaveCount(2)

    // 성공 알림(3초)이 먼저 사라지고 오류 알림(6초)은 남아 있다
    await expect(notes).toHaveCount(0, { timeout: 5_000 })
    await expect(errors).toHaveCount(1)
    await expect(errors).toHaveCount(0, { timeout: 7_000 })
  })
})

test.describe('여행 기본 정보 접기', () => {
  test('접으면 이름·기간·숙소만 남고, 새로고침 후에도 기억하며, 여행마다 따로 기억한다', async ({ page }) => {
    await openRoute(page, '/trips')
    const summary = page.getByRole('region', { name: '도쿄 여행' })
    const collapse = summary.getByRole('button', { name: '기본 정보 접기' })
    await expect(collapse).toHaveAttribute('aria-expanded', 'true')
    await expect(summary.getByRole('button', { name: '여행 정보 수정' })).toBeVisible()
    await expect(summary.getByText('숙소 주소')).toBeVisible()
    expect(await readCollapsed(page)).toBeNull()

    // ---------- 접기 ----------
    await collapse.click()
    const expand = summary.getByRole('button', { name: '기본 정보 펼치기' })
    await expect(expand).toHaveAttribute('aria-expanded', 'false')
    // 접어도 보이는 것: 이름, 기간(N박 M일), 숙소 이름
    await expect(summary.getByRole('heading', { level: 2, name: '도쿄 여행' })).toBeVisible()
    await expect(summary).toContainText('2027. 1. 9. (토) ~ 2027. 1. 13. (수)')
    await expect(summary.getByText('4박 5일')).toBeVisible()
    await expect(summary.getByText('아사쿠사바시 근처 숙소')).toBeVisible()
    // 숨김: 상세 정보와 수정·삭제 버튼
    await expect(summary.getByRole('button', { name: '여행 정보 수정' })).toBeHidden()
    await expect(summary.getByRole('button', { name: '여행 삭제' })).toBeHidden()
    await expect(summary.getByText('숙소 주소')).toBeHidden()
    const controls = await expand.getAttribute('aria-controls')
    expect(controls).toBeTruthy()
    await expect(page.locator(`[id="${controls}"]`)).toBeHidden()
    // 날짜별 일정은 그대로
    await expect(page.getByRole('region', { name: /일차/ })).toHaveCount(5)
    expect(await readCollapsed(page)).toEqual({ [DEFAULT_TRIP_ID]: true })

    // ---------- 새로고침 후에도 접힘 ----------
    await page.reload()
    await expect(summary.getByRole('button', { name: '기본 정보 펼치기' })).toHaveAttribute('aria-expanded', 'false')
    await expect(summary.getByRole('button', { name: '여행 정보 수정' })).toBeHidden()

    // ---------- 두 번째 여행: 따로 (기본은 펼침) ----------
    await page.getByRole('button', { name: '+ 새 여행' }).click()
    const dlg = page.getByRole('dialog', { name: '새 여행 만들기' })
    await dlg.getByLabel('여행 이름').fill('E2E 접기 오사카')
    await dlg.getByLabel('도시').fill('오사카')
    await dlg.getByLabel('시작일').fill('2027-02-01')
    await dlg.getByLabel('종료일').fill('2027-02-03')
    await dlg.getByLabel('숙소 이름').fill('난바 E2E 숙소')
    await dlg.getByRole('button', { name: '저장', exact: true }).click()
    await expect(dlg).toBeHidden()
    await expect(page).toHaveURL(/#\/trips\/trip/)
    const osakaId = decodeURIComponent(new URL(page.url()).hash.replace(/^#\/trips\//, ''))
    const osaka = page.getByRole('region', { name: 'E2E 접기 오사카' })
    await expect(osaka.getByRole('button', { name: '기본 정보 접기' })).toHaveAttribute('aria-expanded', 'true')
    await expect(osaka.getByRole('button', { name: '여행 정보 수정' })).toBeVisible()

    // 오사카를 접고 도쿄를 펼친다 → 각각 기억
    await osaka.getByRole('button', { name: '기본 정보 접기' }).click()
    await expect(osaka.getByRole('button', { name: '기본 정보 펼치기' })).toHaveAttribute('aria-expanded', 'false')
    await expect(osaka.getByText('난바 E2E 숙소')).toBeVisible()
    expect(await readCollapsed(page)).toEqual({ [DEFAULT_TRIP_ID]: true, [osakaId]: true })

    const switcher = page.getByRole('navigation', { name: '여행 선택' })
    await switcher.getByRole('button', { name: /도쿄 여행/ }).click()
    await expect(summary.getByRole('button', { name: '기본 정보 펼치기' })).toHaveAttribute('aria-expanded', 'false')

    // ---------- 펼치기 ----------
    await summary.getByRole('button', { name: '기본 정보 펼치기' }).click()
    await expect(summary.getByRole('button', { name: '기본 정보 접기' })).toHaveAttribute('aria-expanded', 'true')
    await expect(summary.getByRole('button', { name: '여행 정보 수정' })).toBeVisible()
    await expect(summary.getByText('숙소 주소')).toBeVisible()
    expect(await readCollapsed(page)).toEqual({ [osakaId]: true })

    await page.reload()
    await expect(summary.getByRole('button', { name: '기본 정보 접기' })).toHaveAttribute('aria-expanded', 'true')
    await switcher.getByRole('button', { name: /E2E 접기 오사카/ }).click()
    await expect(osaka.getByRole('button', { name: '기본 정보 펼치기' })).toHaveAttribute('aria-expanded', 'false')
    await expect(osaka.getByRole('button', { name: '여행 정보 수정' })).toBeHidden()

    // 접기 상태는 앱 데이터(내보내기 대상)에 섞이지 않는다
    const stored = await readStored(page)
    expect(JSON.stringify(stored)).not.toContain('collapsed')
  })

  test('접힌 상태에서도 펼쳐서 여행 정보를 수정할 수 있다', async ({ page }) => {
    await openRoute(page, '/trips')
    const summary = page.getByRole('region', { name: '도쿄 여행' })
    await summary.getByRole('button', { name: '기본 정보 접기' }).click()
    await summary.getByRole('button', { name: '기본 정보 펼치기' }).click()
    await summary.getByRole('button', { name: '여행 정보 수정' }).click()
    const dlg = page.getByRole('dialog', { name: '여행 정보 수정' })
    await expect(dlg).toBeVisible()
    await dlg.getByLabel('숙소 이름').fill('E2E 접기 후 숙소')
    await dlg.getByRole('button', { name: '저장', exact: true }).click()
    await expect(toast(page, '저장했어요')).toBeVisible()
    await summary.getByRole('button', { name: '기본 정보 접기' }).click()
    await expect(summary.getByText('E2E 접기 후 숙소')).toBeVisible()
  })
})

test.describe('저장소 회귀 (2차 검증에서 발견해 수정)', () => {
  test('여행 주소로 앱을 처음 열 때 바뀐 활성 여행이 첫 저장에 덮어써지지 않는다', async ({ page }) => {
    await openRoute(page, '/trips')
    // 두 번째 여행을 넣고 그 여행을 활성 여행으로 저장해 둔다
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
    // 기본 여행 주소로 앱을 새로 연다 → 그 여행이 활성 여행이 되어 저장되어야 한다
    await page.goto(`/#/trips/${DEFAULT_TRIP_ID}`)
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: '내 여행' })).toBeVisible()
    await expect.poll(async () => (await readStored(page)).activeTripId).toBe(DEFAULT_TRIP_ID)
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: '내 여행' })).toBeVisible()
    expect((await readStored(page)).activeTripId).toBe(DEFAULT_TRIP_ID)
  })
})
