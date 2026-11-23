import type { Locator, Page } from '@playwright/test'
import { expect, STORAGE_KEY } from './helpers'

/**
 * 2차 기능(날짜만 있는 예약, 초안, 알림 자리, 여행 요약 접기, 하단 메뉴 가림) E2E 공용 도우미.
 * 기존 helpers.ts 는 건드리지 않고 여기에만 추가한다.
 */

/* ---------------- 시계 ---------------- */

/** 행사 현지(일본) 시각으로 브라우저 시계를 바꾸고 다시 그린다. 'YYYY-MM-DDTHH:mm' (일본·한국 모두 UTC+9) */
export async function setTokyoNow(page: Page, local: string) {
  await page.clock.setFixedTime(new Date(`${local}:00+09:00`))
  await page.reload()
  await expect(page.locator('main.main')).toBeVisible()
}

/** 상세 화면 머리 카드의 예약 상태 배지 */
export function heroReservationBadge(page: Page): Locator {
  return page.locator('.ev-hero').getByTitle('예약 상태')
}

/* ---------------- 초안 ---------------- */

export const DRAFT_NEW_KEY = `${STORAGE_KEY}:draft:new`
export const draftEditKey = (eventId: string) => `${STORAGE_KEY}:draft:edit:${encodeURIComponent(eventId)}`

export interface StoredDraft {
  v: number
  kind: 'new' | 'edit'
  eventId: string | null
  baseUpdatedAt: string | null
  savedAt: string
  values: Record<string, unknown>
}

/** localStorage 의 초안 (없으면 null) */
export async function readDraft(page: Page, key: string): Promise<StoredDraft | null> {
  const raw = await page.evaluate((k) => localStorage.getItem(k), key)
  return raw === null ? null : (JSON.parse(raw) as StoredDraft)
}

/** 초안 키가 생길 때까지 (자동 저장은 입력 후 약 0.4초 뒤) */
export async function waitForDraft(page: Page, key: string, title?: string) {
  await expect
    .poll(async () => {
      const d = await readDraft(page, key)
      return d === null ? null : title === undefined ? true : d.values.title
    }, { message: `초안 ${key} 저장` })
    .toEqual(title === undefined ? true : title)
}

/** '저장하지 않은 초안이 있어요' 안내 */
export function draftBanner(page: Page): Locator {
  return page.getByRole('status').filter({ hasText: '저장하지 않은 초안이 있어요' })
}

/**
 * 행사 등록/수정 화면을 열고 그 화면이 실제로 그려질 때까지 기다린다.
 * (해시만 바뀌는 이동을 연달아 하면 React 가 중간 화면을 그리기 전에 두 변경을 한 번에 처리해
 *  이전 폼이 그대로 남을 수 있다 — 사람은 낼 수 없는 속도라 앱 문제는 아니고, 테스트에서 기다린다.)
 * subtitle: 수정 화면이면 저장된 행사명, 새 행사면 생략
 */
export async function openEventFormRoute(page: Page, path: string, subtitle?: string) {
  await page.goto(`/#${path}`)
  const header = page.locator('main .page-header')
  await expect(header.getByRole('heading', { level: 1 })).toHaveText(subtitle === undefined ? '행사 등록' : '행사 수정')
  await expect(header.locator('p')).toHaveText(subtitle ?? '가고 싶은 행사 정보를 직접 등록해요.')
}

/** 행사 폼 (inert 일 때도 찾을 수 있도록 CSS 로) */
export function rawEventForm(page: Page): Locator {
  return page.locator('form.ef-form')
}

/** 요소에 포커스를 줄 수 있는지 (inert 면 false) */
export async function canFocus(loc: Locator): Promise<boolean> {
  return loc.evaluate((el) => {
    ;(el as HTMLElement).focus()
    return document.activeElement === el
  })
}

/* ---------------- 하단 메뉴 가림 검사 ---------------- */

export interface BottomMetrics {
  navTop: number
  navHeight: number
  viewportHeight: number
  scrollY: number
  maxScrollY: number
  /** main 안에서 화면에 그려진(고정·sticky 제외) 요소 중 가장 아래 끝 */
  lastBottom: number
  lastDesc: string
}

/** 문서 맨 아래(또는 맨 위)로 스크롤한 뒤 위치를 잰다 */
export async function scrollAndMeasure(page: Page, where: 'top' | 'bottom'): Promise<BottomMetrics> {
  await page.evaluate((w) => {
    const se = document.scrollingElement ?? document.documentElement
    window.scrollTo(0, w === 'top' ? 0 : se.scrollHeight)
  }, where)
  // 스크롤이 끝날 때까지 (smooth 스크롤 대비) 위치가 멈추길 기다린다
  let prev = -1
  await expect
    .poll(async () => {
      const y = await page.evaluate(() => window.scrollY)
      const stable = y === prev
      prev = y
      return stable
    })
    .toBe(true)
  return page.evaluate(() => {
    const nav = document.querySelector<HTMLElement>('nav[aria-label="하단 메뉴"]')!
    const main = document.querySelector<HTMLElement>('main.main')!
    const nr = nav.getBoundingClientRect()
    const se = document.scrollingElement ?? document.documentElement
    const pinned = (el: Element) => {
      for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) {
        const p = getComputedStyle(e).position
        if (p === 'fixed' || p === 'sticky') return true
      }
      return false
    }
    let lastBottom = -Infinity
    let lastDesc = '(없음)'
    for (const el of Array.from(main.querySelectorAll('*'))) {
      if (el.closest('[hidden], [aria-hidden="true"]')) continue
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue
      // 화면 읽기 전용(sr-only: 1px + clip) 요소 제외
      if ((cs.clip && cs.clip !== 'auto') || (cs.clipPath && cs.clipPath !== 'none')) continue
      const r = el.getBoundingClientRect()
      if (r.width < 2 || r.height < 2) continue
      if (pinned(el)) continue
      // 같은 아래 끝이면 문서 순서상 뒤(더 안쪽) 요소를 골라 실패 메시지가 구체적이도록
      if (r.bottom >= lastBottom - 0.5) {
        lastBottom = Math.max(lastBottom, r.bottom)
        const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).join('.')}` : ''
        lastDesc = `${el.tagName.toLowerCase()}${cls} "${(el.textContent ?? '').trim().slice(0, 40)}"`
      }
    }
    return {
      navTop: nr.top,
      navHeight: nr.height,
      viewportHeight: window.innerHeight,
      scrollY: window.scrollY,
      maxScrollY: se.scrollHeight - window.innerHeight,
      lastBottom,
      lastDesc,
    }
  })
}

/** 저장·취소 바의 아래 끝 (화면 좌표) */
export async function saveBarBottom(page: Page): Promise<number> {
  const box = await page.locator('.ef-actions').boundingBox()
  expect(box, '저장·취소 바').not.toBeNull()
  return box!.y + box!.height
}
