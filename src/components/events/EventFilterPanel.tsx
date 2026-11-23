import type { CSSProperties } from 'react'
import type { EventItem, EventType, Trip, WorkId } from '../../types'
import { EVENT_TYPES, WORKS } from '../../constants'
import { formatDateShort } from '../../lib/date'
import { Button, Chip, Field } from '../ui'
import {
  CITY_UNKNOWN_LABEL,
  COUNTRY_UNKNOWN_LABEL,
  decodeRegion,
  encodeRegion,
  hasInvalidRange,
  isDefaultFilters,
  regionGroups,
  type EventFilters,
} from './eventFilters'

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v]
}

export function EventFilterPanel({
  id,
  open,
  filters,
  onChange,
  onReset,
  onClose,
  events,
  trip,
  resultCount,
}: {
  id: string
  /** 모바일에서 펼쳐져 있는지 (데스크톱은 항상 펼침) */
  open: boolean
  filters: EventFilters
  onChange: (patch: Partial<EventFilters>) => void
  onReset: () => void
  onClose: () => void
  events: EventItem[]
  trip: Trip | undefined
  resultCount: number
}) {
  const f = filters
  const groups = regionGroups(events)
  const regionValue = encodeRegion(f.country, f.city)
  const regionKnown =
    f.country === null ||
    groups.some((g) => g.country === f.country && (f.city === null || g.cities.some((c) => c.city === f.city)))
  const tripActive = !!trip && f.from === trip.startDate && f.to === trip.endDate
  const invalidRange = hasInvalidRange(f)

  return (
    <section id={id} className={`card ev-filters${open ? ' is-open' : ''}`} aria-label="행사 필터">
      <fieldset className="ev-fset">
        <legend className="ev-fset__legend">
          작품 {f.works.length > 0 && <span className="ev-fset__n">{f.works.length}개 선택</span>}
        </legend>
        <div className="chips">
          {WORKS.map((w) => (
            <Chip key={w.id} color={w.color} active={f.works.includes(w.id)} onClick={() => onChange({ works: toggle<WorkId>(f.works, w.id) })}>
              <span className="ev-dot" style={{ '--dot-color': w.color } as CSSProperties} aria-hidden />
              {w.name}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset className="ev-fset">
        <legend className="ev-fset__legend">
          행사 유형 {f.types.length > 0 && <span className="ev-fset__n">{f.types.length}개 선택</span>}
        </legend>
        <div className="chips">
          {EVENT_TYPES.map((t) => (
            <Chip key={t.id} active={f.types.includes(t.id)} onClick={() => onChange({ types: toggle<EventType>(f.types, t.id) })}>
              <span aria-hidden>{t.icon}</span>
              {t.label}
            </Chip>
          ))}
        </div>
      </fieldset>

      <div className="ev-filters__grid">
        <Field label="지역">
          {(fid) => (
            <select
              id={fid}
              value={regionValue}
              onChange={(e) => {
                const { country, city } = decodeRegion(e.target.value)
                onChange({ country, city })
              }}
            >
              <option value="">전체 지역</option>
              {!regionKnown && (
                <option value={regionValue}>
                  {f.city ?? f.country} (해당 행사 없음)
                </option>
              )}
              {groups.map((g) => {
                const cLabel = g.country || COUNTRY_UNKNOWN_LABEL
                return (
                  <optgroup key={g.country} label={cLabel}>
                    <option value={encodeRegion(g.country, null)}>
                      {cLabel} 전체 ({g.count})
                    </option>
                    {g.cities.map((c) => (
                      <option key={c.city} value={encodeRegion(g.country, c.city)}>
                        {c.city || CITY_UNKNOWN_LABEL} ({c.count})
                      </option>
                    ))}
                  </optgroup>
                )
              })}
            </select>
          )}
        </Field>

        <fieldset className="ev-fset">
          <legend className="ev-fset__legend">날짜 (행사 기간과 겹치는 행사)</legend>
          <div className="ev-daterange">
            <label className="ev-daterange__item">
              <span className="ev-daterange__k">부터</span>
              <input
                type="date"
                value={f.from}
                max={f.to || undefined}
                aria-invalid={invalidRange || undefined}
                onChange={(e) => onChange({ from: e.target.value })}
              />
            </label>
            <label className="ev-daterange__item">
              <span className="ev-daterange__k">까지</span>
              <input
                type="date"
                value={f.to}
                min={f.from || undefined}
                aria-invalid={invalidRange || undefined}
                onChange={(e) => onChange({ to: e.target.value })}
              />
            </label>
          </div>
          {invalidRange && (
            <p className="field__error" role="alert">
              시작 날짜가 끝 날짜보다 늦어요. 날짜를 고치기 전까지 날짜 조건은 적용하지 않아요.
            </p>
          )}
          <div className="ev-daterange__quick">
            {trip ? (
              <Chip
                active={tripActive}
                onClick={() => onChange(tripActive ? { from: '', to: '' } : { from: trip.startDate, to: trip.endDate })}
              >
                <span aria-hidden>🧳</span>
                <span className="ev-chip-text">
                  내 여행 기간 · {trip.name} ({formatDateShort(trip.startDate)}~{formatDateShort(trip.endDate)})
                </span>
              </Chip>
            ) : (
              <span className="faint small">여행을 만들면 ‘내 여행 기간’으로 바로 고를 수 있어요.</span>
            )}
            {(f.from || f.to) && (
              <button type="button" className="btn btn--ghost btn--sm ev-tap" onClick={() => onChange({ from: '', to: '' })}>
                날짜 지우기
              </button>
            )}
          </div>
          <p className="field__hint">기간이 확인되지 않은 행사는 날짜 조건과 상관없이 함께 보여요.</p>
        </fieldset>
      </div>

      <label className="ev-switch">
        <input type="checkbox" checked={f.hideEnded} onChange={(e) => onChange({ hideEnded: e.target.checked })} />
        <span>종료된 행사 숨기기</span>
      </label>

      <div className="ev-filters__foot">
        <Button variant="ghost" onClick={onReset} disabled={isDefaultFilters(f)}>
          필터 초기화
        </Button>
        <Button variant="primary" className="ev-only-mobile" onClick={onClose}>
          결과 {resultCount}개 보기
        </Button>
      </div>
    </section>
  )
}
