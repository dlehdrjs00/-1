import { useCallback, useMemo, useState } from 'react'
import type { EventItem } from '../types'
import { Link } from '../router'
import { SAVE_FAILED_MESSAGE, useStore } from '../store/AppStore'
import { AddToTripDialog } from '../components/AddToTripDialog'
import { StatusBadges, TypeLabel, WorkTags } from '../components/EventBits'
import { EventCardMeta } from '../components/events/EventCard'
import { Button, EmptyState, Notice, PageHeader, SampleBadge, useToast } from '../components/ui'
import { monthDay } from '../components/trips/tripFormat'
import './events.css'
import './trips.css'

interface Removed {
  id: string
  index: number
  title: string
}

export default function FavoritesPage() {
  const store = useStore()
  const toast = useToast()
  const [target, setTarget] = useState<EventItem | null>(null)
  const [removed, setRemoved] = useState<Removed | null>(null)
  const closeDialog = useCallback(() => setTarget(null), [])

  const events = useMemo(
    () =>
      store.data.favorites
        .map((id) => store.data.events.find((e) => e.id === id))
        .filter((e): e is EventItem => !!e),
    [store.data.favorites, store.data.events],
  )

  const activeTrip = store.activeTrip
  /** 활성 여행에 이미 들어간 날짜 (행사 id → 정렬된 날짜 목록) */
  const addedDates = useMemo(() => {
    const m = new Map<string, string[]>()
    if (!activeTrip) return m
    for (const it of activeTrip.items) {
      if (it.kind !== 'event' || !it.eventId) continue
      const arr = m.get(it.eventId) ?? []
      if (!arr.includes(it.date)) arr.push(it.date)
      m.set(it.eventId, arr)
    }
    for (const arr of m.values()) arr.sort()
    return m
  }, [activeTrip])

  const unsave = (e: EventItem) => {
    const index = store.data.favorites.indexOf(e.id)
    if (index < 0) return
    // 저장 실패: 관심 목록은 그대로다 → 취소 안내·되돌리기를 띄우지 않는다
    if (store.toggleFavorite(e.id) === null) return toast(SAVE_FAILED_MESSAGE, 'error')
    setRemoved({ id: e.id, index, title: e.title })
    toast('관심 저장을 취소했어요.', 'info')
  }

  const undo = () => {
    if (!removed) return
    const cur = store.data
    if (cur.favorites.includes(removed.id) || !cur.events.some((e) => e.id === removed.id)) {
      setRemoved(null)
      return
    }
    // 원래 순서 위치로 되돌린다
    const favorites = [...cur.favorites]
    favorites.splice(Math.min(removed.index, favorites.length), 0, removed.id)
    // 저장 실패: 되살리지 못했다 → 되돌리기 안내를 남겨 다시 시도할 수 있게 한다
    if (!store.replaceAll({ ...cur, favorites })) return toast(`${SAVE_FAILED_MESSAGE} 관심 행사는 아직 되살리지 못했어요.`, 'error')
    setRemoved(null)
    toast('다시 저장했어요.')
  }

  return (
    <div className="favs-page">
      <PageHeader
        title="관심 행사"
        subtitle={events.length ? `저장한 행사 ${events.length}개` : '가고 싶은 행사를 모아 두는 곳이에요.'}
      />

      {removed && (
        <Notice tone="info">
          <span className="favs-undo">
            <span className="favs-undo__text">‘{removed.title}’ 저장을 취소했어요.</span>
            <span className="favs-undo__actions">
              <Button size="sm" onClick={undo}>
                되돌리기
              </Button>
              <button type="button" className="icon-btn icon-btn--sm" aria-label="알림 닫기" onClick={() => setRemoved(null)}>
                ✕
              </button>
            </span>
          </span>
        </Notice>
      )}

      {events.length === 0 ? (
        <EmptyState
          icon="☆"
          title="아직 저장한 관심 행사가 없어요"
          description="행사 목록에서 ☆ 관심 저장을 누르면 여기에 모여요. 모은 행사는 바로 여행 일정에 넣을 수 있어요."
          action={
            <Link to="/events" className="btn btn--primary btn--md">
              행사 둘러보기
            </Link>
          }
        />
      ) : (
        <ul className="favs-list">
          {events.map((e) => {
            const dates = addedDates.get(e.id)
            return (
              // 목록 카드(EventCard)와 같은 모양: 작품·유형 → 제목 → 기간·장소 → 상태 배지
              <li key={e.id} className="card ev-card favs-card">
                <div className="ev-card__top">
                  <div className="ev-card__tags">
                    <WorkTags works={e.works} />
                    <TypeLabel event={e} />
                  </div>
                </div>
                <h2 className="ev-card__title">
                  <Link to={`/events/${encodeURIComponent(e.id)}`} className="ev-card__link">
                    {e.title}
                  </Link>
                  {e.isSample && (
                    <>
                      {' '}
                      <SampleBadge />
                    </>
                  )}
                </h2>
                <EventCardMeta event={e} />
                <div className="ev-card__status">
                  <StatusBadges event={e} />
                </div>
                {activeTrip && dates && dates.length > 0 && (
                  <p className="favs-added">
                    <span aria-hidden>✓</span>{' '}
                    <Link to={`/trips/${encodeURIComponent(activeTrip.id)}`}>
                      일정에 추가됨: {dates.map(monthDay).join(', ')}
                    </Link>
                    <span className="favs-added__trip"> · {activeTrip.name}</span>
                  </p>
                )}
                <div className="favs-card__actions">
                  <Button variant="primary" onClick={() => setTarget(e)}>
                    여행에 추가
                  </Button>
                  <Button variant="ghost" onClick={() => unsave(e)} aria-label={`${e.title} 저장 취소`}>
                    <span aria-hidden>★</span> 저장 취소
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {target && <AddToTripDialog event={target} open onClose={closeDialog} />}
    </div>
  )
}
