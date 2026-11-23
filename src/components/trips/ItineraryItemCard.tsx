import type { ItineraryItem, Trip } from '../../types'
import { formatDate, formatLocalDateTime } from '../../lib/date'
import { getReservationStatus } from '../../lib/status'
import { Link } from '../../router'
import { useStore } from '../../store/AppStore'
import { StatusBadges, TypeLabel } from '../EventBits'
import { Badge, Button, SampleBadge } from '../ui'
import { itemWarnings } from './tripFormat'

export interface ItemCardProps {
  trip: Trip
  item: ItineraryItem
  /** 같은 날짜 안에서의 위치 (순서 바꾸기 버튼 활성화용). null 이면 순서 버튼 숨김 */
  position: { index: number; count: number } | null
  /** 여행 기간 밖 목록처럼 날짜를 함께 보여줄 때 */
  showDate?: boolean
  onMove: (item: ItineraryItem, dir: -1 | 1) => void
  onEdit: (item: ItineraryItem) => void
  onDelete: (item: ItineraryItem) => void
}

export function ItineraryItemCard({ trip, item, position, showDate, onMove, onEdit, onDelete }: ItemCardProps) {
  const store = useStore()
  const event = item.kind === 'event' && item.eventId ? store.getEvent(item.eventId) : undefined
  const warnings = itemWarnings(trip, item, event)
  const title = item.kind === 'event' ? (event?.title ?? '삭제된 행사') : item.placeName || '이름 없는 장소'
  const place =
    item.kind === 'event'
      ? event
        ? [event.venue, event.address].filter((s) => s && s.trim()).join(' · ')
        : ''
      : item.placeAddress.trim()
  const reservation = event ? getReservationStatus(event) : null

  return (
    <li className={`tp-item${warnings.some((w) => w.tone === 'danger') ? ' tp-item--danger' : warnings.length ? ' tp-item--warn' : ''}`}>
      <div className="tp-item__body">
        <div className="tp-item__meta">
          {showDate && <span className="tp-item__date">{formatDate(item.date)}</span>}
          <span className={`tp-time${item.time ? '' : ' tp-time--unset'}`}>{item.time ?? '시간 미정'}</span>
          {item.kind === 'place' ? <Badge tone="accent">직접 추가</Badge> : event && <TypeLabel event={event} />}
        </div>

        <p className="tp-item__title">
          {event ? <Link to={`/events/${event.id}`}>{title}</Link> : <span>{title}</span>}
          {event?.isSample && (
            <>
              {' '}
              <SampleBadge />
            </>
          )}
        </p>

        {place ? (
          <p className="tp-item__place">
            <span aria-hidden>📍</span> {place}
          </p>
        ) : (
          item.kind === 'event' &&
          event && (
            <p className="tp-item__place">
              <span aria-hidden>📍</span> <span className="unknown">장소 확인 필요</span>
            </p>
          )
        )}

        {item.memo && (
          <p className="tp-item__memo">
            <span className="sr-only">메모: </span>
            {item.memo}
          </p>
        )}

        {event && (
          <div className="tp-item__status">
            <StatusBadges event={event} />
            {reservation === 'before_open' && event.reservationStart && (
              <p className="tp-item__hint">예약 오픈 {formatLocalDateTime(event.reservationStart, event.timezone)}</p>
            )}
          </div>
        )}

        {warnings.length > 0 && (
          <ul className="tp-warns">
            {warnings.map((w) => (
              <li key={w.key} className={`tp-warn tp-warn--${w.tone}`}>
                <span aria-hidden>{w.tone === 'danger' ? '⛔' : '⚠️'}</span>
                <span>{w.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="tp-item__ctrl">
        {position && (
          <div className="tp-item__order" role="group" aria-label="순서 바꾸기">
            <button
              type="button"
              className="icon-btn"
              data-move={`${item.id}:-1`}
              aria-label={`${title} 위로 이동`}
              title="위로 이동"
              disabled={position.index === 0}
              onClick={() => onMove(item, -1)}
            >
              ▲
            </button>
            <button
              type="button"
              className="icon-btn"
              data-move={`${item.id}:1`}
              aria-label={`${title} 아래로 이동`}
              title="아래로 이동"
              disabled={position.index === position.count - 1}
              onClick={() => onMove(item, 1)}
            >
              ▼
            </button>
          </div>
        )}
        <div className="tp-item__actions">
          <Button onClick={() => onEdit(item)} aria-label={`${title} ${showDate ? '날짜 변경·수정' : '수정'}`}>
            {showDate ? '날짜 변경' : '수정'}
          </Button>
          <Button variant="danger" onClick={() => onDelete(item)} aria-label={`${title} 삭제`}>
            삭제
          </Button>
        </div>
      </div>
    </li>
  )
}
