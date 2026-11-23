import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import {
  test,
  expect,
  openRoute,
  toast,
  answerConfirm,
  readStored,
  addCurrentEventToTrip,
  dayCard,
  SAMPLE_COUNT,
} from './helpers'

function fileInput(page: Page) {
  return page.getByLabel('불러올 JSON 백업 파일 선택')
}

function exportBox(page: Page) {
  return page.locator('.manage-backup__box').filter({ has: page.getByRole('heading', { name: 'JSON 내보내기' }) })
}

function importError(page: Page) {
  return page.getByRole('alert').filter({ hasText: '불러오지 못했어요' })
}

/** 관심 1개(sample_001) + 일정 1개(sample_001, 1/9) 가 있는 상태 만들기 */
async function makeSomeState(page: Page) {
  await openRoute(page, '/events/sample_001')
  await page.getByRole('button', { name: '관심 저장', exact: true }).click()
  await addCurrentEventToTrip(page, { date: '2027-01-09', time: '15:00', memo: '백업 확인용' })
}

async function upload(page: Page, name: string, content: string, mimeType = 'application/json') {
  await fileInput(page).setInputFiles({ name, mimeType, buffer: Buffer.from(content, 'utf8') })
}

const validShape = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({ schemaVersion: 1, events: [], favorites: [], trips: [], activeTripId: null, ...overrides })

test.describe('JSON 불러오기 오류', () => {
  const cases: { name: string; file: string; content: string; mime?: string; message: RegExp }[] = [
    {
      name: 'JSON 이 아닌 텍스트',
      file: 'not-json.txt',
      content: '이건 JSON 이 아닙니다 { broken',
      mime: 'text/plain',
      message: /JSON 형식이 올바르지 않아 읽을 수 없어요/,
    },
    {
      name: '형식이 다른 JSON (배열)',
      file: 'array.json',
      content: '[1, 2, 3]',
      message: /데이터 형식\(JSON 객체\)이 아닙니다/,
    },
    {
      name: '형식이 다른 JSON (events 가 배열이 아님)',
      file: 'wrong-shape.json',
      content: validShape({ events: 'nope', favorites: {}, trips: 3 }),
      message: /행사 목록\(events\)이 배열이 아닙니다/,
    },
    {
      name: '행사 항목 값이 잘못된 JSON',
      file: 'bad-event.json',
      content: validShape({
        events: [{ id: 'x1', title: '', works: ['없는작품'], type: 'party', timezone: 'Mars/Base', startDate: '2027-13-40' }],
      }),
      message: /행사 1번째/,
    },
    {
      name: 'schemaVersion 2',
      file: 'v2.json',
      content: validShape({ schemaVersion: 2 }),
      message: /지원하지 않는 데이터 버전입니다\. \(schemaVersion: 2\)/,
    },
    {
      name: '빈 파일',
      file: 'empty.json',
      content: '',
      message: /빈 파일이에요/,
    },
  ]

  for (const c of cases) {
    test(`${c.name} → 오류 안내, 기존 데이터 유지`, async ({ page }) => {
      await makeSomeState(page)
      await openRoute(page, '/manage')
      await expect(exportBox(page)).toContainText(`행사 ${SAMPLE_COUNT}개 · 관심 1개 · 여행 1개`)
      const before = await readStored(page)

      await upload(page, c.file, c.content, c.mime)
      const err = importError(page)
      await expect(err).toBeVisible()
      await expect(err).toContainText('기존 데이터는 그대로 유지')
      await expect(err).toContainText(c.file)
      await expect(err).toContainText(c.message)
      // 바꾸기 확인 대화상자는 뜨지 않는다
      await expect(page.getByRole('dialog')).toHaveCount(0)

      // 데이터 그대로
      expect(await readStored(page)).toEqual(before)
      await page.reload()
      await expect(exportBox(page)).toContainText(`행사 ${SAMPLE_COUNT}개 · 관심 1개 · 여행 1개`)
      expect(await readStored(page)).toEqual(before)
      await openRoute(page, '/favorites')
      await expect(page.locator('.favs-card')).toHaveCount(1)
      await openRoute(page, '/trips')
      await expect(dayCard(page, '2027. 1. 9.')).toContainText('가상 콜라보 카페 A')
    })
  }

  test('오류 뒤에 다른 잘못된 파일을 연달아 올려도 안내가 갱신되고 닫을 수 있다', async ({ page }) => {
    await openRoute(page, '/manage')
    await upload(page, 'first.txt', 'nope', 'text/plain')
    await expect(importError(page)).toContainText('first.txt')
    await upload(page, 'second.json', validShape({ schemaVersion: 2 }))
    await expect(importError(page)).toContainText('second.json')
    await expect(importError(page)).toContainText('schemaVersion: 2')
    await importError(page).getByRole('button', { name: '닫기' }).click()
    await expect(importError(page)).toHaveCount(0)
    expect((await readStored(page)).events).toHaveLength(SAMPLE_COUNT)
  })
})

test.describe('JSON 내보내기 → 불러오기', () => {
  test('내보낸 파일을 불러오면 상태가 복원된다', async ({ page }) => {
    await makeSomeState(page)
    await openRoute(page, '/manage')
    const before = await readStored(page)

    // ---------- 내보내기 ----------
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'JSON 내보내기' }).click(),
    ])
    expect(download.suggestedFilename()).toBe('subcul-trip-planner-20261123.json')
    await expect(toast(page, 'subcul-trip-planner-20261123.json 파일로 내보냈어요.')).toBeVisible()
    const path = await download.path()
    const exported = JSON.parse(readFileSync(path, 'utf8'))
    expect(exported).toMatchObject({ app: 'subcul-trip-planner', schemaVersion: 1, activeTripId: 'trip_tokyo_2027' })
    expect(exported.events).toHaveLength(SAMPLE_COUNT)
    expect(exported.favorites).toEqual(['sample_001'])
    expect(exported.trips[0].items).toEqual([
      expect.objectContaining({ date: '2027-01-09', eventId: 'sample_001', time: '15:00', memo: '백업 확인용' }),
    ])

    // ---------- 상태 바꾸기: 샘플 모두 삭제 (관심·일정도 함께 빠짐) ----------
    await page.getByRole('button', { name: '샘플 모두 삭제' }).click()
    await answerConfirm(page, '샘플 행사를 모두 삭제할까요?', '샘플 모두 삭제')
    await expect(exportBox(page)).toContainText('행사 0개 · 관심 0개 · 여행 1개')

    // ---------- 불러오기 취소 → 그대로 ----------
    await fileInput(page).setInputFiles(path)
    let dlg = page.getByRole('dialog', { name: '이 파일로 데이터를 바꿀까요?' })
    await expect(dlg).toBeVisible()
    await expect(dlg).toContainText(`행사 ${SAMPLE_COUNT}개 (샘플 ${SAMPLE_COUNT}개 포함)`)
    await expect(dlg).toContainText('관심 1개')
    await expect(dlg).toContainText('여행 1개')
    await dlg.getByRole('button', { name: '취소' }).click()
    await expect(toast(page, '불러오기를 취소했어요. 기존 데이터는 그대로예요.')).toBeVisible()
    await expect(exportBox(page)).toContainText('행사 0개 · 관심 0개 · 여행 1개')

    // ---------- 불러오기 확인 → 복원 ----------
    await fileInput(page).setInputFiles(path)
    dlg = page.getByRole('dialog', { name: '이 파일로 데이터를 바꿀까요?' })
    await dlg.getByRole('button', { name: '불러와서 바꾸기' }).click()
    await expect(dlg).toBeHidden()
    await expect(toast(page, `불러오기 완료: 행사 ${SAMPLE_COUNT}개, 관심 1개, 여행 1개`)).toBeVisible()
    await expect(exportBox(page)).toContainText(`행사 ${SAMPLE_COUNT}개 · 관심 1개 · 여행 1개`)

    await page.reload()
    const after = await readStored(page)
    expect(after.events).toEqual(before.events)
    expect(after.favorites).toEqual(before.favorites)
    expect(after.trips).toEqual(before.trips)
    expect(after.activeTripId).toBe(before.activeTripId)

    await openRoute(page, '/favorites')
    await expect(page.locator('.favs-card').filter({ hasText: '가상 콜라보 카페 A' })).toHaveCount(1)
    await openRoute(page, '/trips')
    const item = dayCard(page, '2027. 1. 9.').locator('ol.tp-items > li').filter({ hasText: '가상 콜라보 카페 A' })
    await expect(item.locator('.tp-time')).toHaveText('15:00')
    await expect(item).toContainText('백업 확인용')
  })
})
