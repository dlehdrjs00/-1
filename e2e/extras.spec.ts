import {
  test,
  expect,
  openRoute,
  navTo,
  mainNav,
  toast,
  answerConfirm,
  readStored,
  registerEvent,
  eventForm,
  infoValue,
  dayCard,
  dayItemTitles,
  addCurrentEventToTrip,
  STORAGE_KEY,
  SAMPLE_COUNT,
} from './helpers'

test.describe('행사 수정', () => {
  test('상세 → 수정 → 저장하면 상세·일정·관심에 반영되고 새로고침 후 유지', async ({ page }) => {
    const id = await registerEvent(page, {
      title: 'E2E 수정 전 제목',
      works: ['명조'],
      type: '전시',
      startDate: '2027-01-09',
      endDate: '2027-01-11',
    })
    await page.getByRole('button', { name: '관심 저장', exact: true }).click()
    await addCurrentEventToTrip(page, { date: '2027-01-11', time: '13:00' })

    await page.getByRole('button', { name: '수정' }).click()
    await expect(page).toHaveURL(new RegExp(`#/manage/edit/${id}$`))
    const form = eventForm(page)
    await expect(form.getByRole('textbox', { name: '행사명' })).toHaveValue('E2E 수정 전 제목')
    await expect(form.getByRole('radio', { name: '전시', exact: true })).toBeChecked()
    await expect(form.getByRole('group', { name: '관련 작품' }).getByRole('button', { name: '명조' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(form.getByLabel('시작일', { exact: true })).toHaveValue('2027-01-09')

    await form.getByRole('textbox', { name: '행사명' }).fill('E2E 수정 후 제목')
    // 기간을 줄여 기존 일정(1/11)이 행사 기간 밖이 되게 한다
    await form.getByLabel('종료일', { exact: true }).fill('2027-01-10')
    await form.getByRole('button', { name: '변경 내용 저장' }).click()
    await expect(toast(page, '저장했어요')).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`#/events/${id}$`))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('E2E 수정 후 제목')
    await expect(infoValue(page, '종료일')).toHaveText('2027. 1. 10. (일)')

    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('E2E 수정 후 제목')
    await openRoute(page, '/trips')
    const item = dayCard(page, '2027. 1. 11.').locator('ol.tp-items > li')
    await expect(item).toContainText('E2E 수정 후 제목')
    await expect(item).toContainText('행사 기간 밖입니다')
    await openRoute(page, '/favorites')
    await expect(page.locator('.favs-card')).toContainText('E2E 수정 후 제목')
    expect((await readStored(page)).events).toHaveLength(SAMPLE_COUNT + 1)
  })

  test('수정 중 취소하면 확인 후 나가고 변경은 저장되지 않는다', async ({ page }) => {
    await openRoute(page, '/manage/edit/sample_001')
    await expect(page.getByText('샘플 행사를 수정하고 있어요')).toBeVisible()
    const form = eventForm(page)
    await form.getByRole('textbox', { name: '행사명' }).fill('바꾸다 만 제목')
    await form.getByRole('button', { name: '취소' }).click()
    await answerConfirm(page, '저장하지 않고 나갈까요?', '나가기')
    const ev = (await readStored(page)).events.find((e) => e.id === 'sample_001')!
    expect(ev.title).toBe('[샘플] 가상 콜라보 카페 A')
  })

  test('샘플 행사를 수정해도 샘플 표시는 유지된다', async ({ page }) => {
    await openRoute(page, '/manage/edit/sample_002')
    await eventForm(page).getByLabel('메모', { exact: true }).fill('E2E 메모 수정')
    await eventForm(page).getByRole('button', { name: '변경 내용 저장' }).click()
    await expect(page).toHaveURL(/#\/events\/sample_002$/)
    await expect(page.locator('h1 .badge--sample')).toHaveText('샘플')
    await expect(infoValue(page, '메모')).toHaveText('E2E 메모 수정')
    expect((await readStored(page)).events.find((e) => e.id === 'sample_002')!.isSample).toBe(true)
  })

  test('수정 화면에서 행사 삭제', async ({ page }) => {
    const id = await registerEvent(page, { title: 'E2E 삭제할 행사', works: ['기타'] })
    await openRoute(page, `/manage/edit/${id}`)
    await page.getByRole('button', { name: '이 행사 삭제' }).click()
    await answerConfirm(page, '이 행사를 삭제할까요?', '삭제')
    await expect(page).toHaveURL(/#\/manage$/)
    await expect(page.getByText('E2E 삭제할 행사')).toHaveCount(0)
    expect((await readStored(page)).events.some((e) => e.id === id)).toBe(false)
  })
})

test.describe('상태·시간대 표시 (샘플 기준, 2026-11-23)', () => {
  test('sample_001: 예약 오픈 전 + 오픈 시각을 일본 시간으로 표시', async ({ page }) => {
    await openRoute(page, '/events/sample_001')
    const hero = page.locator('.ev-hero')
    await expect(hero.getByTitle('행사 진행 상태')).toHaveText(/진행 예정/)
    await expect(hero.getByTitle('예약 상태')).toHaveText(/예약 오픈 전/)
    await expect(infoValue(page, '예약 시작')).toHaveText('2026. 12. 1. (화) 18:00 (일본 시간)')
    await expect(page.getByText('시각은 모두 일본 시간(Asia/Tokyo) 기준이에요.')).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: '시연용 가상 데이터' })).toContainText('실제 행사가 아니며')
  })

  test('sample_007(서울): 한국 시간 기준, 예약 불필요', async ({ page }) => {
    await openRoute(page, '/events/sample_007')
    await expect(page.getByText('시각은 모두 한국 시간(Asia/Seoul) 기준이에요.')).toBeVisible()
    await expect(infoValue(page, '예약 필요 여부')).toHaveText('예약 불필요')
    await expect(page.locator('.ev-hero').getByTitle('예약 상태')).toHaveText(/예약 불필요/)
    await expect(page.locator('.ev-hero').getByTitle('행사 진행 상태')).toHaveText(/진행 중/)
  })

  test('sample_008/009: 정보가 부족하면 예약 접수 중으로 표시하지 않는다', async ({ page }) => {
    for (const id of ['sample_008', 'sample_009', 'sample_011']) {
      await openRoute(page, `/events/${id}`)
      await expect(page.locator('.ev-hero').getByTitle('예약 상태')).toHaveText(/예약 확인 필요/)
      await expect(page.locator('.ev-hero')).not.toContainText('예약 접수 중')
    }
  })

  test('sample_004: 종료된 행사는 종료·예약 마감', async ({ page }) => {
    await openRoute(page, '/events/sample_004')
    await expect(page.locator('.ev-hero').getByTitle('행사 진행 상태')).toHaveText(/종료/)
    await expect(page.locator('.ev-hero').getByTitle('예약 상태')).toHaveText(/예약 마감/)
    await expect(page.getByText('이미 종료된 행사예요.')).toBeVisible()
  })
})

test.describe('관심 행사', () => {
  test('목록 카드의 ☆ 로 저장하면 하단/상단 메뉴 관심 개수, 저장 취소와 되돌리기', async ({ page }) => {
    await openRoute(page, '/events')
    const card = page.locator('ul.ev-list > li').filter({ hasText: '가상 콜라보 카페 A' })
    await card.getByRole('button', { name: '관심 저장', exact: true }).click()
    await expect(toast(page, '관심 행사에 저장했어요.')).toBeVisible()
    await expect(card.getByRole('button', { name: '관심 저장 취소' })).toHaveAttribute('aria-pressed', 'true')
    // 카드를 눌러도 상세로 이동하지 않는다 (버튼만 동작)
    await expect(page).toHaveURL(/#\/events$/)

    const second = page.locator('ul.ev-list > li').filter({ hasText: '가상 팝업스토어 C' })
    await second.getByRole('button', { name: '관심 저장', exact: true }).click()

    await navTo(page, '관심')
    await expect(page.locator('.favs-card')).toHaveCount(2)
    await expect(page.getByText('저장한 행사 2개')).toBeVisible()
    // 최근 저장한 것이 위
    await expect(page.locator('.favs-card').first()).toContainText('가상 팝업스토어 C')

    await page.getByRole('button', { name: '[샘플] 가상 팝업스토어 C 저장 취소' }).click()
    await expect(page.locator('.favs-card')).toHaveCount(1)
    await expect(page.getByText('‘[샘플] 가상 팝업스토어 C’ 저장을 취소했어요.')).toBeVisible()
    await page.getByRole('button', { name: '되돌리기' }).click()
    await expect(page.locator('.favs-card')).toHaveCount(2)
    await expect(page.locator('.favs-card').first()).toContainText('가상 팝업스토어 C')

    await page.reload()
    await expect(page.locator('.favs-card')).toHaveCount(2)
    expect((await readStored(page)).favorites).toEqual(['sample_003', 'sample_001'])
  })

  test('관심 행사가 없으면 빈 상태 안내', async ({ page }) => {
    await openRoute(page, '/favorites')
    await expect(page.getByText('아직 저장한 관심 행사가 없어요')).toBeVisible()
    await page.getByRole('link', { name: '행사 둘러보기' }).click()
    await expect(page).toHaveURL(/#\/events$/)
  })
})

test.describe('여행 관리', () => {
  test('여행 기간을 줄이면 밖으로 밀려난 일정이 안내되고 날짜 변경으로 옮길 수 있다', async ({ page }) => {
    await openRoute(page, '/trips')
    await dayCard(page, '2027. 1. 9.').getByRole('button', { name: '+ 장소 직접 추가' }).click()
    let dlg = page.getByRole('dialog', { name: '장소 직접 추가' })
    await dlg.getByLabel('장소명').fill('E2E 첫날 장소')
    await dlg.getByRole('button', { name: '일정에 추가' }).click()

    await page.getByRole('button', { name: '여행 정보 수정' }).click()
    dlg = page.getByRole('dialog', { name: '여행 정보 수정' })
    await dlg.getByLabel('시작일').fill('2027-01-10')
    await expect(dlg.getByRole('status').filter({ hasText: '일정 1개가 새 여행 기간 밖이 돼요.' })).toBeVisible()
    await dlg.getByRole('button', { name: '저장', exact: true }).click()
    await expect(dlg).toBeHidden()

    const outside = page.getByRole('region', { name: /여행 기간 밖 일정/ })
    await expect(outside).toBeVisible()
    await expect(outside).toContainText('E2E 첫날 장소')
    await outside.getByRole('button', { name: 'E2E 첫날 장소 날짜 변경·수정' }).click()
    dlg = page.getByRole('dialog', { name: '일정 수정' })
    await dlg.getByLabel('날짜').selectOption('2027-01-12')
    await dlg.getByRole('button', { name: '저장', exact: true }).click()
    await expect(dlg).toBeHidden()
    await expect(outside).toHaveCount(0)
    expect(await dayItemTitles(dayCard(page, '2027. 1. 12.'))).toEqual(['E2E 첫날 장소'])
  })

  test('새 여행 만들기 → 여행 전환 → 여행에 추가에서 여행 선택 → 여행 삭제', async ({ page }) => {
    await openRoute(page, '/trips')
    await page.getByRole('button', { name: '+ 새 여행' }).click()
    let dlg = page.getByRole('dialog', { name: '새 여행 만들기' })
    // 빈 값 저장 → 오류
    await dlg.getByRole('button', { name: '저장', exact: true }).click()
    await expect(dlg.getByLabel('여행 이름')).toHaveAccessibleDescription('여행 이름을 입력해 주세요.')
    await expect(dlg.getByLabel('시작일')).toHaveAccessibleDescription('시작일을 선택해 주세요.')

    await dlg.getByLabel('여행 이름').fill('E2E 오사카 여행')
    await dlg.getByLabel('도시').fill('오사카')
    await dlg.getByLabel('시작일').fill('2027-02-01')
    await dlg.getByLabel('종료일').fill('2027-02-03')
    await expect(dlg.getByLabel('시간대')).toHaveValue('Asia/Tokyo')
    await dlg.getByLabel('숙소 이름').fill('난바 E2E 숙소')
    await dlg.getByRole('button', { name: '저장', exact: true }).click()
    await expect(dlg).toBeHidden()
    await expect(page).toHaveURL(/#\/trips\/trip/)
    const osakaId = decodeURIComponent(new URL(page.url()).hash.replace(/^#\/trips\//, ''))
    await expect(page.getByRole('heading', { level: 2, name: 'E2E 오사카 여행' })).toBeVisible()
    await expect(page.getByRole('region', { name: /일차/ })).toHaveCount(3)

    const switcher = page.getByRole('navigation', { name: '여행 선택' })
    await expect(switcher.getByRole('button')).toHaveCount(2)
    await switcher.getByRole('button', { name: /도쿄 여행/ }).click()
    await expect(page.getByRole('heading', { level: 2, name: '도쿄 여행' })).toBeVisible()

    // 여행에 추가: 여행을 고를 수 있다 (기본값은 활성 여행)
    await openRoute(page, '/events/sample_006')
    await page.getByRole('button', { name: '여행에 추가' }).click()
    dlg = page.getByRole('dialog', { name: '여행에 추가' })
    await expect(dlg.getByLabel('여행', { exact: true })).toHaveValue('trip_tokyo_2027')
    await expect(dlg.getByRole('option', { name: 'E2E 오사카 여행 (2/1 (월)~2/3 (수))' })).toHaveCount(1)
    await dlg.getByLabel('여행', { exact: true }).selectOption(osakaId)
    await expect(dlg.getByLabel('날짜')).toHaveValue('2027-02-01')
    await dlg.getByRole('button', { name: '일정에 추가' }).click()
    await expect(toast(page, "'E2E 오사카 여행' 2/1 (월) 일정에 추가했어요.")).toBeVisible()

    await page.reload()
    const stored = await readStored(page)
    expect(stored.trips).toHaveLength(2)
    const osaka = stored.trips.find((t) => t.id === osakaId)!
    expect(osaka).toMatchObject({ name: 'E2E 오사카 여행', city: '오사카', startDate: '2027-02-01', endDate: '2027-02-03' })
    expect(osaka.accommodation.name).toBe('난바 E2E 숙소')
    expect(osaka.items).toEqual([expect.objectContaining({ eventId: 'sample_006', date: '2027-02-01' })])

    // 여행 삭제
    await openRoute(page, `/trips/${osaka.id}`)
    await page.getByRole('button', { name: '여행 삭제' }).click()
    await answerConfirm(page, '여행을 삭제할까요?', '여행 삭제')
    await expect(toast(page, '여행을 삭제했어요.')).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: '도쿄 여행' })).toBeVisible()
    expect((await readStored(page)).trips.map((t) => t.name)).toEqual(['도쿄 여행'])
  })

  test('여행을 모두 삭제하면 빈 상태, 여행에 추가는 여행 만들기 안내', async ({ page }) => {
    await openRoute(page, '/trips')
    await page.getByRole('button', { name: '여행 삭제' }).click()
    await answerConfirm(page, '여행을 삭제할까요?', '여행 삭제')
    await expect(page.getByText('아직 만든 여행이 없어요')).toBeVisible()

    await openRoute(page, '/events/sample_001')
    await page.getByRole('button', { name: '여행에 추가' }).click()
    const dlg = page.getByRole('dialog', { name: '여행에 추가' })
    await expect(dlg).toContainText('아직 만든 여행이 없습니다.')
    await dlg.getByRole('button', { name: '여행 만들러 가기' }).click()
    await expect(page).toHaveURL(/#\/trips$/)
    await page.getByRole('button', { name: '여행 만들기' }).click()
    await expect(page.getByRole('dialog', { name: '새 여행 만들기' })).toBeVisible()
  })
})

test.describe('저장소 · 기타', () => {
  test('손상된 저장 데이터는 초기 상태로 시작하고 안내하며, 원본은 백업 키에 남긴다', async ({ page }) => {
    await openRoute(page, '/events')
    await page.evaluate((key) => localStorage.setItem(key, '{ this is broken'), STORAGE_KEY)
    await page.reload()
    await expect(page.getByRole('status').filter({ hasText: '저장된 데이터를 읽지 못했어요' })).toBeVisible()
    const backup = await page.evaluate((key) => localStorage.getItem(`${key}:corrupt-backup`), STORAGE_KEY)
    expect(backup).toBe('{ this is broken')
    expect((await readStored(page)).events).toHaveLength(SAMPLE_COUNT)
    await page.getByRole('button', { name: '닫기' }).click()
    await expect(page.getByText('저장된 데이터를 읽지 못했어요')).toHaveCount(0)
  })

  test('정보 관리에 다른 기기와 동기화되지 않는다는 안내', async ({ page }) => {
    await openRoute(page, '/manage')
    await expect(page.getByText('다른 기기와 자동 동기화되지 않습니다')).toBeVisible()
  })

  test('없는 행사·없는 주소는 찾을 수 없음 안내', async ({ page }) => {
    await openRoute(page, '/events/does_not_exist')
    await expect(page.getByText('행사를 찾을 수 없어요')).toBeVisible()
    await openRoute(page, '/nowhere')
    await expect(page.getByText('페이지를 찾을 수 없어요')).toBeVisible()
    await openRoute(page, '/manage/edit/does_not_exist')
    await expect(page.getByText('행사를 찾을 수 없어요')).toBeVisible()
    await openRoute(page, '/trips/does_not_exist')
    await expect(page.getByText('여행을 찾을 수 없어요')).toBeVisible()
  })

  test('주 메뉴에 현재 화면이 표시된다', async ({ page }) => {
    await openRoute(page, '/events/sample_001')
    await expect(mainNav(page).getByRole('link', { name: /^행사/ })).toHaveAttribute('aria-current', 'page')
    await openRoute(page, '/manage/new')
    await expect(mainNav(page).getByRole('link', { name: /^정보 관리/ })).toHaveAttribute('aria-current', 'page')
  })

  test('모든 데이터 초기화는 확인 단어를 입력해야 실행된다', async ({ page }) => {
    await registerEvent(page, { title: 'E2E 초기화될 행사', works: ['원신'] })
    await openRoute(page, '/manage')
    await page.getByRole('button', { name: '모든 데이터 초기화' }).click()
    const dlg = page.getByRole('dialog', { name: '모든 데이터를 초기화할까요?' })
    const go = dlg.getByRole('button', { name: '초기화', exact: true })
    await expect(go).toBeDisabled()
    await dlg.getByLabel(/초기화’를 입력하세요/).fill('초기화')
    await expect(go).toBeEnabled()
    await go.click()
    await expect(dlg).toBeHidden()
    await expect(toast(page, '모든 데이터를 초기화했어요.')).toBeVisible()
    const stored = await readStored(page)
    expect(stored.events).toHaveLength(SAMPLE_COUNT)
    expect(stored.events.some((e) => e.title === 'E2E 초기화될 행사')).toBe(false)
  })
})

/*
 * 이전에 알려진 문제였던 항목 (수정됨)
 */
test.describe('뒤로 가기 · 이동 확인', () => {
  // 상세의 버튼은 '← 뒤로' — 들어온 화면으로 돌아간다. 새 행사를 저장한 직후라면 등록을 시작한 정보 관리로.
  test('새 행사 저장 직후 상세의 ‘← 뒤로’는 등록을 시작한 화면으로 돌아간다', async ({ page }) => {
    await openRoute(page, '/manage')
    await page.getByRole('link', { name: '+ 행사 등록' }).first().click()
    const form = eventForm(page)
    await form.getByRole('textbox', { name: '행사명' }).fill('E2E 뒤로 가기 확인')
    await form.getByRole('group', { name: '관련 작품' }).getByRole('button', { name: '원신' }).click()
    await form.getByRole('button', { name: '저장', exact: true }).click()
    await expect(page).toHaveURL(/#\/events\/evt/)
    await page.getByRole('button', { name: '뒤로' }).click()
    await expect(page).toHaveURL(/#\/manage$/, { timeout: 2000 })
  })

  test('상세 주소를 바로 연 경우 ‘← 뒤로’는 앱 밖이 아니라 행사 목록으로 간다', async ({ page }) => {
    await openRoute(page, '/events/sample_001')
    await page.getByRole('button', { name: '뒤로' }).click()
    await expect(page).toHaveURL(/#\/events$/)
  })

  test('행사 수정 저장 후 상세로 돌아오고, 뒤로는 목록으로 간다 (중복 기록 없음)', async ({ page }) => {
    await openRoute(page, '/events')
    await page.getByRole('link', { name: /가상 콜라보 카페 A/ }).first().click()
    await expect(page).toHaveURL(/#\/events\/sample_001$/)
    await page.getByRole('button', { name: '수정' }).click()
    await expect(page).toHaveURL(/#\/manage\/edit\/sample_001$/)
    await eventForm(page).getByRole('button', { name: '변경 내용 저장' }).click()
    await expect(page).toHaveURL(/#\/events\/sample_001$/)
    await page.getByRole('button', { name: '뒤로' }).click()
    await expect(page).toHaveURL(/#\/events$/)
  })

  // APP BUG(낮음): 행사 등록/수정 폼은 '취소'와 새로고침(beforeunload)에는 저장 안 한 변경을 경고하지만,
  // 하단/상단 메뉴로 다른 탭에 가면 경고 없이 입력 내용이 사라진다.
  test('작성 중인 행사 폼에서 메뉴로 이동하면 저장하지 않고 나갈지 묻는다', async ({ page }) => {
    await openRoute(page, '/manage/new')
    await eventForm(page).getByRole('textbox', { name: '행사명' }).fill('작성 중인 제목')
    await navTo(page, '행사')
    const dlg = page.getByRole('dialog', { name: '저장하지 않고 나갈까요?' })
    await expect(dlg).toBeVisible({ timeout: 2000 })
    await dlg.getByRole('button', { name: '취소' }).click()
    await expect(page).toHaveURL(/#\/manage\/new$/)
    await expect(eventForm(page).getByRole('textbox', { name: '행사명' })).toHaveValue('작성 중인 제목')
    await navTo(page, '행사')
    await page.getByRole('dialog', { name: '저장하지 않고 나갈까요?' }).getByRole('button', { name: '나가기' }).click()
    await expect(page).toHaveURL(/#\/events$/)
  })

  test('잘못된 % 인코딩 주소는 빈 화면 대신 찾을 수 없음 안내', async ({ page }) => {
    await openRoute(page, '/events/%E0%A4%A')
    await expect(page.getByText('페이지를 찾을 수 없어요')).toBeVisible()
  })
})
