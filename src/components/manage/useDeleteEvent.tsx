import { useCallback } from 'react'
import type { EventItem } from '../../types'
import { SAVE_FAILED_MESSAGE, useStore } from '../../store/AppStore'
import { clearEventDraftsFor } from '../../lib/eventDraft'
import { useConfirm, useToast } from '../ui'

/**
 * 삭제 결과
 * - deleted:   삭제해서 저장까지 마침
 * - cancelled: 확인 대화상자에서 취소
 * - failed:    저장에 실패해 아무것도 지우지 않음 (오류 알림은 이 훅이 띄운다)
 */
export type DeleteEventResult = 'deleted' | 'cancelled' | 'failed'

/**
 * 행사 삭제 (확인 → 삭제 → 토스트). 관심 목록·여행 일정의 참조는 store 가 함께 정리한다.
 * 반환 함수는 DeleteEventResult 를 돌려준다. 부르는 쪽은 'deleted' 일 때만 초안 정리·화면 이동을 한다.
 */
export function useDeleteEvent() {
  const store = useStore()
  const confirm = useConfirm()
  const toast = useToast()

  return useCallback(
    async (event: Pick<EventItem, 'id' | 'title' | 'isSample'>): Promise<DeleteEventResult> => {
      const { data } = store
      const itemCount = data.trips.reduce((n, t) => n + t.items.filter((i) => i.kind === 'event' && i.eventId === event.id).length, 0)
      const tripCount = data.trips.filter((t) => t.items.some((i) => i.kind === 'event' && i.eventId === event.id)).length
      const isFav = data.favorites.includes(event.id)

      const ok = await confirm({
        title: '이 행사를 삭제할까요?',
        danger: true,
        confirmLabel: '삭제',
        message: (
          <div className="stack">
            <p>
              <strong className="dialog-event-title">‘{event.title}’</strong>
              {event.isSample && ' (샘플)'} 행사를 삭제합니다.
            </p>
            <ul className="plain-list">
              <li>관심 목록에서도 삭제됩니다.{isFav ? ' (현재 관심 저장됨)' : ''}</li>
              <li>
                여행 일정 {itemCount}개에서도 삭제됩니다.
                {tripCount > 0 ? ` (여행 ${tripCount}개에 포함됨)` : ''}
              </li>
            </ul>
            <p>삭제한 뒤에는 되돌릴 수 없어요.</p>
          </div>
        ),
      })
      if (!ok) return 'cancelled'
      const removed = store.deleteEvent(event.id)
      if (removed === null) {
        // 저장 실패: 행사는 그대로다 → 수정 초안도 지우지 않는다
        toast(`${SAVE_FAILED_MESSAGE} 행사는 삭제되지 않았어요.`, 'error')
        return 'failed'
      }
      // 삭제가 저장된 뒤에만 이 행사의 저장하지 않은 수정 초안을 지운다
      clearEventDraftsFor([event.id])
      toast(removed > 0 ? `행사를 삭제했어요. 여행 일정 ${removed}개도 함께 삭제했어요.` : '행사를 삭제했어요.')
      return 'deleted'
    },
    [store, confirm, toast],
  )
}
