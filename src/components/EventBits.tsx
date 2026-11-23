import type { EventItem, WorkId } from '../types'
import {
  EVENT_STATUS_LABEL,
  EVENT_STATUS_TONE,
  EVENT_TYPE_MAP,
  RESERVATION_STATUS_LABEL,
  RESERVATION_STATUS_TONE,
  WORK_MAP,
} from '../constants'
import { getEventStatus, getReservationStatus } from '../lib/status'
import { SAVE_FAILED_MESSAGE, useStore } from '../store/AppStore'
import { Badge, useToast } from './ui'

export function WorkTags({ works }: { works: WorkId[] }) {
  if (!works.length) return <span className="work-tag work-tag--unknown">작품 확인 필요</span>
  return (
    <span className="work-tags">
      {works.map((w) => (
        <span key={w} className="work-tag" style={{ '--work-color': WORK_MAP[w].color } as React.CSSProperties}>
          {WORK_MAP[w].name}
        </span>
      ))}
    </span>
  )
}

export function TypeLabel({ event }: { event: Pick<EventItem, 'type'> }) {
  const t = EVENT_TYPE_MAP[event.type]
  return (
    <span className="type-label">
      <span aria-hidden>{t.icon}</span> {t.label}
    </span>
  )
}

/**
 * 진행 상태와 예약 상태를 각각 별도 배지로 표시.
 * 라벨('진행 중', '예약 접수 중' 등)이 이미 스스로 설명되므로 접두어를 겹쳐 쓰지 않고,
 * 두 종류는 아이콘(📅 진행 / 🎫 예약)으로 구분한다. 화면 낭독기에는 '진행 상태:' 등을 읽어 준다.
 */
export function StatusBadges({ event, now }: { event: EventItem; now?: Date }) {
  const s = getEventStatus(event, now)
  const r = getReservationStatus(event, now)
  return (
    <span className="status-badges">
      <Badge tone={EVENT_STATUS_TONE[s]} title="행사 진행 상태">
        <span className="badge__icon" aria-hidden>
          📅
        </span>
        <span className="sr-only">진행 상태: </span>
        {EVENT_STATUS_LABEL[s]}
      </Badge>
      <Badge tone={RESERVATION_STATUS_TONE[r]} title="예약 상태">
        <span className="badge__icon" aria-hidden>
          🎫
        </span>
        <span className="sr-only">예약 상태: </span>
        {RESERVATION_STATUS_LABEL[r]}
      </Badge>
    </span>
  )
}

/** 관심 저장 토글 버튼 */
export function FavoriteButton({ eventId, compact }: { eventId: string; compact?: boolean }) {
  const store = useStore()
  const toast = useToast()
  const fav = store.isFavorite(eventId)
  return (
    <button
      type="button"
      className={`fav-btn${fav ? ' fav-btn--on' : ''}${compact ? ' fav-btn--compact' : ''}`}
      aria-pressed={fav}
      aria-label={fav ? '관심 저장 취소' : '관심 저장'}
      title={fav ? '관심 저장 취소' : '관심 저장'}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const on = store.toggleFavorite(eventId)
        // 저장에 실패하면 관심 여부는 그대로다 → 성공 안내 없이 오류만 알린다
        if (on === null) return toast(SAVE_FAILED_MESSAGE, 'error')
        toast(on ? '관심 행사에 저장했어요.' : '관심 저장을 취소했어요.', on ? 'success' : 'info')
      }}
    >
      <span aria-hidden>{fav ? '★' : '☆'}</span>
      {!compact && <span>{fav ? '관심 저장됨' : '관심 저장'}</span>}
    </button>
  )
}
