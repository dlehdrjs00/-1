import { useId, useMemo, useRef, useState, type FormEvent } from 'react'
import type { DateOnly, ItineraryItem, Trip } from '../../types'
import { formatDate, formatDateRange, formatDateShort, isValidTime, timezoneLabel } from '../../lib/date'
import { getAddWarnings, isDateInEventPeriod, tripDates, hasDuplicateEvent } from '../../lib/trip'
import { useStore } from '../../store/AppStore'
import { Button, Field, Modal, Notice, SampleBadge, useToast } from '../ui'

/**
 * 일정 수정 (item 있음) 또는 장소 직접 추가 (item 없음, defaultDate 사용).
 */
export function ItemFormModal({
  trip,
  item,
  defaultDate,
  onClose,
}: {
  trip: Trip
  item?: ItineraryItem
  defaultDate?: DateOnly
  onClose: () => void
}) {
  const store = useStore()
  const toast = useToast()
  const formId = useId()
  const formRef = useRef<HTMLFormElement>(null)

  const kind = item?.kind ?? 'place'
  const event = item?.kind === 'event' && item.eventId ? store.getEvent(item.eventId) : undefined

  const [date, setDate] = useState<DateOnly>(item?.date ?? defaultDate ?? trip.startDate)
  const [time, setTime] = useState(item?.time ?? '')
  const [memo, setMemo] = useState(item?.memo ?? '')
  const [placeName, setPlaceName] = useState(item?.placeName ?? '')
  const [placeAddress, setPlaceAddress] = useState(item?.placeAddress ?? '')
  const [submitted, setSubmitted] = useState(false)

  const dates = tripDates(trip)
  // 여행 기간 밖 일정을 고칠 때는 현재 날짜도 선택지에 남겨 둔다
  const dateOptions = item && !dates.includes(item.date) ? [item.date, ...dates] : dates

  const errors = useMemo(() => {
    const e: { placeName?: string; time?: string; date?: string } = {}
    if (kind === 'place' && !placeName.trim()) e.placeName = '장소명을 입력해 주세요.'
    if (time && !isValidTime(time)) e.time = '방문 시각 형식이 올바르지 않아요.'
    if (!date) e.date = '날짜를 선택해 주세요.'
    return e
  }, [kind, placeName, time, date])
  const shown = submitted ? errors : {}

  const warnings = useMemo(() => getAddWarnings(trip, date, event, item?.id), [trip, date, event, item?.id])
  const dup = warnings.some((w) => w.kind === 'duplicate')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (Object.keys(errors).length) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    const base = { date, time: time || null, memo: memo.trim() }
    if (item) {
      store.updateItineraryItem(
        trip.id,
        item.id,
        kind === 'place' ? { ...base, placeName: placeName.trim(), placeAddress: placeAddress.trim() } : base,
      )
      toast('저장했어요')
    } else {
      store.addItineraryItem(trip.id, {
        ...base,
        kind: 'place',
        eventId: null,
        placeName: placeName.trim(),
        placeAddress: placeAddress.trim(),
      })
      toast(`${formatDateShort(date)} 일정에 추가했어요.`)
    }
    onClose()
  }

  const dayNo = (d: DateOnly) => dates.indexOf(d) + 1

  return (
    <Modal
      open
      title={item ? '일정 수정' : '장소 직접 추가'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button type="submit" form={formId} variant="primary">
            {item ? (dup ? '그래도 저장' : '저장') : '일정에 추가'}
          </Button>
        </>
      }
    >
      <form id={formId} ref={formRef} className="tp-form" noValidate onSubmit={submit}>
        {item?.kind === 'event' && (
          <div className="tp-form__event">
            <p className="dialog-event-title">
              {event ? event.title : '삭제된 행사'} {event?.isSample && <SampleBadge />}
            </p>
            {event && <p className="muted small">행사 기간: {formatDateRange(event.startDate, event.endDate)}</p>}
          </div>
        )}

        {kind === 'place' && (
          <>
            <Field label="장소명" required error={shown.placeName}>
              {(id, d) => (
                <input
                  id={id}
                  type="text"
                  value={placeName}
                  maxLength={80}
                  placeholder="예: 아키하바라 굿즈숍 거리"
                  aria-invalid={!!shown.placeName}
                  aria-describedby={d}
                  onChange={(e) => setPlaceName(e.target.value)}
                />
              )}
            </Field>
            <Field label="주소 (선택)">
              {(id) => (
                <input
                  id={id}
                  type="text"
                  value={placeAddress}
                  maxLength={200}
                  onChange={(e) => setPlaceAddress(e.target.value)}
                />
              )}
            </Field>
          </>
        )}

        <Field label="날짜" required error={shown.date}>
          {(id, d) => (
            <select id={id} value={date} aria-describedby={d} onChange={(e) => setDate(e.target.value)}>
              {dateOptions.map((d) => {
                const no = dayNo(d)
                let suffix = ''
                if (event) {
                  if (isDateInEventPeriod(event, d) === false) suffix += ' · 행사 기간 밖'
                  if (hasDuplicateEvent(trip, d, event.id, item?.id)) suffix += ' · 이미 있음'
                }
                return (
                  <option key={d} value={d}>
                    {no > 0 ? `${no}일차 · ${formatDateShort(d)}` : `${formatDate(d)} (여행 기간 밖)`}
                    {suffix}
                  </option>
                )
              })}
            </select>
          )}
        </Field>

        {warnings.length > 0 && (
          <Notice tone="warning">
            <ul className="plain-list">
              {warnings.map((w) => (
                <li key={w.kind}>{w.message}</li>
              ))}
            </ul>
          </Notice>
        )}

        <Field label="방문 시각 (선택)" error={shown.time} hint={`${timezoneLabel(trip.timezone)} 기준 · 비워 두면 ‘시간 미정’`}>
          {(id, d) => (
            <div className="tp-time-input">
              <input
                id={id}
                type="time"
                value={time}
                aria-invalid={!!shown.time}
                aria-describedby={d}
                onChange={(e) => setTime(e.target.value)}
              />
              {time && (
                <Button variant="ghost" onClick={() => setTime('')}>
                  시간 지우기
                </Button>
              )}
            </div>
          )}
        </Field>

        <Field label="메모 (선택)">
          {(id) => (
            <textarea
              id={id}
              rows={2}
              value={memo}
              maxLength={500}
              placeholder="예: 입장 특전 확인, 오픈 30분 전 도착"
              onChange={(e) => setMemo(e.target.value)}
            />
          )}
        </Field>
      </form>
    </Modal>
  )
}
