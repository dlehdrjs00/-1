/* eslint-disable react-refresh/only-export-components -- 접기 상태 순수 함수는 단위 테스트를 위해 함께 내보낸다 */
import { useId, useState, type ReactNode } from 'react'
import type { Trip } from '../../types'
import { formatDate, timezoneLabel } from '../../lib/date'
import { itemsOutsideTrip } from '../../lib/trip'
import { useStore } from '../../store/AppStore'
import { Button } from '../ui'
import { itemWarnings, timezoneFullLabel, tripLengthLabel } from './tripFormat'

/* ---------------- 접기 상태 (화면 설정, 내보내기 데이터에는 들어가지 않음) ---------------- */

/** 여행별 '기본 정보 접기' 선택. JSON { [tripId]: true } — 접은 여행만 기록, 기본값은 펼침 */
export const SUMMARY_COLLAPSED_KEY = 'subcul-trip-planner:ui:trip-summary-collapsed'

export type CollapsedMap = Record<string, boolean>

/** 저장된 값을 읽는다. 손상됐거나 모양이 다르면 빈 값(모두 펼침) */
export function parseCollapsedMap(raw: string | null): CollapsedMap {
  if (!raw) return {}
  try {
    const v: unknown = JSON.parse(raw)
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
    const out: CollapsedMap = {}
    for (const [k, b] of Object.entries(v as Record<string, unknown>)) if (b === true) out[k] = true
    return out
  } catch {
    return {}
  }
}

/** 접기 선택을 바꾼 새 값. 펼침은 기본값이라 지우고, 없는 여행의 기록도 정리한다 */
export function setCollapsed(map: CollapsedMap, tripId: string, collapsed: boolean, existingTripIds?: readonly string[]): CollapsedMap {
  const out: CollapsedMap = {}
  for (const [k, b] of Object.entries(map)) {
    if (b && k !== tripId && (!existingTripIds || existingTripIds.includes(k))) out[k] = true
  }
  if (collapsed) out[tripId] = true
  return out
}

function readCollapsedMap(): CollapsedMap {
  try {
    return parseCollapsedMap(localStorage.getItem(SUMMARY_COLLAPSED_KEY))
  } catch {
    return {}
  }
}

function writeCollapsedMap(map: CollapsedMap) {
  try {
    if (Object.keys(map).length) localStorage.setItem(SUMMARY_COLLAPSED_KEY, JSON.stringify(map))
    else localStorage.removeItem(SUMMARY_COLLAPSED_KEY)
  } catch {
    /* 사생활 보호 모드 등: 이번 화면에서만 기억한다 */
  }
}

/* ---------------- 화면 ---------------- */

function orUnknown(v: string): ReactNode {
  return v.trim() ? v : <span className="unknown">확인 필요</span>
}

/**
 * 여행 머리 카드.
 * - 항상 보임: 여행 이름, 기간(N박 M일), 숙소 이름, 시간대 안내, '기본 정보 접기/펼치기'
 * - 접으면 숨김: 도시, 시간대, 숙소 주소·메모, 일정 개수, 여행 정보 수정/삭제
 */
export function TripSummary({ trip, onEdit, onDelete }: { trip: Trip; onEdit: () => void; onDelete: () => void }) {
  const store = useStore()
  const detailsId = useId()
  const [collapsedMap, setCollapsedMap] = useState<CollapsedMap>(readCollapsedMap)
  const collapsed = collapsedMap[trip.id] === true
  const toggle = () => {
    const next = setCollapsed(
      collapsedMap,
      trip.id,
      !collapsed,
      store.data.trips.map((t) => t.id),
    )
    setCollapsedMap(next)
    writeCollapsedMap(next)
  }

  const outside = itemsOutsideTrip(trip).length
  const warnCount = trip.items.reduce((n, i) => {
    const ev = i.kind === 'event' && i.eventId ? store.getEvent(i.eventId) : undefined
    return n + (itemWarnings(trip, i, ev).length > 0 ? 1 : 0)
  }, 0)
  const { accommodation: acc } = trip

  return (
    <section className={`card tp-summary${collapsed ? ' tp-summary--collapsed' : ''}`} aria-labelledby="tp-summary-title">
      <div className="tp-summary__head">
        {!collapsed && (
          <p className="tp-summary__eyebrow">
            <span aria-hidden>🧳</span> {trip.city.trim() || '도시 확인 필요'}
          </p>
        )}
        <div className="tp-summary__titlerow">
          <h2 id="tp-summary-title" className="tp-summary__title">
            {trip.name}
          </h2>
          <button
            type="button"
            className="tp-summary__toggle"
            aria-expanded={!collapsed}
            aria-controls={detailsId}
            onClick={toggle}
          >
            {/* 아주 좁은 화면에서는 '접기/펼치기'만 보이고, 접근 가능한 이름은 항상 '기본 정보 접기/펼치기' */}
            <span className="tp-summary__toggle-scope">기본 정보 </span>
            {collapsed ? '펼치기' : '접기'}
            <span className="tp-summary__chev" aria-hidden />
          </button>
        </div>
        <p className="tp-summary__period">
          <span>
            {formatDate(trip.startDate)} ~ {formatDate(trip.endDate)}
          </span>
          <span className="tp-summary__length">{tripLengthLabel(trip.startDate, trip.endDate)}</span>
        </p>
        <p className="tp-summary__acc">
          <span className="tp-summary__acc-label">숙소</span>
          <span className="tp-acc__name">{orUnknown(acc.name)}</span>
        </p>
      </div>

      <p className="tp-tz-note">
        <span aria-hidden>🕒</span> 일정의 시간은 {timezoneLabel(trip.timezone)} 기준이에요.
      </p>

      <div id={detailsId} className="tp-summary__details" hidden={collapsed}>
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

        <div className="tp-summary__actions">
          <Button onClick={onEdit}>여행 정보 수정</Button>
          <Button variant="danger" onClick={onDelete}>
            여행 삭제
          </Button>
        </div>
      </div>
    </section>
  )
}
