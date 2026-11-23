import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { EventItem, ItineraryItem, Trip } from '../types'
import { RESERVATION_REQUIREMENT_LABEL, TIMEZONE_SHORT } from '../constants'
import { daysBetween, formatDate, formatDateShort, isValidTimezone, todayLocal } from '../lib/date'
import { getEventStatus, getReservationStatus } from '../lib/status'
import { tripDatesWithinEvent } from '../lib/trip'
import { useStore } from '../store/AppStore'
import { Link, goBack, navigate } from '../router'
import { Button, EmptyState, Notice, SampleBadge } from '../components/ui'
import { FavoriteButton, StatusBadges, TypeLabel, WorkTags } from '../components/EventBits'
import { AddToTripDialog } from '../components/AddToTripDialog'
import { ExternalUrl, PeriodText, PlaceText, ReservationMomentText, TextOrUnknown, Unknown } from '../components/events/EventText'
import './events.css'

/** 마지막 확인일이 이보다 오래되면 다시 확인하라고 안내 */
const STALE_DAYS = 30

function BackButton() {
  return (
    <div className="ev-back">
      <Button variant="ghost" onClick={() => goBack('/events')}>
        <span aria-hidden>←</span> 뒤로
      </Button>
    </div>
  )
}

/** '일본 시간(Asia/Tokyo)' 처럼 시간대를 명시 */
function timezoneText(tz: string): string | null {
  if (!tz || !isValidTimezone(tz)) return null
  const short = TIMEZONE_SHORT[tz]
  return short ? `${short}(${tz})` : tz
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function DateValue({ value }: { value: string | null }) {
  return value ? <>{formatDate(value)}</> : <Unknown />
}

interface Scheduled {
  trip: Trip
  items: ItineraryItem[]
}

function ScheduleSection({ event, scheduled, activeTrip }: { event: EventItem; scheduled: Scheduled[]; activeTrip: Trip | undefined }) {
  const overlapDays = activeTrip ? tripDatesWithinEvent(activeTrip, event).length : 0
  return (
    <section className="card">
      <h2 className="section-title">내 여행 일정</h2>
      {scheduled.length > 0 ? (
        <ul className="ev-sched">
          {scheduled.map(({ trip, items }) => (
            <li key={trip.id}>
              <Link to={`/trips/${encodeURIComponent(trip.id)}`} className="ev-sched__link">
                <span className="ev-sched__trip">🧳 {trip.name}</span>
                <span className="ev-sched__dates">
                  {items.map((i) => {
                    const outside = i.date < trip.startDate || i.date > trip.endDate
                    return (
                      <span key={i.id} className="ev-sched__date">
                        {formatDateShort(i.date)}
                        {i.time && ` ${i.time}`}
                        {outside && <span className="unknown small"> (여행 기간 밖)</span>}
                      </span>
                    )
                  })}
                </span>
                <span className="ev-sched__go" aria-hidden>
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">아직 어떤 여행 일정에도 추가하지 않았어요.</p>
      )}
      {activeTrip && !scheduled.some((s) => s.trip.id === activeTrip.id) && (
        <p className="faint small ev-sched__hint">
          ‘{activeTrip.name}’({formatDateShort(activeTrip.startDate)}~{formatDateShort(activeTrip.endDate)}){' '}
          {overlapDays > 0 ? `기간 중 ${overlapDays}일이 행사 기간과 겹치거나 기간 확인이 필요해요.` : '기간은 행사 기간과 겹치지 않아요.'}
        </p>
      )}
    </section>
  )
}

export default function EventDetailPage({ id }: { id: string }) {
  const store = useStore()
  const event = store.getEvent(id)
  const [addOpen, setAddOpen] = useState(false)
  const closeAdd = useCallback(() => setAddOpen(false), [setAddOpen])

  const trips = store.data.trips
  const scheduled = useMemo<Scheduled[]>(
    () =>
      trips
        .map((trip) => ({
          trip,
          items: trip.items
            .filter((i) => i.kind === 'event' && i.eventId === id)
            .sort((a, b) => (a.date === b.date ? (a.time ?? '99:99').localeCompare(b.time ?? '99:99') : a.date < b.date ? -1 : 1)),
        }))
        .filter((s) => s.items.length > 0),
    [trips, id],
  )

  if (!event) {
    return (
      <div className="ev-page">
        <BackButton />
        <EmptyState
          icon="🔍"
          title="행사를 찾을 수 없어요"
          description="삭제되었거나 주소가 잘못되었을 수 있어요."
          action={
            <Link to="/events" className="btn btn--primary btn--md">
              행사 목록으로
            </Link>
          }
        />
      </div>
    )
  }

  const status = getEventStatus(event)
  const resStatus = getReservationStatus(event)
  const tzText = timezoneText(event.timezone)
  const today = todayLocal()
  const checkedAgo = event.lastCheckedDate ? daysBetween(event.lastCheckedDate, today) : null
  const hideResTimes = event.reservationRequired === 'not_required' && !event.reservationStart && !event.reservationEnd
  const mapQuery = event.address.trim()

  return (
    <div className="ev-page ev-detail">
      <BackButton />

      <section className="card ev-hero">
        <div className="ev-hero__tags">
          <WorkTags works={event.works} />
          <TypeLabel event={event} />
        </div>
        <h1 className="ev-hero__title">
          {event.title}
          {event.isSample && (
            <>
              {' '}
              <SampleBadge />
            </>
          )}
        </h1>
        <div className="ev-hero__status">
          <StatusBadges event={event} />
        </div>
        <dl className="ev-card__meta ev-hero__meta">
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
        </dl>
        <div className="ev-actions">
          <Button variant="primary" className="ev-actions__main" onClick={() => setAddOpen(true)}>
            <span aria-hidden>🧳</span> 여행에 추가
          </Button>
          <FavoriteButton eventId={event.id} />
          <Button onClick={() => navigate(`/manage/edit/${encodeURIComponent(event.id)}`)}>
            <span aria-hidden>✏️</span> 수정
          </Button>
        </div>
      </section>

      {(event.isSample || resStatus === 'unknown' || status === 'ended') && (
        <div className="stack">
          {event.isSample && (
            <Notice tone="info" title="시연용 가상 데이터">
              이 행사는 화면 시연을 위해 만든 가상의 샘플이에요. 실제 행사가 아니며, 정보 관리에서 샘플을 한 번에 삭제할 수 있어요.
            </Notice>
          )}
          {status === 'ended' && <Notice tone="info">이미 종료된 행사예요.</Notice>}
          {resStatus === 'unknown' && status !== 'ended' && (
            <Notice tone="warning" title="예약 정보 확인 필요">
              예약 필요 여부나 예약 시작·종료 시각이 확인되지 않아 ‘예약 가능’으로 표시하지 않았어요. 방문 전에 공식 공지에서 예약
              방법을 꼭 확인하세요.
            </Notice>
          )}
        </div>
      )}

      <ScheduleSection event={event} scheduled={scheduled} activeTrip={store.activeTrip} />

      <section className="card">
        <h2 className="section-title">행사 정보</h2>
        <dl className="info-list">
          <InfoRow label="행사명">{event.title}</InfoRow>
          <InfoRow label="관련 작품">
            <WorkTags works={event.works} />
          </InfoRow>
          <InfoRow label="행사 유형">
            <TypeLabel event={event} />
          </InfoRow>
          <InfoRow label="국가·도시">
            <TextOrUnknown value={event.country} label="국가 확인 필요" />
            <span className="ev-sep" aria-hidden>
              {' · '}
            </span>
            <TextOrUnknown value={event.city} label="도시 확인 필요" />
          </InfoRow>
          <InfoRow label="장소">
            <TextOrUnknown value={event.venue} />
          </InfoRow>
          <InfoRow label="주소">
            <TextOrUnknown value={event.address} />
            {mapQuery && (
              <>
                <br />
                <a
                  className="small"
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  지도에서 검색 ↗<span className="sr-only"> (새 창에서 열림)</span>
                </a>
              </>
            )}
          </InfoRow>
          <InfoRow label="시작일">
            <DateValue value={event.startDate} />
          </InfoRow>
          <InfoRow label="종료일">
            <DateValue value={event.endDate} />
          </InfoRow>
        </dl>
      </section>

      <section className="card">
        <h2 className="section-title">예약 정보</h2>
        <p className="ev-tz-note">
          <span aria-hidden>🕒</span>{' '}
          {tzText ? (
            <>
              시각은 모두 <strong>{tzText}</strong> 기준이에요.
            </>
          ) : (
            <>
              시간대: <Unknown />
            </>
          )}
        </p>
        <dl className="info-list">
          <InfoRow label="예약 필요 여부">
            {event.reservationRequired === 'unknown' ? (
              <Unknown />
            ) : (
              RESERVATION_REQUIREMENT_LABEL[event.reservationRequired]
            )}
          </InfoRow>
          {!hideResTimes && (
            <>
              <InfoRow label="예약 시작">
                <ReservationMomentText value={event.reservationStart} tz={event.timezone} />
              </InfoRow>
              <InfoRow label="예약 종료">
                <ReservationMomentText value={event.reservationEnd} tz={event.timezone} />
              </InfoRow>
            </>
          )}
          <InfoRow label="예약 URL">
            <ExternalUrl value={event.reservationUrl} />
          </InfoRow>
        </dl>
      </section>

      <section className="card">
        <h2 className="section-title">출처 · 메모</h2>
        <dl className="info-list">
          <InfoRow label="공식 공지">
            <ExternalUrl value={event.officialUrl} />
          </InfoRow>
          <InfoRow label="마지막 확인">
            <DateValue value={event.lastCheckedDate} />
            {checkedAgo !== null && checkedAgo >= 0 && (
              <span className="faint small"> ({checkedAgo === 0 ? '오늘' : `${checkedAgo}일 전`})</span>
            )}
            {checkedAgo !== null && checkedAgo > STALE_DAYS && (
              <span className="ev-stale small">확인한 지 {STALE_DAYS}일이 넘었어요. 방문 전 공식 공지를 다시 확인하세요.</span>
            )}
          </InfoRow>
          <InfoRow label="메모">
            {event.memo.trim() ? <span className="ev-memo">{event.memo}</span> : <span className="faint">메모 없음</span>}
          </InfoRow>
        </dl>
      </section>

      <AddToTripDialog event={event} open={addOpen} onClose={closeAdd} />
    </div>
  )
}
