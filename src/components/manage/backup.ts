import type { AppData } from '../../types'
import { todayLocal } from '../../lib/date'
import { toExportPayload, validateAppData } from '../../lib/validate'

/** 불러오기 파일 최대 크기 */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024

/** 'subcul-trip-planner-YYYYMMDD.json' */
export function backupFileName(now: Date = new Date()): string {
  return `subcul-trip-planner-${todayLocal(now).replace(/-/g, '')}.json`
}

/** 현재 데이터를 JSON 파일로 내려받는다. 반환: 파일 이름 */
export function downloadBackup(data: AppData): string {
  const name = backupFileName()
  const json = JSON.stringify(toExportPayload(data), null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 일부 브라우저는 click 직후 해제하면 다운로드가 취소되므로 잠시 뒤 해제
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  return name
}

export type ImportResult = { ok: true; data: AppData } | { ok: false; errors: string[] }

/** 텍스트 → 검증된 AppData. 실패해도 예외를 던지지 않는다. */
export function parseBackupText(text: string): ImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, errors: ['JSON 형식이 올바르지 않아 읽을 수 없어요. 이 앱에서 내보낸 파일인지 확인하세요.'] }
  }
  return validateAppData(parsed)
}

/** 파일 → 검증된 AppData. 크기 제한·읽기 오류·JSON 오류·형식 오류를 모두 결과로 돌려준다. */
export async function readBackupFile(file: Blob): Promise<ImportResult> {
  if (file.size > MAX_IMPORT_BYTES) {
    return { ok: false, errors: ['파일이 너무 커요. 5MB 이하의 JSON 파일만 불러올 수 있어요.'] }
  }
  if (file.size === 0) return { ok: false, errors: ['빈 파일이에요.'] }
  let text: string
  try {
    text = await file.text()
  } catch {
    return { ok: false, errors: ['파일을 읽지 못했어요. 다시 시도해 주세요.'] }
  }
  return parseBackupText(text)
}

export function dataCounts(d: AppData) {
  return {
    events: d.events.length,
    samples: d.events.filter((e) => e.isSample).length,
    favorites: d.favorites.length,
    trips: d.trips.length,
  }
}
