import type { Page } from '@playwright/test'
import { test, expect, openRoute, horizontalOverflow, addCurrentEventToTrip } from './helpers'

/**
 * 모바일 화면: 가로 넘침이 없고 하단 메뉴가 보이는지.
 * (기획서 [검증] '모바일 화면', [디자인] '작은 화면에서 버튼과 글자가 겹치지 않도록')
 */

const MAIN_ROUTES = [
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

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const m = await horizontalOverflow(page)
  expect(m.scrollWidth, `${label}: documentElement.scrollWidth(${m.scrollWidth}) <= innerWidth(${m.innerWidth})`).toBeLessThanOrEqual(
    m.innerWidth,
  )
  expect(m.bodyScrollWidth, `${label}: body.scrollWidth`).toBeLessThanOrEqual(m.innerWidth)
}

async function expectBottomNav(page: Page) {
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
async function seedContent(page: Page) {
  await openRoute(page, '/events/sample_001')
  await page.getByRole('button', { name: '관심 저장', exact: true }).click()
  await addCurrentEventToTrip(page, { date: '2027-01-10', time: '14:00', memo: '아주 긴 메모 '.repeat(12) })
  await openRoute(page, '/events/sample_002')
  await page.getByRole('button', { name: '관심 저장', exact: true }).click()
  await addCurrentEventToTrip(page, { date: '2027-01-12' }) // 기간 밖 경고 표시
}

test.describe('모바일 레이아웃', () => {
  test.skip(({ isMobile }) => !isMobile, '모바일 프로젝트(Pixel 7) 전용')

  test('주요 화면에 가로 넘침이 없고 하단 메뉴가 보인다 (Pixel 7)', async ({ page }) => {
    await seedContent(page)
    for (const route of MAIN_ROUTES) {
      await openRoute(page, route)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expectNoHorizontalOverflow(page, route)
      await expectBottomNav(page)
      // 상단 메뉴는 모바일에서 숨김
      await expect(page.getByRole('navigation', { name: '주 메뉴' })).toBeHidden()
    }
  })

  test('하단 메뉴로 모든 탭을 이동할 수 있다', async ({ page }) => {
    await openRoute(page, '/events')
    const nav = page.getByRole('navigation', { name: '하단 메뉴' })
    const tabs: [RegExp, RegExp, string][] = [
      [/^관심/, /#\/favorites$/, '관심 행사'],
      [/^내 여행/, /#\/trips$/, '내 여행'],
      [/^정보 관리/, /#\/manage$/, '정보 관리'],
      [/^행사/, /#\/events$/, '행사 목록'],
    ]
    for (const [name, url, heading] of tabs) {
      const link = nav.getByRole('link', { name })
      await link.click()
      await expect(page).toHaveURL(url)
      await expect(link).toHaveAttribute('aria-current', 'page')
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    }
  })

  test.describe('360px 폭', () => {
    test.use({ viewport: { width: 360, height: 740 } })

    for (const route of ['/events', '/events/sample_001', '/trips', '/manage/new']) {
      test(`${route} 가로 넘침 없음 + 하단 메뉴`, async ({ page }) => {
        await seedContent(page)
        await openRoute(page, route)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        expect(page.viewportSize()!.width).toBe(360)
        await expectNoHorizontalOverflow(page, `${route} @360`)
        await expectBottomNav(page)
      })
    }

    test('필터 패널을 펼쳐도 가로 넘침 없음', async ({ page }) => {
      await openRoute(page, '/events')
      await page.getByRole('button', { name: /^필터(?! 초기화)/ }).click()
      await expect(page.getByRole('region', { name: '행사 필터' })).toBeVisible()
      await page.getByRole('region', { name: '행사 필터' }).getByRole('button', { name: /내 여행 기간/ }).click()
      await expectNoHorizontalOverflow(page, '/events (필터 펼침) @360')
    })

    test('대화상자(여행에 추가, 여행 정보 수정)가 화면 폭 안에 들어간다', async ({ page }) => {
      await openRoute(page, '/events/sample_001')
      await page.getByRole('button', { name: '여행에 추가' }).click()
      let dlg = page.getByRole('dialog', { name: '여행에 추가' })
      await expect(dlg).toBeVisible()
      let box = (await dlg.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(360)
      await expect(dlg.getByRole('button', { name: '일정에 추가' })).toBeInViewport()
      await expectNoHorizontalOverflow(page, 'AddToTripDialog @360')
      await dlg.getByRole('button', { name: '취소' }).click()

      await openRoute(page, '/trips')
      await page.getByRole('button', { name: '여행 정보 수정' }).click()
      dlg = page.getByRole('dialog', { name: '여행 정보 수정' })
      await expect(dlg).toBeVisible()
      box = (await dlg.boundingBox())!
      expect(box.x + box.width).toBeLessThanOrEqual(360)
      await expect(dlg.getByRole('button', { name: '저장', exact: true })).toBeInViewport()
      await expectNoHorizontalOverflow(page, 'TripFormModal @360')
    })

    test('행사 등록 폼 오류 상태에서도 가로 넘침 없음', async ({ page }) => {
      await openRoute(page, '/manage/new')
      await page.getByRole('form', { name: '행사 등록' }).getByRole('button', { name: '저장', exact: true }).click()
      await expect(page.getByRole('alert').filter({ hasText: '입력 내용을 확인해 주세요' })).toBeVisible()
      await expectNoHorizontalOverflow(page, '/manage/new (오류) @360')
    })
  })
})

test.describe('데스크톱 레이아웃', () => {
  test.skip(({ isMobile }) => isMobile, '데스크톱 프로젝트 전용')

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
