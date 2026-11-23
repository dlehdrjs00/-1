import type { Page } from '@playwright/test'
import { test, expect, openRoute, SAMPLE_COUNT } from './helpers'

const VISIBLE_BY_DEFAULT = SAMPLE_COUNT - 1 // 종료된 sample_004 는 기본 숨김

function cards(page: Page) {
  return page.locator('ul.ev-list > li')
}

function resultCount(page: Page) {
  return page.locator('.ev-resultbar').getByRole('status')
}

/** 모바일에서는 '필터' 버튼으로 패널을 펼친다 (데스크톱은 항상 펼침) */
async function openFilters(page: Page) {
  const panel = page.getByRole('region', { name: '행사 필터' })
  const toggle = page.getByRole('button', { name: /^필터(?! 초기화)/ })
  if (await toggle.isVisible()) {
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  }
  await expect(panel).toBeVisible()
  return panel
}

test.describe('행사 목록 필터', () => {
  test('작품 필터(프로젝트 세카이)는 해당 작품 행사만 보이고, 초기화하면 원래대로', async ({ page }) => {
    await openRoute(page, '/events')
    await expect(cards(page)).toHaveCount(VISIBLE_BY_DEFAULT)
    await expect(resultCount(page)).toHaveText(new RegExp(`^${VISIBLE_BY_DEFAULT}개 행사`))

    const panel = await openFilters(page)
    const chip = panel.getByRole('button', { name: '프로젝트 세카이', exact: true })
    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'true')

    await expect(cards(page)).toHaveCount(2)
    await expect(resultCount(page)).toContainText('2개 행사')
    await expect(resultCount(page)).toContainText(`전체 ${SAMPLE_COUNT}개`)
    for (const card of await cards(page).all()) {
      await expect(card.locator('.work-tags')).toContainText('프로젝트 세카이')
    }
    await expect(cards(page).filter({ hasText: '가상 라이브 공연 E' })).toHaveCount(1)
    await expect(cards(page).filter({ hasText: '가상 콜라보 카페 I' })).toHaveCount(1)

    // 모바일: 패널을 닫으면 적용 중 요약이 보인다
    const showResults = panel.getByRole('button', { name: '결과 2개 보기' })
    if (await showResults.isVisible()) {
      await showResults.click()
      await expect(panel).toBeHidden()
      await expect(page.locator('.ev-summary')).toContainText('프세카')
      await openFilters(page)
    }

    await panel.getByRole('button', { name: '필터 초기화' }).click()
    await expect(cards(page)).toHaveCount(VISIBLE_BY_DEFAULT)
    await expect(resultCount(page)).toHaveText(new RegExp(`^${VISIBLE_BY_DEFAULT}개 행사`))
    await expect(panel.getByRole('button', { name: '프로젝트 세카이', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await expect(panel.getByRole('button', { name: '필터 초기화' })).toBeDisabled()
  })

  test('작품 여러 개는 OR, 유형과는 AND', async ({ page }) => {
    await openRoute(page, '/events')
    const panel = await openFilters(page)
    await panel.getByRole('button', { name: '젠레스 존 제로', exact: true }).click()
    // sample_003, 011, 012, 013 (모두 진행 중/예정/기간 미정)
    await expect(cards(page)).toHaveCount(4)
    await panel.getByRole('button', { name: '프로젝트 세카이', exact: true }).click()
    await expect(cards(page)).toHaveCount(6)
    // 유형: 콜라보 카페 → 젠존제 카페 M(013) + 프세카 카페 I(009)
    await panel.getByRole('button', { name: '콜라보 카페', exact: true }).click()
    await expect(cards(page)).toHaveCount(2)
    for (const card of await cards(page).all()) await expect(card).toContainText('콜라보 카페')
  })

  test('지역·날짜 필터', async ({ page }) => {
    await openRoute(page, '/events')
    const panel = await openFilters(page)
    // 지역: 오사카 (sample_006, sample_009)
    const region = panel.getByLabel('지역')
    await region.selectOption({ label: '오사카 (2)' })
    await expect(cards(page)).toHaveCount(2)
    for (const card of await cards(page).all()) await expect(card).toContainText('오사카')
    await region.selectOption({ label: '전체 지역' })
    await expect(cards(page)).toHaveCount(VISIBLE_BY_DEFAULT)

    // 날짜: 내 여행 기간 (1/9~1/13) 과 겹치는 행사 + 기간 미정 행사
    await panel.getByRole('button', { name: /내 여행 기간/ }).click()
    // 겹침: 001,002,003,005,006,008,010 / 기간 미정: 011,012 → 9개
    await expect(cards(page)).toHaveCount(9)
    await expect(cards(page).filter({ hasText: '가상 기획 전시 G' })).toHaveCount(0) // 12/28 종료
    await expect(cards(page).filter({ hasText: '가상 스탬프 랠리 K' })).toHaveCount(1) // 기간 미정은 함께 표시
  })

  test('검색어와 일치하는 행사가 없으면 빈 상태와 초기화 버튼', async ({ page }) => {
    await openRoute(page, '/events')
    await page.getByRole('searchbox', { name: '행사명·장소 검색' }).fill('존재하지않는행사이름')
    await expect(cards(page)).toHaveCount(0)
    await expect(page.getByText('조건에 맞는 행사가 없어요')).toBeVisible()
    await page.locator('.empty').getByRole('button', { name: '필터 초기화' }).click()
    await expect(cards(page)).toHaveCount(VISIBLE_BY_DEFAULT)
    await expect(page.getByRole('searchbox', { name: '행사명·장소 검색' })).toHaveValue('')
  })
})
