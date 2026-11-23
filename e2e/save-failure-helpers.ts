import type { Page } from '@playwright/test'

/**
 * 저장 실패 재현 도우미.
 *
 * 앱 본문 저장 키(MAIN_KEY)에 대한 localStorage.setItem 만 QuotaExceededError 로 실패시킨다.
 * 초안 키('subcul-trip-planner:v1:draft:…') 등 다른 키는 그대로 저장된다.
 * 페이지 안에서 Storage.prototype.setItem 을 바꾸므로 새로고침하면 풀린다 (새로고침 뒤 다시 부르면 된다).
 */

export const MAIN_KEY = 'subcul-trip-planner:v1'

/** 앱 본문 저장만 실패하게 만든다 (여러 번 불러도 한 번만 설치) */
export async function failMainSave(page: Page): Promise<void> {
  await page.evaluate((key) => {
    const w = window as unknown as { __failMainSave?: boolean; __failMainSavePatched?: boolean }
    if (!w.__failMainSavePatched) {
      const orig = Storage.prototype.setItem
      Storage.prototype.setItem = function (k: string, v: string) {
        if (w.__failMainSave && k === key) throw new DOMException('quota', 'QuotaExceededError')
        return orig.call(this, k, v)
      }
      w.__failMainSavePatched = true
    }
    w.__failMainSave = true
  }, MAIN_KEY)
}

/** 앱 본문 저장을 다시 정상으로 */
export async function recoverMainSave(page: Page): Promise<void> {
  await page.evaluate(() => {
    ;(window as unknown as { __failMainSave?: boolean }).__failMainSave = false
  })
}
