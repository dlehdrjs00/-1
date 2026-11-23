import { useId, useMemo, useState, type FormEvent } from 'react'
import type { DateOnly, EventItem, Trip } from '../../types'
import { WORK_MAP } from '../../constants'
import { formatDateRange, formatDateShort, isValidTime, timezoneLabel } from '../../lib/date'
import { getAddWarnings, hasDuplicateEvent, isDateInEventPeriod } from '../../lib/trip'
import { isPermanentShop } from '../../lib/status'
import { SAVE_FAILED_MESSAGE, useStore } from '../../store/AppStore'
import { StatusBadges, WorkTags } from '../EventBits'
import { Badge, Button, Chip, EmptyState, Field, Modal, Notice, SampleBadge, useToast } from '../ui'
import { normalize } from './tripFormat'

type Scope = 'fav' | 'all'

function searchText(e: EventItem): string {
  return normalize(
    [e.title, e.venue, e.city, e.address, e.country, ...e.works.map((w) => `${WORK_MAP[w]?.name ?? ''}${WORK_MAP[w]?.short ?? ''}`)].join(
      ' ',
    ),
  )
}

/** 기간 안 → 기간 확인 필요 → 기간 밖 순으로 정렬할 때 쓰는 순위 */
function periodRank(e: EventItem, date: DateOnly): number {
  const p = isDateInEventPeriod(e, date)
  return p === true ? 0 : p === 'unknown' ? 1 : 2
}

/**
 * 특정 날짜에 관심 행사(또는 전체 행사)를 추가하는 대화상자.
 * 1단계: 행사 고르기 (날짜 기준 경고 표시) → 2단계: 시각·메모 입력 후 추가.
 */
export function AddEventModal({ trip, date, dayNo, onClose }: { trip: Trip; date: DateOnly; dayNo: number; onClose: () => void }) {
  const store = useStore()
  const toast = useToast()
  const formId = useId()
  const favCount = store.data.favorites.length

  const [scope, setScope] = useState<Scope>(favCount > 0 ? 'fav' : 'all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [time, setTime] = useState('')
  const [memo, setMemo] = useState('')
  const [timeError, setTimeError] = useState<string | null>(null)

  const list = useMemo(() => {
    const base =
      scope === 'fav'
        ? store.data.favorites.map((id) => store.data.events.find((e) => e.id === id)).filter((e): e is EventItem => !!e)
        : store.data.events
    const q = normalize(query)
    const filtered = q ? base.filter((e) => searchText(e).includes(q)) : base
    return filtered
      .map((e, i) => ({ e, i, rank: periodRank(e, date) }))
      .sort((a, b) => a.rank - b.rank || a.i - b.i)
      .map((x) => x.e)
  }, [scope, query, store.data.favorites, store.data.events, date])

  const selected = selectedId ? store.getEvent(selectedId) : undefined
  const warnings = useMemo(() => (selected ? getAddWarnings(trip, date, selected) : []), [trip, date, selected])
  const dup = warnings.some((w) => w.kind === 'duplicate')

  const title = `${dayNo}일차 · ${formatDateShort(date)}에 행사 추가`

  const submit = (ev: FormEvent) => {
    ev.preventDefault()
    if (!selected) return
    if (time && !isValidTime(time)) return setTimeError('방문 시각 형식이 올바르지 않아요.')
    const added = store.addItineraryItem(trip.id, {
      date,
      kind: 'event',
      eventId: selected.id,
      placeName: '',
      placeAddress: '',
      time: time || null,
      memo: memo.trim(),
    })
    // 저장 실패: 추가되지 않았다 → 대화상자·선택·입력값을 그대로 둔다
    if (!added) return toast(SAVE_FAILED_MESSAGE, 'error')
    toast(`${formatDateShort(date)} 일정에 추가했어요.`)
    onClose()
  }

  /* ---------- 2단계: 선택한 행사 확인 ---------- */
  if (selected) {
    return (
      <Modal
        key="confirm"
        open
        title={title}
        onClose={onClose}
        footer={
          <>
            <Button
              onClick={() => {
                setSelectedId(null)
                setTimeError(null)
              }}
            >
              다른 행사 고르기
            </Button>
            <Button type="submit" form={formId} variant="primary">
              {dup ? '그래도 추가' : '일정에 추가'}
            </Button>
          </>
        }
      >
        <form id={formId} className="tp-form" noValidate onSubmit={submit}>
          <div className="tp-form__event">
            <p className="dialog-event-title">
              {selected.title} {selected.isSample && <SampleBadge />}
            </p>
            <WorkTags works={selected.works} />
            <p className="muted small">행사 기간: {formatDateRange(selected.startDate, selected.endDate)}</p>
            <StatusBadges event={selected} />
          </div>

          {warnings.length > 0 ? (
            <Notice tone="warning" title={dup ? '이미 이 날짜에 있는 행사예요' : undefined}>
              <ul className="plain-list">
                {warnings.map((w) => (
                  <li key={w.kind}>{w.message}</li>
                ))}
              </ul>
              {dup && <p>그래도 추가하려면 ‘그래도 추가’를 눌러 주세요.</p>}
            </Notice>
          ) : (
            <Notice tone="success">선택한 날짜는 행사 기간 안이에요.</Notice>
          )}

          <Field label="방문 시각 (선택)" error={timeError} hint={`${timezoneLabel(trip.timezone)} 기준`}>
            {(id, d) => (
              <input
                id={id}
                type="time"
                value={time}
                aria-invalid={!!timeError}
                aria-describedby={d}
                onChange={(e) => {
                  setTime(e.target.value)
                  setTimeError(null)
                }}
              />
            )}
          </Field>
          <Field label="메모 (선택)">
            {(id) => (
              <textarea
                id={id}
                rows={2}
                value={memo}
                maxLength={500}
                placeholder="예: 입장 특전 확인"
                onChange={(e) => setMemo(e.target.value)}
              />
            )}
          </Field>
        </form>
      </Modal>
    )
  }

  /* ---------- 1단계: 행사 고르기 ---------- */
  return (
    <Modal
      key="pick"
      open
      title={title}
      onClose={onClose}
      footer={<Button onClick={onClose}>닫기</Button>}
    >
      <div className="chips" role="group" aria-label="행사 범위">
        <Chip active={scope === 'fav'} onClick={() => setScope('fav')}>
          관심 행사 {favCount}
        </Chip>
        <Chip active={scope === 'all'} onClick={() => setScope('all')}>
          전체 행사 {store.data.events.length}
        </Chip>
      </div>
      <Field label="검색">
        {(id) => (
          <input
            id={id}
            type="search"
            value={query}
            placeholder="행사명, 장소, 작품으로 검색"
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
      </Field>

      {list.length === 0 ? (
        scope === 'fav' && favCount === 0 ? (
          <EmptyState
            icon="☆"
            title="관심 행사가 없어요"
            description="전체 행사에서 골라 추가할 수 있어요."
            action={
              <Button variant="primary" onClick={() => setScope('all')}>
                전체 행사 보기
              </Button>
            }
          />
        ) : (
          <EmptyState icon="🔍" title="조건에 맞는 행사가 없어요" description="검색어를 바꾸거나 범위를 바꿔 보세요." />
        )
      ) : (
        <ul className="tp-pick-list" aria-label="추가할 행사 목록">
          {list.map((e) => {
            const p = isDateInEventPeriod(e, date)
            const isDup = hasDuplicateEvent(trip, date, e.id)
            return (
              <li key={e.id}>
                <button type="button" className="tp-pick" onClick={() => setSelectedId(e.id)}>
                  <span className="tp-pick__title">
                    {e.title} {e.isSample && <SampleBadge />}
                  </span>
                  <WorkTags works={e.works} />
                  <span className="tp-pick__meta">
                    {isPermanentShop(e) ? '상설 (기간 없음)' : formatDateRange(e.startDate, e.endDate)}
                    {' · '}
                    {e.venue.trim() ? e.venue : <span className="unknown">장소 확인 필요</span>}
                  </span>
                  <span className="tp-pick__badges">
                    {p === true && (isPermanentShop(e) ? <Badge tone="accent">상설</Badge> : <Badge tone="success">이 날짜 진행</Badge>)}
                    {p === 'unknown' && <Badge tone="warning">기간 확인 필요</Badge>}
                    {p === false && <Badge tone="danger">행사 기간 밖</Badge>}
                    {isDup && <Badge tone="warning">이미 추가됨 · 중복</Badge>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}
