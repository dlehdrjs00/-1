import { useId, useState, type ChangeEvent } from 'react'
import { useStore } from '../../store/AppStore'
import { Button, Notice, useConfirm, useToast } from '../ui'
import { dataCounts, downloadBackup, readBackupFile } from './backup'

/** 정보 관리 > 백업 · 불러오기 */
export function BackupSection({ headingId }: { headingId: string }) {
  const store = useStore()
  const toast = useToast()
  const confirm = useConfirm()
  const inputId = useId()
  const descId = useId()
  const [importErrors, setImportErrors] = useState<{ fileName: string; errors: string[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const cur = dataCounts(store.data)

  const onExport = () => {
    try {
      const name = downloadBackup(store.data)
      toast(`${name} 파일로 내보냈어요.`)
    } catch {
      toast('내보내기에 실패했어요. 다시 시도해 주세요.', 'error')
    }
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget
    const file = input.files?.[0]
    // 같은 파일을 다시 고를 수 있도록 매번 초기화
    input.value = ''
    if (!file) return
    setImportErrors(null)
    setBusy(true)
    try {
      const res = await readBackupFile(file)
      if (!res.ok) {
        // 기존 데이터는 건드리지 않는다
        setImportErrors({ fileName: file.name, errors: res.errors })
        return
      }
      const next = dataCounts(res.data)
      const ok = await confirm({
        title: '이 파일로 데이터를 바꿀까요?',
        danger: true,
        confirmLabel: '불러와서 바꾸기',
        message: (
          <div className="stack">
            <p>
              <strong className="dialog-event-title">{file.name}</strong>
            </p>
            <ul className="plain-list">
              <li>
                행사 {next.events}개{next.samples > 0 ? ` (샘플 ${next.samples}개 포함)` : ''}
              </li>
              <li>관심 {next.favorites}개</li>
              <li>여행 {next.trips}개</li>
            </ul>
            <p>
              현재 데이터(행사 {cur.events}개, 관심 {cur.favorites}개, 여행 {cur.trips}개)는 모두 이 파일의 내용으로 바뀌며 되돌릴 수
              없어요. 필요하면 먼저 JSON으로 내보내 두세요.
            </p>
          </div>
        ),
      })
      if (!ok) {
        toast('불러오기를 취소했어요. 기존 데이터는 그대로예요.', 'info')
        return
      }
      store.replaceAll(res.data)
      toast(`불러오기 완료: 행사 ${next.events}개, 관심 ${next.favorites}개, 여행 ${next.trips}개`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card manage-section" aria-labelledby={headingId}>
      <div className="manage-section__head">
        <h2 id={headingId} className="manage-section__title" tabIndex={-1}>
          백업 · 불러오기
        </h2>
      </div>

      <div className="grid-2 manage-backup">
        <div className="manage-backup__box">
          <h3 className="manage-backup__title">JSON 내보내기</h3>
          <p className="muted small">
            행사 {cur.events}개 · 관심 {cur.favorites}개 · 여행 {cur.trips}개를 JSON 파일 하나로 저장해요.
          </p>
          <Button variant="primary" onClick={onExport} className="manage-backup__btn">
            <span aria-hidden>⬇</span> JSON 내보내기
          </Button>
        </div>

        <div className="manage-backup__box">
          <h3 className="manage-backup__title">JSON 불러오기</h3>
          <p id={descId} className="muted small">
            이 앱에서 내보낸 JSON 파일을 불러오면 현재 데이터를 모두 바꿔요. 바꾸기 전에 한 번 더 확인해요.
          </p>
          <div className="manage-file">
            <input
              id={inputId}
              type="file"
              accept="application/json,.json"
              className="manage-file__input"
              aria-label="불러올 JSON 백업 파일 선택"
              aria-describedby={descId}
              onChange={onFile}
              disabled={busy}
            />
            <label htmlFor={inputId} className={`btn btn--secondary btn--md manage-backup__btn${busy ? ' is-busy' : ''}`}>
              <span aria-hidden>📂</span> {busy ? '읽는 중…' : '파일 선택'}
            </label>
          </div>
        </div>
      </div>

      {importErrors && (
        <Notice tone="danger" title="불러오지 못했어요">
          <div className="stack manage-import-error">
            <p>
              ‘{importErrors.fileName}’ 파일에 문제가 있어요. <strong>기존 데이터는 그대로 유지됩니다.</strong>
            </p>
            <ul className="plain-list">
              {importErrors.errors.map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
            <div>
              <button type="button" className="link-btn" onClick={() => setImportErrors(null)}>
                닫기
              </button>
            </div>
          </div>
        </Notice>
      )}
    </section>
  )
}
