import { useCallback } from 'react'
import type { EventItem } from '../../types'
import { useStore } from '../../store/AppStore'
import { clearEventDraftsFor } from '../../lib/eventDraft'
import { useConfirm, useToast } from '../ui'

/**
 * 행사 삭제 (확인 → 삭제 → 토스트). 관심 목록·여행 일정의 참조는 store 가 함께 정리한다.
 * 반환 함수는 실제로 삭제했으면 true.
 */
export function useDeleteEvent() {
  const store = useStore()
  const confirm = useConfirm()
  const toast = useToast()

  return useCallback(
    async (event: Pick<EventItem, 'id' | 'title' | 'isSample'>): Promise<boolean> => {
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
      if (!ok) return false
      const removed = store.deleteEvent(event.id)
      // 이 행사의 저장하지 않은 수정 초안도 지운다
      clearEventDraftsFor([event.id])
      toast(removed > 0 ? `행사를 삭제했어요. 여행 일정 ${removed}개도 함께 삭제했어요.` : '행사를 삭제했어요.')
      return true
    },
    [store, confirm, toast],
  )
}
