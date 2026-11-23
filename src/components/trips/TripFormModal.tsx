import { useId, useMemo, useRef, useState, type FormEvent } from 'react'
import type { Trip, TripInput } from '../../types'
import { COUNTRY_DEFAULT_TZ, REGION_SUGGESTIONS, TIMEZONES } from '../../constants'
import { daysBetween, isValidDate, isValidTimezone } from '../../lib/date'
import { useStore } from '../../store/AppStore'
import { Button, Field, Modal, Notice, useToast } from '../ui'
import { MAX_TRIP_DAYS, tripLengthLabel } from './tripFormat'

interface FormState {
  name: string
  city: string
  startDate: string
  endDate: string
  timezone: string
  accName: string
  accAddress: string
  accMemo: string
}

type FieldKey = 'name' | 'startDate' | 'endDate' | 'timezone'
type Errors = Partial<Record<FieldKey, string>>

const ALL_CITIES = Array.from(new Set(Object.values(REGION_SUGGESTIONS).flat()))

function toForm(t?: Trip): FormState {
  return {
    name: t?.name ?? '',
    city: t?.city ?? '',
    startDate: t?.startDate ?? '',
    endDate: t?.endDate ?? '',
    timezone: t?.timezone ?? 'Asia/Tokyo',
    accName: t?.accommodation.name ?? '',
    accAddress: t?.accommodation.address ?? '',
    accMemo: t?.accommodation.memo ?? '',
  }
}

function validate(f: FormState, original?: Trip): Errors {
  const e: Errors = {}
  if (!f.name.trim()) e.name = '여행 이름을 입력해 주세요.'
  if (!f.startDate) e.startDate = '시작일을 선택해 주세요.'
  else if (!isValidDate(f.startDate)) e.startDate = '시작일 형식이 올바르지 않아요.'
  if (!f.endDate) e.endDate = '종료일을 선택해 주세요.'
  else if (!isValidDate(f.endDate)) e.endDate = '종료일 형식이 올바르지 않아요.'
  else if (isValidDate(f.startDate)) {
    if (f.endDate < f.startDate) e.endDate = '종료일은 시작일과 같거나 그 뒤여야 해요.'
    else if (
      daysBetween(f.startDate, f.endDate) + 1 > MAX_TRIP_DAYS &&
      // 불러온 데이터처럼 이미 긴 여행은 날짜를 바꾸지 않으면 그대로 저장할 수 있게 둔다
      !(original && original.startDate === f.startDate && original.endDate === f.endDate)
    ) {
      e.endDate = `여행 기간은 최대 ${MAX_TRIP_DAYS}일까지 설정할 수 있어요.`
    }
  }
  if (!isValidTimezone(f.timezone)) e.timezone = '시간대를 선택해 주세요.'
  return e
}

/** 여행 만들기 / 여행 정보 수정 */
export function TripFormModal({
  trip,
  onClose,
  onCreated,
}: {
  /** 있으면 수정 모드 */
  trip?: Trip
  onClose: () => void
  onCreated?: (t: Trip) => void
}) {
  const store = useStore()
  const toast = useToast()
  const formId = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const [f, setF] = useState<FormState>(() => toForm(trip))
  const [submitted, setSubmitted] = useState(false)
  const [tzTouched, setTzTouched] = useState(!!trip)

  const errors = useMemo(() => validate(f, trip), [f, trip])
  const shown: Errors = submitted ? errors : {}

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((cur) => ({ ...cur, [k]: v }))

  const onCity = (city: string) => {
    setF((cur) => {
      const next = { ...cur, city }
      if (!tzTouched) {
        const country = Object.keys(REGION_SUGGESTIONS).find((c) => REGION_SUGGESTIONS[c].includes(city.trim()))
        const tz = country ? COUNTRY_DEFAULT_TZ[country] : undefined
        if (tz) next.timezone = tz
      }
      return next
    })
  }

  const tzOptions = TIMEZONES.some((t) => t.id === f.timezone) || !f.timezone
    ? TIMEZONES
    : [...TIMEZONES, { id: f.timezone, label: f.timezone }]

  const datesOk = !errors.startDate && !errors.endDate
  const outsideCount =
    trip && datesOk ? trip.items.filter((i) => i.date < f.startDate || i.date > f.endDate).length : 0
  const tzChanged = !!trip && trip.timezone !== f.timezone && trip.items.some((i) => i.time)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (Object.keys(errors).length) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    const input: TripInput = {
      name: f.name.trim(),
      city: f.city.trim(),
      startDate: f.startDate,
      endDate: f.endDate,
      timezone: f.timezone,
      accommodation: { name: f.accName.trim(), address: f.accAddress.trim(), memo: f.accMemo.trim() },
    }
    if (trip) {
      store.updateTrip(trip.id, input)
      toast('저장했어요')
      onClose()
    } else {
      const created = store.createTrip(input)
      toast('저장했어요')
      onClose()
      onCreated?.(created)
    }
  }

  return (
    <Modal
      open
      title={trip ? '여행 정보 수정' : '새 여행 만들기'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button type="submit" form={formId} variant="primary">
            저장
          </Button>
        </>
      }
    >
      <form id={formId} ref={formRef} className="tp-form" noValidate onSubmit={submit}>
        <Field label="여행 이름" required error={shown.name}>
          {(id, d) => (
            <input
              id={id}
              type="text"
              value={f.name}
              maxLength={40}
              placeholder="예: 겨울 도쿄 덕질 여행"
              aria-invalid={!!shown.name}
              aria-describedby={d}
              onChange={(e) => set('name', e.target.value)}
            />
          )}
        </Field>

        <Field label="도시" hint="목록에 없으면 직접 입력하세요.">
          {(id, d) => (
            <>
              <input
                id={id}
                type="text"
                value={f.city}
                maxLength={40}
                list={`${formId}-cities`}
                placeholder="예: 도쿄"
                aria-describedby={d}
                onChange={(e) => onCity(e.target.value)}
              />
              <datalist id={`${formId}-cities`}>
                {ALL_CITIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </>
          )}
        </Field>

        <div className="grid-2">
          <Field label="시작일" required error={shown.startDate}>
            {(id, d) => (
              <input
                id={id}
                type="date"
                value={f.startDate}
                aria-invalid={!!shown.startDate}
                aria-describedby={d}
                onChange={(e) => set('startDate', e.target.value)}
              />
            )}
          </Field>
          <Field label="종료일" required error={shown.endDate}>
            {(id, d) => (
              <input
                id={id}
                type="date"
                value={f.endDate}
                min={isValidDate(f.startDate) ? f.startDate : undefined}
                aria-invalid={!!shown.endDate}
                aria-describedby={d}
                onChange={(e) => set('endDate', e.target.value)}
              />
            )}
          </Field>
        </div>
        {datesOk && (
          <p className="tp-form__length muted small" aria-live="polite">
            {tripLengthLabel(f.startDate, f.endDate)} · 최대 {MAX_TRIP_DAYS}일
          </p>
        )}

        <Field label="시간대" required error={shown.timezone} hint="일정의 방문 시각은 이 시간대 기준으로 적어요.">
          {(id, d) => (
            <select
              id={id}
              value={f.timezone}
              aria-invalid={!!shown.timezone}
              aria-describedby={d}
              onChange={(e) => {
                setTzTouched(true)
                set('timezone', e.target.value)
              }}
            >
              {tzOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          )}
        </Field>

        <fieldset className="tp-fieldset">
          <legend>숙소 (선택)</legend>
          <Field label="숙소 이름">
            {(id) => (
              <input
                id={id}
                type="text"
                value={f.accName}
                maxLength={80}
                placeholder="예: 아사쿠사바시 ○○ 호텔"
                onChange={(e) => set('accName', e.target.value)}
              />
            )}
          </Field>
          <Field label="숙소 주소">
            {(id) => (
              <input
                id={id}
                type="text"
                value={f.accAddress}
                maxLength={200}
                onChange={(e) => set('accAddress', e.target.value)}
              />
            )}
          </Field>
          <Field label="숙소 메모">
            {(id) => (
              <textarea
                id={id}
                rows={2}
                value={f.accMemo}
                maxLength={500}
                placeholder="예: 체크인 15시, 짐 맡기기 가능"
                onChange={(e) => set('accMemo', e.target.value)}
              />
            )}
          </Field>
        </fieldset>

        {outsideCount > 0 && (
          <Notice tone="warning">
            일정 {outsideCount}개가 새 여행 기간 밖이 돼요. 저장 후 ‘여행 기간 밖 일정’에서 날짜를 바꾸거나 삭제할 수 있어요.
          </Notice>
        )}
        {tzChanged && (
          <Notice tone="info">시간대를 바꿔도 이미 입력한 방문 시각은 바뀌지 않아요. 필요하면 일정별로 고쳐 주세요.</Notice>
        )}
        {submitted && Object.keys(errors).length > 0 && (
          <p className="field__error">입력 내용을 확인해 주세요.</p>
        )}
      </form>
    </Modal>
  )
}
