import { useEffect, useMemo, useState } from 'react'
import type { EventItem } from '../types'
import { useStore } from '../store/AppStore'
import { formatDateRange, formatDateShort, isValidTime, timezoneLabel } from '../lib/date'
import { getAddWarnings, tripDates, tripDatesWithinEvent } from '../lib/trip'
import { navigate } from '../router'
import { Button, Field, Modal, Notice, useToast } from './ui'

/**
 * 행사를 여행 일정에 추가하는 공용 대화상자.
 * 행사 상세 · 관심 행사 화면에서 사용한다.
 */
export function AddToTripDialog({ event, open, onClose }: { event: EventItem; open: boolean; onClose: () => void }) {
  const store = useStore()
  const toast = useToast()
  const trips = store.data.trips

  const [tripId, setTripId] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [memo, setMemo] = useState('')
  const [error, setError] = useState<string | null>(null)

  const trip = trips.find((t) => t.id === tripId)

  // 열릴 때 기본값: 활성 여행, 행사 기간과 겹치는 첫 날짜
  useEffect(() => {
    if (!open) return
    const t = store.activeTrip ?? trips[0]
    setTripId(t?.id ?? '')
    setTime('')
    setMemo('')
    setError(null)
    if (t) {
      const within = tripDatesWithinEvent(t, event)
      setDate(within[0] ?? t.startDate)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!trip) return
    const dates = tripDates(trip)
    if (!dates.includes(date)) {
      const within = tripDatesWithinEvent(trip, event)
      setDate(within[0] ?? trip.startDate)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId])

  const warnings = useMemo(() => (trip && date ? getAddWarnings(trip, date, event) : []), [trip, date, event])

  if (!open) return null

  if (!trips.length) {
    return (
      <Modal open={open} title="여행에 추가" onClose={onClose}>
        <Notice tone="info">아직 만든 여행이 없습니다. 먼저 여행을 만들어 주세요.</Notice>
        <div className="modal__inline-actions">
          <Button
            variant="primary"
            onClick={() => {
              onClose()
              navigate('/trips')
            }}
          >
            여행 만들러 가기
          </Button>
        </div>
      </Modal>
    )
  }

  const submit = () => {
    if (!trip) return setError('여행을 선택하세요.')
    if (!date) return setError('날짜를 선택하세요.')
    if (time && !isValidTime(time)) return setError('방문 시각 형식이 올바르지 않습니다.')
    store.addItineraryItem(trip.id, {
      date,
      kind: 'event',
      eventId: event.id,
      placeName: '',
      placeAddress: '',
      time: time || null,
      memo: memo.trim(),
    })
    toast(`'${trip.name}' ${formatDateShort(date)} 일정에 추가했어요.`)
    onClose()
  }

  const dup = warnings.some((w) => w.kind === 'duplicate')

  return (
    <Modal
      open={open}
      title="여행에 추가"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={submit}>
            {dup ? '그래도 추가' : '일정에 추가'}
          </Button>
        </>
      }
    >
      <p className="dialog-event-title">{event.title}</p>
      <p className="muted small">행사 기간: {formatDateRange(event.startDate, event.endDate)}</p>

      <Field label="여행">
        {(id) => (
          <select id={id} value={tripId} onChange={(e) => setTripId(e.target.value)}>
            {trips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({formatDateShort(t.startDate)}~{formatDateShort(t.endDate)})
              </option>
            ))}
          </select>
        )}
      </Field>

      {trip && (
        <Field label="날짜" required>
          {(id) => (
            <select id={id} value={date} onChange={(e) => setDate(e.target.value)}>
              {tripDates(trip).map((d) => {
                const w = getAddWarnings(trip, d, event)
                const out = w.some((x) => x.kind === 'out_of_period')
                return (
                  <option key={d} value={d}>
                    {formatDateShort(d)}
                    {out ? ' · 행사 기간 밖' : ''}
                    {w.some((x) => x.kind === 'duplicate') ? ' · 이미 추가됨' : ''}
                  </option>
                )
              })}
            </select>
          )}
        </Field>
      )}

      {warnings.length > 0 && (
        <Notice tone="warning">
          <ul className="plain-list">
            {warnings.map((w) => (
              <li key={w.kind}>{w.message}</li>
            ))}
          </ul>
        </Notice>
      )}

      <Field label="방문 시각 (선택)" hint={trip ? `${timezoneLabel(trip.timezone)} 기준` : undefined}>
        {(id, d) => <input id={id} aria-describedby={d} type="time" value={time} onChange={(e) => setTime(e.target.value)} />}
      </Field>
      <Field label="메모 (선택)">
        {(id) => (
          <textarea id={id} rows={2} value={memo} maxLength={500} onChange={(e) => setMemo(e.target.value)} placeholder="예: 입장 특전 확인" />
        )}
      </Field>
      {error && <p className="field__error" role="alert">{error}</p>}
    </Modal>
  )
}
