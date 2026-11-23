import { useCallback, useId, useState } from 'react'
import { useStore } from '../../store/AppStore'
import { Button, Field, Modal, useToast } from '../ui'
import { dataCounts, downloadBackup } from './backup'

const CONFIRM_WORD = '초기화'

/** 정보 관리 > 초기화. 확인 단어를 직접 입력해야 실행된다. */
export function ResetSection({ headingId }: { headingId: string }) {
  const store = useStore()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const formId = useId()
  const cur = dataCounts(store.data)
  const userEvents = cur.events - cur.samples

  // Modal 은 onClose 가 바뀌면 포커스를 다시 잡으므로 안정된 참조를 넘긴다
  const close = useCallback(() => {
    setOpen(false)
    setText('')
  }, [])

  const canReset = text.trim() === CONFIRM_WORD

  const doReset = () => {
    if (!canReset) return
    store.resetAll()
    close()
    toast('모든 데이터를 초기화했어요.')
  }

  return (
    <section className="card manage-section manage-section--danger" aria-labelledby={headingId}>
      <div className="manage-section__head">
        <h2 id={headingId} className="manage-section__title" tabIndex={-1}>
          초기화
        </h2>
      </div>
      <p className="muted small">
        모든 데이터를 처음 상태(샘플 행사와 기본 여행 예시)로 되돌려요. 직접 등록한 행사, 관심 목록, 여행 일정이 모두 사라집니다.
      </p>
      <div>
        <Button variant="danger" onClick={() => setOpen(true)}>
          모든 데이터 초기화
        </Button>
      </div>

      <Modal
        open={open}
        title="모든 데이터를 초기화할까요?"
        onClose={close}
        footer={
          <>
            <Button onClick={close}>취소</Button>
            <Button variant="danger" type="submit" form={formId} disabled={!canReset}>
              초기화
            </Button>
          </>
        }
      >
        <div className="stack">
          <p className="confirm-msg">아래 데이터가 모두 지워지고 처음 상태로 돌아가요. 되돌릴 수 없어요.</p>
          <ul className="plain-list confirm-msg">
            <li>직접 등록한 행사 {userEvents}개</li>
            <li>관심 {cur.favorites}개</li>
            <li>여행 {cur.trips}개와 그 일정</li>
          </ul>
          <div>
            <Button
              size="sm"
              onClick={() => {
                try {
                  toast(`${downloadBackup(store.data)} 파일로 내보냈어요.`)
                } catch {
                  toast('내보내기에 실패했어요.', 'error')
                }
              }}
            >
              <span aria-hidden>⬇</span> 먼저 JSON으로 백업하기
            </Button>
          </div>
          <form
            id={formId}
            onSubmit={(e) => {
              e.preventDefault()
              doReset()
            }}
          >
            <Field label={`계속하려면 ‘${CONFIRM_WORD}’를 입력하세요`}>
              {(id) => (
                <input
                  id={id}
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  autoComplete="off"
                  placeholder={CONFIRM_WORD}
                />
              )}
            </Field>
          </form>
        </div>
      </Modal>
    </section>
  )
}
