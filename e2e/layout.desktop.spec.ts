/**
 * 데스크톱 전용 레이아웃 검사. playwright.config.ts 에서 데스크톱 프로젝트에만 배정된다 (*.desktop.spec.ts).
 */
import { test, expect, openRoute } from './helpers'
import { MAIN_ROUTES, expectNoHorizontalOverflow, seedContent } from './layout-helpers'

test.describe('데스크톱 레이아웃', () => {
  test('주요 화면에 가로 넘침이 없고 상단 메뉴가 보인다', async ({ page }) => {
    await seedContent(page)
    for (const route of MAIN_ROUTES) {
      await openRoute(page, route)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expectNoHorizontalOverflow(page, route)
      await expect(page.getByRole('navigation', { name: '주 메뉴' })).toBeVisible()
      await expect(page.getByRole('navigation', { name: '하단 메뉴' })).toBeHidden()
    }
  })
})
