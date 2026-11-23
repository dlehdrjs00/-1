import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import type { EventItem, ReservationRequirement } from '../types'
import { COUNTRY_DEFAULT_TZ, EVENT_TYPES, REGION_SUGGESTIONS, TIMEZONES, WORKS } from '../constants'
import { timezoneLabel, todayLocal } from '../lib/date'
import {
  emptyEventForm,
  eventFormEquals,
  eventToForm,
  formToEventInput,
  hasErrors,
  orderedErrors,
  validateEventForm,
  type EventFormField,
  type EventFormValues,
} from '../lib/eventForm'
import { goBack, Link, navigate } from '../router'
import { useStore } from '../store/AppStore'
import { Button, Chip, EmptyState, Field, Notice, PageHeader, useConfirm, useToast } from '../components/ui'
import { FieldSet, FormSection } from '../components/manage/FormBits'
import { useDeleteEvent } from '../components/manage/useDeleteEvent'
import './manage.css'

const RESERVATION_OPTIONS: { id: ReservationRequirement; label: string }[] = [
  { id: 'required', label: '필수' },
  { id: 'not_required', label: '불필요' },
  { id: 'unknown', label: '확인 필요' },
]

const COUNTRIES = Object.keys(REGION_SUGGESTIONS)
const ALL_CITIES = Array.from(new Set(Object.values(REGION_SUGGESTIONS).flat()))

/** 행사 등록 (#/manage/new) / 수정 (#/manage/edit/:id) */
export default function EventFormPage({ id }: { id?: string }) {
  const store = useStore()
  if (id === undefined) return <EventForm key="new" />
  const existing = store.getEvent(id)
  if (!existing) {
    return (
      <div className="ef-page stack-lg">
        <PageHeader title="행사 수정" />
        <EmptyState
          icon="🔎"
          title="행사를 찾을 수 없어요"
          description="이미 삭제되었거나 주소가 잘못되었을 수 있어요."
          action={
            <Link to="/manage" className="btn btn--primary btn--md">
              정보 관리로 가기
            </Link>
          }
        />
      </div>
    )
  }
  // id 가 바뀌면 폼 상태를 새로 만든다
  return <EventForm key={id} existing={existing} />
}

function EventForm({ existing }: { existing?: EventItem }) {
  const store = useStore()
  const toast = useToast()
  const confirm = useConfirm()
  const deleteEvent = useDeleteEvent()
  const uid = useId()
  const formRef = useRef<HTMLFormElement>(null)

  const isEdit = existing !== undefined
  const [initial] = useState<EventFormValues>(() => (existing ? eventToForm(existing) : emptyEventForm()))
  const [values, setValues] = useState<EventFormValues>(initial)
  const [submitted, setSubmitted] = useState(false)
  const [focusReq, setFocusReq] = useState<{ field: EventFormField; n: number } | null>(null)
  // 사용자가 시간대를 직접 고른 경우 국가를 바꿔도 자동으로 바꾸지 않는다.
  // 수정 모드에서는 저장된 시간대가 국가 기본값과 다르면 '직접 고른 것'으로 본다.
  const [tzManual, setTzManual] = useState<boolean>(() => {
    if (!existing) return false
    const def = COUNTRY_DEFAULT_TZ[existing.country.trim()]
    return def !== undefined && def !== existing.timezone
  })

  const errors = useMemo(() => (submitted ? validateEventForm(values) : {}), [submitted, values])
  const errorList = orderedErrors(errors)
  const dirty = !eventFormEquals(values, initial)

  const set = <K extends EventFormField>(key: K, value: EventFormValues[K]) => setValues((prev) => ({ ...prev, [key]: value }))

  const setCountry = (country: string) =>
    setValues((prev) => {
      const tz = COUNTRY_DEFAULT_TZ[country.trim()]
      return { ...prev, country, timezone: !tzManual && tz ? tz : prev.timezone }
    })

  const toggleWork = (w: EventFormValues['works'][number]) =>
    setValues((prev) => ({ ...prev, works: prev.works.includes(w) ? prev.works.filter((x) => x !== w) : [...prev.works, w] }))

  // 저장하지 않은 변경이 있으면 새로고침/탭 닫기 전에 경고
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const focusField = useCallback((field: EventFormField) => {
    const wrap = formRef.current?.querySelector<HTMLElement>(`[data-field="${field}"]`)
    if (!wrap) return
    const target =
      wrap.querySelector<HTMLElement>('input[type="radio"]:checked') ??
      wrap.querySelector<HTMLElement>('input, select, textarea, button')
    wrap.scrollIntoView({ block: 'center' })
    target?.focus({ preventScroll: true })
  }, [])

  // 제출 실패 시 첫 번째 오류 항목으로 이동 (오류 표시가 렌더링된 뒤)
  useEffect(() => {
    if (focusReq) focusField(focusReq.field)
  }, [focusReq, focusField])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const errs = validateEventForm(values)
    if (hasErrors(errs)) {
      setSubmitted(true)
      setFocusReq((prev) => ({ field: orderedErrors(errs)[0].field, n: (prev?.n ?? 0) + 1 }))
      return
    }
    const input = formToEventInput(values, existing?.isSample ?? false)
    let savedId: string
    if (existing) {
      store.updateEvent(existing.id, input)
      savedId = existing.id
    } else {
      savedId = store.addEvent(input).id
    }
    toast('저장했어요')
    navigate(`/events/${encodeURIComponent(savedId)}`, { replace: true })
  }

  const onCancel = async () => {
    if (dirty) {
      const ok = await confirm({
        title: '저장하지 않고 나갈까요?',
        message: '입력한 내용은 저장되지 않아요.',
        confirmLabel: '나가기',
        danger: true,
      })
      if (!ok) return
    }
    goBack('/manage')
  }

  const onDelete = async () => {
    if (!existing) return
    if (await deleteEvent(existing)) navigate('/manage', { replace: true })
  }

  const err = (f: EventFormField) => errors[f] ?? null
  const inv = (f: EventFormField) => (errors[f] ? true : undefined)

  const countryKey = values.country.trim()
  const countryCities = REGION_SUGGESTIONS[countryKey]
  const citySuggestions = countryCities ?? ALL_CITIES
  const countryTz = COUNTRY_DEFAULT_TZ[countryKey]
  const tzOptions = TIMEZONES.some((t) => t.id === values.timezone)
    ? TIMEZONES
    : [...TIMEZONES, { id: values.timezone, label: values.timezone || '선택하세요' }]
  const tzName = timezoneLabel(values.timezone)
  const today = todayLocal()

  return (
    <div className="ef-page stack-lg">
      <PageHeader title={isEdit ? '행사 수정' : '행사 등록'} subtitle={isEdit ? existing.title : '가고 싶은 행사 정보를 직접 등록해요.'} />

      <p className="ef-hint">
        <span aria-hidden>💡</span>
        <span>
          모르는 정보는 비워 두세요. 화면에 '확인 필요'로 표시됩니다. <span className="ef-hint__req">* 표시는 필수 항목이에요.</span>
        </span>
      </p>

      {existing?.isSample && (
        <Notice tone="warning" title="샘플 행사를 수정하고 있어요">
          시연용 가상 데이터입니다. 수정해도 ‘샘플’ 표시는 그대로 유지되며, 정보 관리의 ‘샘플 모두 삭제’를 누르면 함께 삭제돼요.
        </Notice>
      )}

      {errorList.length > 0 && (
        <Notice tone="danger" title={`입력 내용을 확인해 주세요 (${errorList.length}개)`}>
          <ul className="ef-summary">
            {errorList.map((x) => (
              <li key={x.field}>
                <button type="button" className="link-btn ef-summary__link" onClick={() => focusField(x.field)}>
                  {x.label}
                </button>
                : {x.message}
              </li>
            ))}
          </ul>
        </Notice>
      )}

      <form ref={formRef} className="ef-form" noValidate onSubmit={onSubmit} aria-label={isEdit ? '행사 수정' : '행사 등록'}>
        {/* ---------- 기본 정보 ---------- */}
        <FormSection title="기본 정보">
          <div data-field="title">
            <Field label="행사명" required error={err('title')}>
              {(id, desc) => (
                <input
                  id={id}
                  type="text"
                  value={values.title}
                  onChange={(e) => set('title', e.target.value)}
                  aria-invalid={inv('title')}
                  aria-describedby={desc}
                  aria-required="true"
                  placeholder="예: 콜라보 카페 2기"
                  autoComplete="off"
                  enterKeyHint="next"
                />
              )}
            </Field>
          </div>

          <div data-field="works">
            <FieldSet
              legend="관련 작품"
              required
              error={err('works')}
              hint="여러 개 고를 수 있어요. 목록에 없으면 ‘기타’를 고르세요."
            >
              {() => (
                <div className="chips">
                  {WORKS.map((w) => (
                    <Chip key={w.id} active={values.works.includes(w.id)} color={w.color} onClick={() => toggleWork(w.id)}>
                      {w.name}
                    </Chip>
                  ))}
                </div>
              )}
            </FieldSet>
          </div>

          <div data-field="type">
            <FieldSet legend="행사 유형" required error={err('type')}>
              {() => (
                <div className="radio-group ef-radio-grid">
                  {EVENT_TYPES.map((t) => (
                    <label key={t.id}>
                      <input
                        type="radio"
                        name={`${uid}-type`}
                        value={t.id}
                        checked={values.type === t.id}
                        onChange={() => set('type', t.id)}
                      />
                      <span aria-hidden>{t.icon}</span>
                      <span>{t.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </FieldSet>
          </div>
        </FormSection>

        {/* ---------- 장소 ---------- */}
        <FormSection title="장소">
          <div className="grid-2">
            <div data-field="country">
              <Field label="국가" error={err('country')}>
                {(id, desc) => (
                  <>
                    <input
                      id={id}
                      type="text"
                      list={`${uid}-countries`}
                      value={values.country}
                      onChange={(e) => setCountry(e.target.value)}
                      aria-describedby={desc}
                      placeholder="예: 일본"
                      autoComplete="off"
                      enterKeyHint="next"
                    />
                    <datalist id={`${uid}-countries`}>
                      {COUNTRIES.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                    <div className="ef-suggest" role="group" aria-label="국가 빠른 선택">
                      {COUNTRIES.map((c) => (
                        <Chip key={c} active={countryKey === c} onClick={() => setCountry(countryKey === c ? '' : c)}>
                          {c}
                        </Chip>
                      ))}
                    </div>
                  </>
                )}
              </Field>
            </div>

            <div data-field="city">
              <Field label="도시" error={err('city')}>
                {(id, desc) => (
                  <>
                    <input
                      id={id}
                      type="text"
                      list={`${uid}-cities`}
                      value={values.city}
                      onChange={(e) => set('city', e.target.value)}
                      aria-describedby={desc}
                      placeholder={countryCities ? `예: ${countryCities[0]}` : '예: 도쿄'}
                      autoComplete="off"
                      enterKeyHint="next"
                    />
                    <datalist id={`${uid}-cities`}>
                      {citySuggestions.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                    {countryCities && (
                      <div className="ef-suggest" role="group" aria-label={`${countryKey} 도시 빠른 선택`}>
                        {countryCities.map((c) => (
                          <Chip key={c} active={values.city.trim() === c} onClick={() => set('city', values.city.trim() === c ? '' : c)}>
                            {c}
                          </Chip>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </Field>
            </div>
          </div>

          <div data-field="timezone">
            <Field
              label="시간대"
              required
              error={err('timezone')}
              hint={
                <>
                  예약 시각은 이 시간대(행사 현지 시간) 기준으로 입력해요.{' '}
                  {tzManual && countryTz && countryTz !== values.timezone ? (
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => {
                        setTzManual(false)
                        set('timezone', countryTz)
                      }}
                    >
                      {countryKey} 기본 시간대로 맞추기
                    </button>
                  ) : (
                    !tzManual && '국가를 고르면 자동으로 맞춰져요.'
                  )}
                </>
              }
            >
              {(id, desc) => (
                <select
                  id={id}
                  value={values.timezone}
                  onChange={(e) => {
                    setTzManual(true)
                    set('timezone', e.target.value)
                  }}
                  aria-invalid={inv('timezone')}
                  aria-describedby={desc}
                >
                  {tzOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>

          <div data-field="venue">
            <Field label="장소명" error={err('venue')}>
              {(id, desc) => (
                <input
                  id={id}
                  type="text"
                  value={values.venue}
                  onChange={(e) => set('venue', e.target.value)}
                  aria-describedby={desc}
                  placeholder="예: ○○ 빌딩 3층 이벤트홀"
                  autoComplete="off"
                />
              )}
            </Field>
          </div>

          <div data-field="address">
            <Field label="주소" error={err('address')}>
              {(id, desc) => (
                <input
                  id={id}
                  type="text"
                  value={values.address}
                  onChange={(e) => set('address', e.target.value)}
                  aria-describedby={desc}
                  placeholder="지도에서 찾을 수 있는 주소"
                  autoComplete="off"
                />
              )}
            </Field>
          </div>
        </FormSection>

        {/* ---------- 기간 ---------- */}
        <FormSection title="기간" description="날짜를 모르면 비워 두세요. ‘확인 필요’로 표시돼요.">
          <div className="grid-2">
            <div data-field="startDate">
              <Field label="시작일" error={err('startDate')}>
                {(id, desc) => (
                  <div className="ef-input-row">
                    <input
                      id={id}
                      type="date"
                      value={values.startDate}
                      onChange={(e) => set('startDate', e.target.value)}
                      aria-invalid={inv('startDate')}
                      aria-describedby={desc}
                    />
                    {values.startDate && (
                      <button type="button" className="icon-btn" aria-label="시작일 비우기" onClick={() => set('startDate', '')}>
                        ✕
                      </button>
                    )}
                  </div>
                )}
              </Field>
            </div>
            <div data-field="endDate">
              <Field label="종료일" error={err('endDate')}>
                {(id, desc) => (
                  <div className="ef-input-row">
                    <input
                      id={id}
                      type="date"
                      value={values.endDate}
                      min={values.startDate || undefined}
                      onChange={(e) => set('endDate', e.target.value)}
                      aria-invalid={inv('endDate')}
                      aria-describedby={desc}
                    />
                    {values.endDate && (
                      <button type="button" className="icon-btn" aria-label="종료일 비우기" onClick={() => set('endDate', '')}>
                        ✕
                      </button>
                    )}
                  </div>
                )}
              </Field>
            </div>
          </div>
        </FormSection>

        {/* ---------- 예약 ---------- */}
        <FormSection title="예약">
          <div data-field="reservationRequired">
            <FieldSet legend="예약 필요 여부" error={err('reservationRequired')}>
              {() => (
                <div className="radio-group ef-radio-compact">
                  {RESERVATION_OPTIONS.map((o) => (
                    <label key={o.id}>
                      <input
                        type="radio"
                        name={`${uid}-reservation`}
                        value={o.id}
                        checked={values.reservationRequired === o.id}
                        onChange={() => set('reservationRequired', o.id)}
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
              )}
            </FieldSet>
          </div>

          {values.reservationRequired === 'required' ? (
            <div className="stack">
              <div className="grid-2">
                <div data-field="reservationStart">
                  <Field label={`예약 시작 (행사 현지 시간: ${tzName})`} error={err('reservationStart')}>
                    {(id, desc) => (
                      <div className="ef-input-row">
                        <input
                          id={id}
                          type="datetime-local"
                          value={values.reservationStart}
                          onChange={(e) => set('reservationStart', e.target.value)}
                          aria-invalid={inv('reservationStart')}
                          aria-describedby={desc}
                        />
                        {values.reservationStart && (
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label="예약 시작 시각 비우기"
                            onClick={() => set('reservationStart', '')}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    )}
                  </Field>
                </div>
                <div data-field="reservationEnd">
                  <Field label={`예약 종료 (행사 현지 시간: ${tzName})`} error={err('reservationEnd')}>
                    {(id, desc) => (
                      <div className="ef-input-row">
                        <input
                          id={id}
                          type="datetime-local"
                          value={values.reservationEnd}
                          min={values.reservationStart || undefined}
                          onChange={(e) => set('reservationEnd', e.target.value)}
                          aria-invalid={inv('reservationEnd')}
                          aria-describedby={desc}
                        />
                        {values.reservationEnd && (
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label="예약 종료 시각 비우기"
                            onClick={() => set('reservationEnd', '')}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    )}
                  </Field>
                </div>
              </div>
              <p className="field__hint">
                모르면 비워 두세요. 시작·종료 시각이 모두 있어야 ‘예약 접수 중’으로 표시돼요.
              </p>
            </div>
          ) : (
            <p className="field__hint">예약이 ‘필수’일 때 예약 시작·종료 시각을 입력할 수 있어요.</p>
          )}

          <div data-field="reservationUrl">
            <Field label="예약 URL" error={err('reservationUrl')} hint="예약 페이지 주소 (http:// 또는 https://)">
              {(id, desc) => (
                <input
                  id={id}
                  type="url"
                  inputMode="url"
                  value={values.reservationUrl}
                  onChange={(e) => set('reservationUrl', e.target.value)}
                  aria-invalid={inv('reservationUrl')}
                  aria-describedby={desc}
                  placeholder="https://"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              )}
            </Field>
          </div>
        </FormSection>

        {/* ---------- 공지 · 메모 ---------- */}
        <FormSection title="공지 · 메모">
          <div data-field="officialUrl">
            <Field label="공식 공지 URL" error={err('officialUrl')} hint="정보를 확인한 공식 공지 주소 (http:// 또는 https://)">
              {(id, desc) => (
                <input
                  id={id}
                  type="url"
                  inputMode="url"
                  value={values.officialUrl}
                  onChange={(e) => set('officialUrl', e.target.value)}
                  aria-invalid={inv('officialUrl')}
                  aria-describedby={desc}
                  placeholder="https://"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              )}
            </Field>
          </div>

          <div data-field="lastCheckedDate">
            <Field label="마지막 확인 날짜" error={err('lastCheckedDate')} hint="공식 공지에서 정보를 마지막으로 확인한 날이에요.">
              {(id, desc) => (
                <div className="ef-input-row">
                  <input
                    id={id}
                    type="date"
                    value={values.lastCheckedDate}
                    max={today}
                    onChange={(e) => set('lastCheckedDate', e.target.value)}
                    aria-invalid={inv('lastCheckedDate')}
                    aria-describedby={desc}
                  />
                  <Button onClick={() => set('lastCheckedDate', today)} disabled={values.lastCheckedDate === today}>
                    오늘
                  </Button>
                  {values.lastCheckedDate && (
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="마지막 확인 날짜 비우기"
                      onClick={() => set('lastCheckedDate', '')}
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}
            </Field>
          </div>

          <div data-field="memo">
            <Field label="메모" error={err('memo')}>
              {(id, desc) => (
                <textarea
                  id={id}
                  rows={4}
                  value={values.memo}
                  onChange={(e) => set('memo', e.target.value)}
                  aria-describedby={desc}
                  placeholder="굿즈 구성, 특전, 입장 방법 등 자유롭게 적어 두세요."
                />
              )}
            </Field>
          </div>
        </FormSection>

        <div className="ef-actions">
          <Button onClick={onCancel}>취소</Button>
          <Button type="submit" variant="primary">
            {isEdit ? '변경 내용 저장' : '저장'}
          </Button>
        </div>
      </form>

      {isEdit && (
        <section className="card ef-danger" aria-label="행사 삭제">
          <div className="ef-danger__text">
            <h2 className="ef-section__title">행사 삭제</h2>
            <p className="muted small">관심 목록과 여행 일정에서도 함께 삭제돼요.</p>
          </div>
          <Button variant="danger" onClick={onDelete}>
            이 행사 삭제
          </Button>
        </section>
      )}
    </div>
  )
}
