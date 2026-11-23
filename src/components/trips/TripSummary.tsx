import type { ReactNode } from 'react'
import type { Trip } from '../../types'
import { formatDate, timezoneLabel } from '../../lib/date'
import { itemsOutsideTrip } from '../../lib/trip'
import { useStore } from '../../store/AppStore'
import { Button } from '../ui'
import { itemWarnings, timezoneFullLabel, tripLengthLabel } from './tripFormat'

function orUnknown(v: string): ReactNode {
  return v.trim() ? v : <span className="unknown">확인 필요</span>
}

/** 여행 머리 카드: 이름, 기간, 도시, 시간대, 숙소, 수정/삭제 */
export function TripSummary({ trip, onEdit, onDelete }: { trip: Trip; onEdit: () => void; onDelete: () => void }) {
  const store = useStore()
  const outside = itemsOutsideTrip(trip).length
  const warnCount = trip.items.reduce((n, i) => {
    const ev = i.kind === 'event' && i.eventId ? store.getEvent(i.eventId) : undefined
    return n + (itemWarnings(trip, i, ev).length > 0 ? 1 : 0)
  }, 0)
  const { accommodation: acc } = trip

  return (
    <section className="card tp-summary" aria-labelledby="tp-summary-title">
      <div className="tp-summary__head">
        <p className="tp-summary__eyebrow">
          <span aria-hidden>🧳</span> {trip.city.trim() || '도시 확인 필요'}
        </p>
        <h2 id="tp-summary-title" className="tp-summary__title">
          {trip.name}
        </h2>
        <p className="tp-summary__period">
          <span>
            {formatDate(trip.startDate)} ~ {formatDate(trip.endDate)}
          </span>
          <span className="tp-summary__length">{tripLengthLabel(trip.startDate, trip.endDate)}</span>
        </p>
      </div>

      <div className="tp-summary__stats">
        <span className="tp-stat">
          일정 <strong>{trip.items.length}</strong>개
        </span>
        {warnCount > 0 && (
          <span className="tp-stat tp-stat--warn">
            확인할 일정 <strong>{warnCount}</strong>개
          </span>
        )}
        {outside > 0 && (
          <button
            type="button"
            className="tp-stat tp-stat--warn tp-stat--btn"
            onClick={() => document.getElementById('tp-outside')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            여행 기간 밖 <strong>{outside}</strong>개 ↓
          </button>
        )}
      </div>

      <dl className="info-list tp-summary__info">
        <div>
          <dt>도시</dt>
          <dd>{orUnknown(trip.city)}</dd>
        </div>
        <div>
          <dt>시간대</dt>
          <dd>{timezoneFullLabel(trip.timezone)}</dd>
        </div>
        <div>
          <dt>숙소</dt>
          <dd>
            <span className="tp-acc__name">{orUnknown(acc.name)}</span>
          </dd>
        </div>
        <div>
          <dt>숙소 주소</dt>
          <dd>{orUnknown(acc.address)}</dd>
        </div>
        {acc.memo.trim() && (
          <div>
            <dt>숙소 메모</dt>
            <dd className="tp-acc__memo">{acc.memo}</dd>
          </div>
        )}
      </dl>

      <p className="tp-tz-note">
        <span aria-hidden>🕒</span> 일정의 시간은 {timezoneLabel(trip.timezone)} 기준이에요.
      </p>

      <div className="tp-summary__actions">
        <Button onClick={onEdit}>여행 정보 수정</Button>
        <Button variant="danger" onClick={onDelete}>
          여행 삭제
        </Button>
      </div>
    </section>
  )
}
