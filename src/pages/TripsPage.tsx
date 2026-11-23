import { useCallback, useEffect, useRef, useState } from 'react'
import type { DateOnly, ItineraryItem } from '../types'
import { formatDateShort } from '../lib/date'
import { itemsOutsideTrip, tripDates } from '../lib/trip'
import { Link, navigate } from '../router'
import { SAVE_FAILED_MESSAGE, useStore } from '../store/AppStore'
import { Button, Chip, EmptyState, Notice, PageHeader, useConfirm, useToast } from '../components/ui'
import { TripFormModal } from '../components/trips/TripFormModal'
import { TripSummary } from '../components/trips/TripSummary'
import { DayCard } from '../components/trips/DayCard'
import { ItineraryItemCard } from '../components/trips/ItineraryItemCard'
import { ItemFormModal } from '../components/trips/ItemFormModal'
import { AddEventModal } from '../components/trips/AddEventModal'
import { monthDay } from '../components/trips/tripFormat'
import './trips.css'

type TripForm = null | 'create' | 'edit'

export default function TripsPage({ tripId }: { tripId?: string }) {
  const store = useStore()
  const toast = useToast()
  const confirm = useConfirm()
  const trips = store.data.trips
  const trip = tripId ? store.getTrip(tripId) : store.activeTrip

  const [tripForm, setTripForm] = useState<TripForm>(null)
  const [editItemId, setEditItemId] = useState<string | null>(null)
  const [addPlaceDate, setAddPlaceDate] = useState<DateOnly | null>(null)
  const [addEventDate, setAddEventDate] = useState<DateOnly | null>(null)
  const pendingFocus = useRef<{ id: string; dir: -1 | 1 } | null>(null)

  // 주소로 직접 연 여행을 활성 여행으로 (다른 화면의 '여행에 추가' 기본값과 맞추기 위해).
  // 경로가 바뀔 때 한 번만 맞춘다 — 다른 탭과 activeTripId 를 서로 덮어쓰는 무한 반복을 막기 위해.
  // 저장에 실패해도 조용히 넘어간다: 보기만 하는 동작이라 알림을 띄우지 않고, syncedFor 를 먼저 적어 두므로
  // 실패한 뒤 다시 그려져도 같은 경로에서는 다시 시도하지 않는다 (실패 시 데이터가 바뀌지 않아 다시 그려지지도 않는다).
  const syncedFor = useRef<string | null>(null)
  const tripFound = !!trip
  const setActiveTrip = store.setActiveTrip
  const activeTripId = store.data.activeTripId
  useEffect(() => {
    if (!tripId || !tripFound || syncedFor.current === tripId) return
    syncedFor.current = tripId
    if (activeTripId !== tripId) void setActiveTrip(tripId)
  }, [tripId, tripFound, activeTripId, setActiveTrip])

  // 순서 바꾸기 후 버튼 포커스 유지 (키보드 사용자용)
  useEffect(() => {
    const pf = pendingFocus.current
    if (!pf) return
    pendingFocus.current = null
    const btns = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-move]'))
    const el = btns.find((b) => b.dataset.move === `${pf.id}:${pf.dir}`)
    const other = btns.find((b) => b.dataset.move === `${pf.id}:${-pf.dir}`)
    if (el && !el.disabled) el.focus()
    else other?.focus()
  })

  const closeTripForm = useCallback(() => setTripForm(null), [])
  const closeEditItem = useCallback(() => setEditItemId(null), [])
  const closeAddPlace = useCallback(() => setAddPlaceDate(null), [])
  const closeAddEvent = useCallback(() => setAddEventDate(null), [])
  const onCreated = useCallback((t: { id: string }) => navigate(`/trips/${encodeURIComponent(t.id)}`), [])

  const createModal = tripForm === 'create' && (
    <TripFormModal onClose={closeTripForm} onCreated={onCreated} />
  )

  /* ---------- 여행 없음 ---------- */
  if (!trips.length) {
    return (
      <div className="tp-page">
        <PageHeader title="내 여행" />
        <EmptyState
          icon="🧳"
          title="아직 만든 여행이 없어요"
          description="여행 기간과 도시를 정하면 날짜별로 덕질 일정을 짤 수 있어요."
          action={
            <Button variant="primary" onClick={() => setTripForm('create')}>
              여행 만들기
            </Button>
          }
        />
        {createModal}
      </div>
    )
  }

  /* ---------- 주소의 여행을 찾을 수 없음 ---------- */
  if (!trip) {
    return (
      <div className="tp-page">
        <PageHeader title="내 여행" />
        <EmptyState
          icon="🧭"
          title="여행을 찾을 수 없어요"
          description="삭제되었거나 주소가 잘못되었을 수 있어요."
          action={
            <Link to="/trips" className="btn btn--primary btn--md">
              내 여행으로
            </Link>
          }
        />
      </div>
    )
  }

  const dates = tripDates(trip)
  const outside = itemsOutsideTrip(trip)
  const editItem = editItemId ? trip.items.find((i) => i.id === editItemId) : undefined

  const itemTitle = (item: ItineraryItem) =>
    item.kind === 'event' ? (store.getEvent(item.eventId ?? '')?.title ?? '삭제된 행사') : item.placeName || '이름 없는 장소'

  const onMove = (item: ItineraryItem, dir: -1 | 1) => {
    pendingFocus.current = { id: item.id, dir }
    if (!store.moveItineraryItem(trip.id, item.id, dir)) {
      // 저장 실패: 순서는 그대로다. 다음에 다시 그릴 때 엉뚱하게 포커스를 옮기지 않도록 지운다
      pendingFocus.current = null
      toast(SAVE_FAILED_MESSAGE, 'error')
    }
  }

  const onDeleteItem = async (item: ItineraryItem) => {
    const ok = await confirm({
      title: '일정을 삭제할까요?',
      message: `‘${itemTitle(item)}’을(를) ${formatDateShort(item.date)} 일정에서 삭제합니다.`,
      confirmLabel: '삭제',
      danger: true,
    })
    if (!ok) return
    if (!store.removeItineraryItem(trip.id, item.id)) return toast(`${SAVE_FAILED_MESSAGE} 일정은 삭제되지 않았어요.`, 'error')
    toast('일정을 삭제했어요.', 'info')
  }

  const onDeleteTrip = async () => {
    const ok = await confirm({
      title: '여행을 삭제할까요?',
      message: (
        <>
          ‘{trip.name}’ 여행과 일정 {trip.items.length}개가 모두 삭제됩니다. 되돌릴 수 없어요.
          <br />
          관심 행사와 행사 정보는 그대로 남아요.
        </>
      ),
      confirmLabel: '여행 삭제',
      danger: true,
    })
    if (!ok) return
    // 저장 실패: 여행은 그대로 남아 있다 → 이 화면에 머문다
    if (!store.deleteTrip(trip.id)) return toast(`${SAVE_FAILED_MESSAGE} 여행은 삭제되지 않았어요.`, 'error')
    toast('여행을 삭제했어요.', 'info')
    navigate('/trips', { replace: true })
  }

  // 여행 전환은 '보기' 동작이라 저장 성공과 무관하게 이동한다.
  // 활성 여행 저장은 경로 effect 가 조용히 시도한다 (실패하면 상단 저장 실패 안내만 보인다).
  const selectTrip = (id: string) => navigate(`/trips/${encodeURIComponent(id)}`)

  return (
    <div className="tp-page">
      <PageHeader
        title="내 여행"
        subtitle={trips.length > 1 ? `여행 ${trips.length}개` : undefined}
        actions={
          <Button variant="primary" onClick={() => setTripForm('create')}>
            + 새 여행
          </Button>
        }
      />

      {trips.length > 1 && (
        <nav className="tp-switcher" aria-label="여행 선택">
          <div className="chips">
            {trips.map((t) => (
              <Chip key={t.id} active={t.id === trip.id} onClick={() => selectTrip(t.id)}>
                <span className="tp-switcher__name">{t.name}</span>
                <span className="tp-switcher__date">
                  {monthDay(t.startDate)}~{monthDay(t.endDate)}
                </span>
              </Chip>
            ))}
          </div>
        </nav>
      )}

      <TripSummary trip={trip} onEdit={() => setTripForm('edit')} onDelete={onDeleteTrip} />

      {outside.length > 0 && (
        <section className="tp-outside" id="tp-outside" aria-labelledby="tp-outside-title">
          <h2 id="tp-outside-title" className="section-title">
            여행 기간 밖 일정 <span className="tp-count">{outside.length}</span>
          </h2>
          <Notice tone="warning">
            여행 날짜를 바꾸면서 기간 밖으로 밀려난 일정이에요. ‘날짜 변경’으로 여행 기간 안으로 옮기거나 삭제해 주세요.
          </Notice>
          <ol className="tp-items tp-items--outside">
            {outside.map((item) => (
              <ItineraryItemCard
                key={item.id}
                trip={trip}
                item={item}
                position={null}
                showDate
                onMove={onMove}
                onEdit={(i) => setEditItemId(i.id)}
                onDelete={onDeleteItem}
              />
            ))}
          </ol>
        </section>
      )}

      <section className="tp-days" aria-labelledby="tp-days-title">
        <h2 id="tp-days-title" className="section-title">
          날짜별 일정
        </h2>
        <div className="tp-days__list">
          {dates.map((d, i) => (
            <DayCard
              key={d}
              trip={trip}
              date={d}
              dayNo={i + 1}
              onAddPlace={setAddPlaceDate}
              onAddEvent={setAddEventDate}
              onMove={onMove}
              onEdit={(item) => setEditItemId(item.id)}
              onDelete={onDeleteItem}
            />
          ))}
        </div>
      </section>

      {createModal}
      {tripForm === 'edit' && <TripFormModal trip={trip} onClose={closeTripForm} />}
      {editItem && <ItemFormModal trip={trip} item={editItem} onClose={closeEditItem} />}
      {addPlaceDate && <ItemFormModal trip={trip} defaultDate={addPlaceDate} onClose={closeAddPlace} />}
      {addEventDate && (
        <AddEventModal trip={trip} date={addEventDate} dayNo={dates.indexOf(addEventDate) + 1} onClose={closeAddEvent} />
      )}
    </div>
  )
}
