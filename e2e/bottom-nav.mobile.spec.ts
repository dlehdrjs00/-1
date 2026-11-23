/**
 * 모바일 전용 (mobile · mobile-small): 하단 메뉴가 내용을 가리지 않는지.
 * - 각 화면을 맨 아래까지 내렸을 때, main 안의 마지막 내용(고정·sticky 요소 제외)이 하단 메뉴 위에서 끝난다.
 * - 행사 폼의 '저장·취소' 바(sticky)는 맨 위·맨 아래 어디서든 하단 메뉴 위에 있다.
 * - 아래쪽 안전 영역(홈 인디케이터, 34px)이 있는 짧은 화면(320×568)에서도 저장 바가 가려지지 않는다
 *   (이전에 깨졌던 경우). 안전 영역은 CDP Emulation.setSafeAreaInsetsOverride 로 흉내 낸다.
 */
import type { Page } from '@playwright/test'
import { test, expect, openRoute, addCurrentEventToTrip, eventFormActions } from './helpers'
import { saveBarBottom, scrollAndMeasure } from './round2-helpers'

const ROUTES: { path: string; heading: string | RegExp }[] = [
  { path: '/events', heading: '행사 목록' },
  { path: '/events/sample_001', heading: /가상 콜라보 카페 A/ },
  { path: '/favorites', heading: '관심 행사' },
  { path: '/trips', heading: '내 여행' },
  { path: '/manage', heading: '정보 관리' },
  { path: '/manage/new', heading: '행사 등록' },
  { path: '/manage/edit/sample_001', heading: '행사 수정' },
]
const FORM_ROUTES = ['/manage/new', '/manage/edit/sample_001']

/** 관심 2개 + 여행 마지막 날(1/13)에 일정 → 목록 화면이 비어 있지 않게 */
async function seed(page: Page) {
  for (const id of ['sample_001', 'sample_005']) {
    await openRoute(page, `/events/${id}`)
    await page.getByRole('button', { name: '관심 저장', exact: true }).click()
    await addCurrentEventToTrip(page, { date: '2027-01-13', time: id === 'sample_001' ? '11:00' : '18:00', memo: '마지막 날 일정 '.repeat(6) })
  }
}

async function open(page: Page, r: (typeof ROUTES)[number]) {
  await openRoute(page, r.path)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(r.heading)
}

async function expectLastContentAboveNav(page: Page, label: string) {
  const m = await scrollAndMeasure(page, 'bottom')
  expect(m.scrollY, `${label}: 맨 아래까지 스크롤`).toBeGreaterThanOrEqual(m.maxScrollY - 1)
  expect(
    m.lastBottom,
    `${label}: 마지막 내용 ${m.lastDesc} 의 아래 끝(${m.lastBottom.toFixed(1)}) <= 하단 메뉴 위 끝(${m.navTop.toFixed(1)})`,
  ).toBeLessThanOrEqual(m.navTop + 0.5)
}

async function expectSaveBarAboveNav(page: Page, label: string) {
  await expect(eventFormActions(page)).toBeVisible()
  for (const where of ['top', 'bottom'] as const) {
    const m = await scrollAndMeasure(page, where)
    const bottom = await saveBarBottom(page)
    expect(bottom, `${label} (${where}): 저장·취소 바 아래 끝(${bottom.toFixed(1)}) <= 하단 메뉴 위 끝(${m.navTop.toFixed(1)})`).toBeLessThanOrEqual(
      m.navTop + 0.5,
    )
    await expect(eventFormActions(page).getByRole('button', { name: /^(저장|변경 내용 저장)$/ })).toBeInViewport({ ratio: 1 })
    await expect(eventFormActions(page).getByRole('button', { name: '취소' })).toBeInViewport({ ratio: 1 })
  }
}

test.describe('하단 메뉴가 내용을 가리지 않는다', () => {
  test('주요 화면 맨 아래 내용과 저장·취소 바가 하단 메뉴 위에 있다', async ({ page }) => {
    await seed(page)
    for (const r of ROUTES) {
      await open(page, r)
      if (r.path === '/favorites') await expect(page.locator('.favs-card')).toHaveCount(2)
      if (r.path === '/trips') {
        await expect(page.getByRole('region', { name: /2027\. 1\. 13\./ }).locator('ol.tp-items > li')).toHaveCount(2)
      }
      await expectLastContentAboveNav(page, r.path)
      if (FORM_ROUTES.includes(r.path)) await expectSaveBarAboveNav(page, r.path)
    }
  })

  test('행사 폼 오류 안내가 펼쳐진 상태에서도 저장·취소 바가 하단 메뉴 위에 있다', async ({ page }) => {
    await openRoute(page, '/manage/new')
    await eventFormActions(page).getByRole('button', { name: '저장', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: '입력 내용을 확인해 주세요' })).toBeVisible()
    await expectSaveBarAboveNav(page, '/manage/new (오류)')
    await expectLastContentAboveNav(page, '/manage/new (오류)')
  })

  test.describe('짧은 화면 320×568 + 아래쪽 안전 영역 34px', () => {
    test.use({ viewport: { width: 320, height: 568 } })

    test('수정 화면 저장·취소 바가 하단 메뉴에 가리지 않는다', async ({ page }) => {
      const cdp = await page.context().newCDPSession(page)
      let emulated = true
      try {
        await cdp.send('Emulation.setSafeAreaInsetsOverride' as never, { insets: { top: 0, left: 0, right: 0, bottom: 34 } } as never)
      } catch (e) {
        emulated = false
        test.info().annotations.push({ type: 'unverified', description: `Emulation.setSafeAreaInsetsOverride 사용 불가: ${String(e)}` })
      }

      // 초안 안내가 위에 있으면(내용이 길어져) 이전에 저장 바가 가려졌다 → 그 상태도 확인
      await openRoute(page, '/manage/edit/sample_001')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('행사 수정')
      const insetBottom = await page.evaluate(() => {
        const el = document.createElement('div')
        el.style.cssText = 'position:fixed;bottom:0;height:env(safe-area-inset-bottom);'
        document.body.appendChild(el)
        const h = el.getBoundingClientRect().height
        el.remove()
        return h
      })
      if (emulated) expect(insetBottom, 'env(safe-area-inset-bottom) 가 34px 로 적용되어야 함').toBe(34)
      const navBox = (await page.getByRole('navigation', { name: '하단 메뉴' }).boundingBox())!
      expect(navBox.y + navBox.height).toBeLessThanOrEqual(568 + 0.5)

      await expectSaveBarAboveNav(page, '/manage/edit/sample_001 @320x568 inset34')
      await expectLastContentAboveNav(page, '/manage/edit/sample_001 @320x568 inset34')

      // 초안 안내가 있는 상태 (내용이 위에 더 붙음)
      await page.getByRole('textbox', { name: '행사명' }).fill('E2E 안전 영역 초안')
      await page.waitForTimeout(600)
      await page.reload()
      await expect(page.getByRole('status').filter({ hasText: '저장하지 않은 초안이 있어요' })).toBeVisible()
      await expectSaveBarAboveNav(page, '/manage/edit/sample_001 @320x568 inset34 (초안 안내)')

      // 새 행사 폼도 같은 조건으로
      await openRoute(page, '/manage/new')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('행사 등록')
      await expectSaveBarAboveNav(page, '/manage/new @320x568 inset34')
    })
  })
})
