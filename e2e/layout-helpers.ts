import type { Page } from '@playwright/test'
import { expect, openRoute, horizontalOverflow, addCurrentEventToTrip } from './helpers'

/**
 * 모바일 화면: 가로 넘침이 없고 하단 메뉴가 보이는지.
 * (기획서 [검증] '모바일 화면', [디자인] '작은 화면에서 버튼과 글자가 겹치지 않도록')
 */

export const MAIN_ROUTES = [
  '/events',
  '/events/sample_001',
  '/events/sample_011',
  '/favorites',
  '/trips',
  '/trips/trip_tokyo_2027',
  '/manage',
  '/manage/new',
  '/manage/edit/sample_001',
]

export async function expectNoHorizontalOverflow(page: Page, label: string) {
  const m = await horizontalOverflow(page)
  expect(m.scrollWidth, `${label}: documentElement.scrollWidth(${m.scrollWidth}) <= innerWidth(${m.innerWidth})`).toBeLessThanOrEqual(
    m.innerWidth,
  )
  expect(m.bodyScrollWidth, `${label}: body.scrollWidth`).toBeLessThanOrEqual(m.innerWidth)
}

export async function expectBottomNav(page: Page) {
  const nav = page.getByRole('navigation', { name: '하단 메뉴' })
  await expect(nav).toBeVisible()
  await expect(nav.getByRole('link')).toHaveCount(4)
  const box = await nav.boundingBox()
  const vp = page.viewportSize()!
  expect(box, 'bottom nav box').not.toBeNull()
  // 화면 아래에 붙어 있고 화면 폭 안에 들어간다
  expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height + 1)
  expect(box!.y + box!.height).toBeGreaterThanOrEqual(vp.height - 1)
  expect(box!.width).toBeLessThanOrEqual(vp.width + 0.5)
  for (const link of await nav.getByRole('link').all()) await expect(link).toBeInViewport()
}

/** 관심·일정이 들어 있는 상태로 만들어 빈 화면이 아닌 실제 목록 화면을 검사한다 */
export async function seedContent(page: Page) {
  await openRoute(page, '/events/sample_001')
  await page.getByRole('button', { name: '관심 저장', exact: true }).click()
  await addCurrentEventToTrip(page, { date: '2027-01-10', time: '14:00', memo: '아주 긴 메모 '.repeat(12) })
  await openRoute(page, '/events/sample_002')
  await page.getByRole('button', { name: '관심 저장', exact: true }).click()
  await addCurrentEventToTrip(page, { date: '2027-01-12' }) // 기간 밖 경고 표시
}

