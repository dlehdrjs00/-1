import type { EventItem } from '../../types'
import { formatLocalDateTime } from '../../lib/date'
import { getReservationStatus } from '../../lib/status'
import { Link } from '../../router'
import { SampleBadge } from '../ui'
import { FavoriteButton, StatusBadges, TypeLabel, WorkTags } from '../EventBits'
import { PeriodText, PlaceText } from './EventText'

/**
 * 행사 목록 카드. 카드 전체가 상세로 가는 링크처럼 동작한다
 * (제목 링크를 카드 크기로 늘림). 관심 버튼은 링크 위에 따로 놓인다.
 */
export function EventCard({
  event,
  scheduled,
  now,
  onOpen,
}: {
  event: EventItem
  /** 여행 일정에 이미 들어 있는지 */
  scheduled?: boolean
  now?: Date
  onOpen?: () => void
}) {
  const r = getReservationStatus(event, now)
  return (
    <li className="card ev-card">
      <div className="ev-card__top">
        <div className="ev-card__tags">
          <WorkTags works={event.works} />
          <TypeLabel event={event} />
        </div>
        <FavoriteButton eventId={event.id} compact />
      </div>

      <h2 className="ev-card__title">
        <Link to={`/events/${encodeURIComponent(event.id)}`} className="ev-card__link" onClick={onOpen}>
          {event.title}
        </Link>
        {event.isSample && (
          <>
            {' '}
            <SampleBadge />
          </>
        )}
      </h2>

      <dl className="ev-card__meta">
        <div>
          <dt>기간</dt>
          <dd>
            <PeriodText event={event} />
          </dd>
        </div>
        <div>
          <dt>장소</dt>
          <dd>
            <PlaceText event={event} />
          </dd>
        </div>
        {r === 'before_open' && event.reservationStart && (
          <div>
            <dt>예약 오픈</dt>
            <dd>{formatLocalDateTime(event.reservationStart, event.timezone)}</dd>
          </div>
        )}
        {r === 'open' && event.reservationEnd && (
          <div>
            <dt>예약 마감</dt>
            <dd>{formatLocalDateTime(event.reservationEnd, event.timezone)}</dd>
          </div>
        )}
      </dl>

      <div className="ev-card__status">
        <StatusBadges event={event} now={now} />
        {scheduled && (
          <span className="badge badge--accent" title="여행 일정에 추가된 행사">
            🧳 일정에 있음
          </span>
        )}
      </div>
    </li>
  )
}
