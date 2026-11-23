import type { DateOnly, ItineraryItem, Trip } from '../../types'
import { formatDate } from '../../lib/date'
import { itemsByDate } from '../../lib/trip'
import { Button } from '../ui'
import { ItineraryItemCard } from './ItineraryItemCard'

export function DayCard({
  trip,
  date,
  dayNo,
  onAddPlace,
  onAddEvent,
  onMove,
  onEdit,
  onDelete,
}: {
  trip: Trip
  date: DateOnly
  dayNo: number
  onAddPlace: (date: DateOnly) => void
  onAddEvent: (date: DateOnly) => void
  onMove: (item: ItineraryItem, dir: -1 | 1) => void
  onEdit: (item: ItineraryItem) => void
  onDelete: (item: ItineraryItem) => void
}) {
  const items = itemsByDate(trip, date)
  const headId = `tp-day-${date}`
  return (
    <section className="card tp-day" aria-labelledby={headId} id={`day-${date}`}>
      <header className="tp-day__head">
        <h3 id={headId}>
          <span className="tp-day__no">{dayNo}일차</span>
          <span className="tp-day__sep" aria-hidden>
            {' '}
            ·{' '}
          </span>
          <span className="tp-day__date">{formatDate(date)}</span>
        </h3>
        <span className="tp-day__count">{items.length ? `일정 ${items.length}개` : '비어 있음'}</span>
      </header>

      {items.length ? (
        <ol className="tp-items">
          {items.map((item, index) => (
            <ItineraryItemCard
              key={item.id}
              trip={trip}
              item={item}
              position={{ index, count: items.length }}
              onMove={onMove}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ol>
      ) : (
        <p className="tp-day__empty">아직 일정이 없어요. 가고 싶은 곳을 추가해 보세요.</p>
      )}

      <div className="tp-day__add">
        <Button onClick={() => onAddPlace(date)}>+ 장소 직접 추가</Button>
        <Button onClick={() => onAddEvent(date)}>+ 관심 행사 추가</Button>
      </div>
    </section>
  )
}
