import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { EVENT_TYPE_MAP, WORK_MAP } from '../constants'
import { formatDateShort } from '../lib/date'
import { useStore } from '../store/AppStore'
import { Link } from '../router'
import { Button, EmptyState, PageHeader } from '../components/ui'
import { EventCard } from '../components/events/EventCard'
import { EventFilterPanel } from '../components/events/EventFilterPanel'
import {
  CITY_UNKNOWN_LABEL,
  COUNTRY_UNKNOWN_LABEL,
  DEFAULT_FILTERS,
  activeFilterCount,
  filterAndSort,
  hasInvalidRange,
  isDefaultFilters,
  sanitizeFilters,
  type EventFilters,
} from '../components/events/eventFilters'
import './events.css'

/* 상세에 다녀와도 필터·스크롤 위치를 유지하기 위한 세션 저장 */
const VIEW_KEY = 'subcul-trip-planner:v1:events-view'
const SCROLL_KEY = 'subcul-trip-planner:v1:events-scroll'
const PANEL_ID = 'ev-filter-panel'

interface ViewState {
  filters: EventFilters
  /** 모바일에서 필터 패널 펼침 여부 */
  panelOpen: boolean
}

function loadView(): ViewState {
  try {
    const raw = sessionStorage.getItem(VIEW_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<ViewState> | null
      return { filters: sanitizeFilters(p?.filters), panelOpen: p?.panelOpen === true }
    }
  } catch {
    /* 저장소를 쓸 수 없으면 기본값 */
  }
  return { filters: { ...DEFAULT_FILTERS }, panelOpen: false }
}

function summarize(f: EventFilters): string[] {
  const out: string[] = []
  const q = f.q.trim()
  if (q) out.push(`‘${q}’`)
  if (f.works.length) {
    const names = f.works.map((w) => WORK_MAP[w].short)
    out.push(names.length > 2 ? `${names.slice(0, 2).join(', ')} 외 ${names.length - 2}` : names.join(', '))
  }
  if (f.types.length) {
    const names = f.types.map((t) => EVENT_TYPE_MAP[t].label)
    out.push(names.length > 2 ? `${names.slice(0, 2).join(', ')} 외 ${names.length - 2}` : names.join(', '))
  }
  if (f.country !== null) {
    out.push(f.city !== null ? f.city || CITY_UNKNOWN_LABEL : `${f.country || COUNTRY_UNKNOWN_LABEL} 전체`)
  }
  if (f.from || f.to) {
    out.push(hasInvalidRange(f) ? '날짜 확인 필요' : `${f.from ? formatDateShort(f.from) : ''}~${f.to ? formatDateShort(f.to) : ''}`)
  }
  return out
}

export default function EventsPage() {
  const store = useStore()
  const events = store.data.events
  const trips = store.data.trips
  const trip = store.activeTrip

  const [view, setView] = useState<ViewState>(loadView)
  const { filters, panelOpen } = view

  useEffect(() => {
    try {
      sessionStorage.setItem(VIEW_KEY, JSON.stringify(view))
    } catch {
      /* ignore */
    }
  }, [view])

  // 상세에서 돌아왔을 때 스크롤 위치 복원 (한 번만)
  useLayoutEffect(() => {
    let y = 0
    try {
      y = Number(sessionStorage.getItem(SCROLL_KEY) ?? 0)
      sessionStorage.removeItem(SCROLL_KEY)
    } catch {
      /* ignore */
    }
    if (Number.isFinite(y) && y > 0) window.scrollTo(0, y)
  }, [])

  const rememberScroll = useCallback(() => {
    try {
      sessionStorage.setItem(SCROLL_KEY, String(Math.round(window.scrollY)))
    } catch {
      /* ignore */
    }
  }, [])

  const patch = useCallback((p: Partial<EventFilters>) => setView((v) => ({ ...v, filters: { ...v.filters, ...p } })), [])
  const reset = useCallback(() => setView((v) => ({ ...v, filters: { ...DEFAULT_FILTERS } })), [])
  const setPanel = (open: boolean) => setView((v) => ({ ...v, panelOpen: open }))

  const { items, hiddenEnded } = useMemo(() => filterAndSort(events, filters), [events, filters])

  const scheduledIds = useMemo(() => {
    const s = new Set<string>()
    for (const t of trips) for (const i of t.items) if (i.kind === 'event' && i.eventId) s.add(i.eventId)
    return s
  }, [trips])

  const count = activeFilterCount(filters)
  const summary = summarize(filters)
  const isDefault = isDefaultFilters(filters)

  const header = (
    <PageHeader
      title="행사 목록"
      subtitle="팝업스토어·콜라보 카페·공연·전시를 모아 보고 여행 일정에 담아 보세요."
      actions={
        <Link to="/manage/new" className="btn btn--secondary btn--md">
          <span aria-hidden>＋</span> 행사 등록
        </Link>
      }
    />
  )

  if (events.length === 0) {
    return (
      <div className="ev-page">
        {header}
        <EmptyState
          icon="🎪"
          title="아직 등록된 행사가 없어요"
          description="가고 싶은 팝업스토어나 콜라보 카페 정보를 직접 등록해 보세요."
          action={
            <Link to="/manage/new" className="btn btn--primary btn--md">
              행사 등록
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="ev-page">
      {header}

      <div className="ev-toolbar">
        <div className="ev-search">
          <span className="ev-search__icon" aria-hidden>
            🔍
          </span>
          <input
            type="search"
            value={filters.q}
            onChange={(e) => patch({ q: e.target.value })}
            placeholder="행사명·장소 검색"
            aria-label="행사명·장소 검색"
            enterKeyHint="search"
            maxLength={100}
          />
        </div>
        <button
          type="button"
          className={`btn btn--secondary ev-filter-toggle${panelOpen ? ' is-open' : ''}`}
          aria-expanded={panelOpen}
          aria-controls={PANEL_ID}
          onClick={() => setPanel(!panelOpen)}
        >
          필터
          {count > 0 && (
            <span className="ev-count" aria-label={`${count}개 적용 중`}>
              {count}
            </span>
          )}
          <span className="ev-chevron" aria-hidden>
            ▾
          </span>
        </button>
      </div>

      {!panelOpen && summary.length > 0 && (
        <div className="ev-summary ev-only-mobile">
          <span className="ev-summary__text">
            <span className="faint">적용 중 </span>
            {summary.join(' · ')}
          </span>
          <button type="button" className="btn btn--ghost btn--sm ev-tap" onClick={reset}>
            초기화
          </button>
        </div>
      )}

      <EventFilterPanel
        id={PANEL_ID}
        open={panelOpen}
        filters={filters}
        onChange={patch}
        onReset={reset}
        onClose={() => setPanel(false)}
        events={events}
        trip={trip}
        resultCount={items.length}
      />

      <div className="ev-resultbar">
        <p role="status">
          <strong>{items.length}</strong>개 행사
          {items.length !== events.length && <span className="muted"> · 전체 {events.length}개</span>}
        </p>
        {hiddenEnded > 0 && (
          <button type="button" className="btn btn--ghost btn--sm ev-tap" onClick={() => patch({ hideEnded: false })}>
            종료 {hiddenEnded}개 숨김 · 보기
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="조건에 맞는 행사가 없어요"
          description={
            hiddenEnded > 0
              ? `조건에 맞는 종료된 행사 ${hiddenEnded}개는 숨겨져 있어요.`
              : '선택한 작품·지역·날짜를 줄이거나 필터를 초기화해 보세요.'
          }
          action={
            <>
              {!isDefault && (
                <Button variant="primary" onClick={reset}>
                  필터 초기화
                </Button>
              )}
              {hiddenEnded > 0 && <Button onClick={() => patch({ hideEnded: false })}>종료된 행사 보기</Button>}
            </>
          }
        />
      ) : (
        <>
          <ul className="ev-list">
            {items.map(({ event }) => (
              <EventCard key={event.id} event={event} scheduled={scheduledIds.has(event.id)} onOpen={rememberScroll} />
            ))}
          </ul>
          <p className="faint small ev-sortnote">진행 중·진행 예정 행사를 시작일 순으로 먼저, 기간 확인이 필요한 행사와 종료된 행사를 뒤에 보여 줘요.</p>
        </>
      )}
    </div>
  )
}
