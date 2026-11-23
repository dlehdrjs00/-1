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
  type EventFormErrors,
  type EventFormField,
  type EventFormValues,
} from '../lib/eventForm'
import {
  clearEventDraft,
  formatDraftSavedAt,
  isDraftStorageAvailable,
  loadEventDraft,
  saveEventDraft,
  type DraftTarget,
  type LoadedEventDraft,
} from '../lib/eventDraft'
import { goBack, Link, navigate, setNavigationGuard } from '../router'
import { SAVE_FAILED_MESSAGE, useStore } from '../store/AppStore'
import { newId } from '../lib/id'
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

/* ---------------- 초안 저장·복구 ---------------- */

const DRAFT_SAVE_DELAY_MS = 400

/**
 * 행사 폼 초안 (src/lib/eventDraft.ts 에 저장). 뒤로 가기·새로고침·탭 닫기에도 입력을 잃지 않게 한다.
 * - 값이 초기값과 다르면 잠시 뒤 저장하고, 같아지면 지운다. 화면을 벗어나거나 페이지가 숨겨질 때는 바로 저장한다.
 * - 저장된 초안이 있으면 offer 로 알린다. 사용자가 복구/버리기를 고르기 전에는 폼을 덮어쓰지 않고,
 *   저장된 초안도 건드리지 않는다 (그대로 두면 빈 폼이 초안을 지워 버리므로).
 * - 저장·삭제 뒤, 또는 '나가기'로 입력을 버린 뒤에는 finish() 로 초안을 지우고 더는 저장하지 않는다.
 *   (선택을 기다리는 동안 폼은 inert 로 막아 둔다.)
 *   저장·삭제가 실패하면 finish() 를 부르지 않고 flush() 로 지금 입력을 초안에 바로 보관한다.
 * - 새로고침/탭 닫기 경고(beforeunload)는 입력을 초안으로 보관하지 못한 경우(저장소를 쓸 수 없음)에만 켠다.
 */
function useEventFormDraft({
  existing,
  initial,
  values,
  dirty,
}: {
  existing?: EventItem
  initial: EventFormValues
  values: EventFormValues
  dirty: boolean
}) {
  const store = useStore()
  const [target] = useState<DraftTarget>(() => (existing ? { kind: 'edit', eventId: existing.id } : { kind: 'new' }))
  const [offer, setOffer] = useState<LoadedEventDraft<EventFormValues> | null>(() =>
    loadEventDraft(target, initial, { event: existing, eventExists: (id) => store.getEvent(id) !== undefined }),
  )
  const [saveFailed, setSaveFailed] = useState(() => !isDraftStorageAvailable())
  const pending = offer !== null

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(values)
  // 수정 초안의 기준 시각: 수정을 시작할 때의 updatedAt (복구하면 그 초안의 기준 시각을 이어 받는다)
  const base = useRef<string | null>(existing?.updatedAt ?? null)
  const finished = useRef(false)
  const state = useRef({ dirty, saveFailed, pending })
  useEffect(() => {
    state.current = { dirty, saveFailed, pending }
  })

  /**
   * 지금 입력을 초안으로 바로 저장한다 (페이지 숨김·닫힘·화면 이탈 때).
   * 미뤄 둔 저장이 없어도 다시 쓴다 — 다른 탭이 같은 행사를 저장하며 이 초안을 지웠을 수 있기 때문.
   * 반환: 지금 입력이 초안으로 보관되어 있는지
   */
  const flush = useCallback((): boolean => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (finished.current) return true
    // 복구/버리기 선택 대기 중에는 저장된 초안을 덮어쓰지 않는다. 바뀐 것이 없으면 보관할 것도 없다.
    if (state.current.pending || !state.current.dirty) return true
    const ok = saveEventDraft(target, latest.current, base.current)
    state.current.saveFailed = !ok
    return ok
  }, [target])

  // 자동 저장 (선택 대기 중·끝난 뒤에는 하지 않음)
  useEffect(() => {
    latest.current = values
    if (finished.current || pending) return
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (!dirty) {
      clearEventDraft(target)
      return
    }
    timer.current = setTimeout(() => {
      timer.current = null
      if (!finished.current) setSaveFailed(!saveEventDraft(target, latest.current, base.current))
    }, DRAFT_SAVE_DELAY_MS)
  }, [values, dirty, pending, target])

  // 페이지가 숨겨지거나 닫힐 때, 화면을 벗어날 때(뒤로 가기 등) 바로 저장
  useEffect(() => {
    const onPageHide = () => {
      flush()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const kept = flush()
      if (kept || finished.current || !state.current.dirty) return
      // 초안으로 보관하지 못한 입력이 있을 때만 경고
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('visibilitychange', onVisibility)
      flush()
    }
  }, [flush])

  /** 초안 복구: 복구할 값을 돌려준다 (폼에 넣는 것은 부르는 쪽) */
  const restore = useCallback((): EventFormValues | null => {
    if (!offer) return null
    base.current = offer.baseUpdatedAt
    setOffer(null)
    return offer.values
  }, [offer])

  /** 초안 버리기 */
  const discard = useCallback(() => {
    clearEventDraft(target)
    setOffer(null)
  }, [target])

  /** 저장·삭제 뒤, 또는 입력을 버리고 나갈 때. 초안을 지우고 더는 저장하지 않는다. */
  const finish = useCallback(() => {
    finished.current = true
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
    clearEventDraft(target)
  }, [target])

  return { offer, restore, discard, finish, flush }
}

function DraftNotice({
  offer,
  onRestore,
  onDiscard,
}: {
  offer: LoadedEventDraft<EventFormValues>
  onRestore: () => void
  onDiscard: () => void
}) {
  return (
    <Notice tone={offer.eventChanged ? 'warning' : 'info'} title={`저장하지 않은 초안이 있어요 (${formatDraftSavedAt(offer.savedAt)})`}>
      <div className="ef-draft">
        {offer.eventChanged && (
          <p className="ef-draft__warn">이 초안을 만든 뒤 행사가 수정되었어요. 복구하면 지금 저장된 내용 대신 초안 내용으로 폼이 채워져요.</p>
        )}
        <p>복구하면 이전에 입력하던 내용으로 폼을 채우고, 버리면 초안을 지워요. 둘 중 하나를 고르면 입력할 수 있어요.</p>
        <div className="ef-draft__actions">
          <Button variant="primary" onClick={onRestore}>
            초안 복구
          </Button>
          <Button onClick={onDiscard}>
            버리기
          </Button>
        </div>
      </div>
    </Notice>
  )
}

function EventForm({ existing }: { existing?: EventItem }) {
  const store = useStore()
  const toast = useToast()
  const confirm = useConfirm()
  const deleteEvent = useDeleteEvent()
  const uid = useId()
  const formId = `${uid}-form`
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

  // 날짜/시각 입력이 덜 채워진 경우 브라우저는 value 를 '' 로 돌려준다 → 조용히 버려지지 않도록 별도 오류로 표시
  const [badInputErrors, setBadInputErrors] = useState<EventFormErrors>({})
  const scanBadInputs = useCallback((): EventFormErrors => {
    const out: EventFormErrors = {}
    formRef.current?.querySelectorAll<HTMLInputElement>('input[type="date"], input[type="time"], input[type="datetime-local"]').forEach((el) => {
      if (!el.validity.badInput) return
      const field = el.closest<HTMLElement>('[data-field]')?.dataset.field as EventFormField | undefined
      if (field)
        out[field] =
          el.type === 'date' ? '날짜를 끝까지 입력하세요.' : el.type === 'time' ? '시각을 끝까지 입력하세요.' : '날짜와 시각을 모두 입력하세요.'
    })
    return out
  }, [])
  const errors = useMemo<EventFormErrors>(() => {
    if (!submitted) return {}
    const bad = { ...badInputErrors }
    // 예약 시각 칸이 숨겨지면(필수가 아님) 그 칸의 '덜 입력됨' 오류도 남기지 않는다
    if (values.reservationRequired !== 'required') {
      for (const f of ['reservationStartDate', 'reservationStartTime', 'reservationEndDate', 'reservationEndTime'] as const) delete bad[f]
    }
    return { ...validateEventForm(values), ...bad }
  }, [submitted, values, badInputErrors])
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

  // 초안 자동 저장·복구 (뒤로 가기·새로고침·탭 닫기에도 입력이 남는다). 새로고침 경고는 초안을 보관하지 못할 때만.
  const draft = useEventFormDraft({ existing, initial, values, dirty })
  const finishDraft = draft.finish
  const restoreDraft = () => {
    const restored = draft.restore()
    if (!restored) return
    setValues(restored)
    // 초안의 시간대가 국가 기본값과 다르면 직접 고른 것으로 본다 (수정 모드 초기값과 같은 규칙)
    const def = COUNTRY_DEFAULT_TZ[restored.country.trim()]
    setTzManual(def !== undefined && def !== restored.timezone)
    toast('초안을 복구했어요')
  }

  // 저장하지 않은 변경이 있으면 메뉴 이동 전에 확인. '나가기'를 고르면 초안도 지운다.
  const releaseGuard = useRef<(() => void) | null>(null)
  useEffect(() => {
    if (!dirty) return
    const release = setNavigationGuard(async () => {
      const ok = await confirm({
        title: '저장하지 않고 나갈까요?',
        message: '입력한 내용은 저장되지 않아요.',
        confirmLabel: '나가기',
        danger: true,
      })
      if (ok) finishDraft()
      return ok
    })
    releaseGuard.current = release
    return () => {
      release()
      releaseGuard.current = null
    }
  }, [dirty, confirm, finishDraft])

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

  // 새 행사 id 는 폼마다 한 번만 만든다: 저장에 실패한 뒤 다시 눌러도(또는 빠르게 두 번 눌러도) 같은 id 로
  // 저장되므로 행사가 둘 생기지 않는다 (store.addEvent 는 같은 id 가 있으면 갱신한다).
  const [newEventId] = useState(() => newId('evt'))
  // 저장 처리 중·저장 성공 뒤(화면을 떠나는 중)에는 제출을 무시한다. 실패하면 다시 누를 수 있게 푼다.
  const submitting = useRef(false)
  // 마지막 저장 실패 안내 (n: 다시 실패할 때마다 새로 읽히도록 바꾸는 값)
  const [saveFailure, setSaveFailure] = useState<{ n: number; draftKept: boolean; dirty: boolean } | null>(null)

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (submitting.current) return
    const bad = scanBadInputs()
    setBadInputErrors(bad)
    const errs = { ...validateEventForm(values), ...bad }
    if (hasErrors(errs)) {
      setSubmitted(true)
      setFocusReq((prev) => ({ field: orderedErrors(errs)[0].field, n: (prev?.n ?? 0) + 1 }))
      return
    }
    submitting.current = true
    const input = formToEventInput(values, existing?.isSample ?? false)
    const savedId = existing
      ? store.updateEvent(existing.id, input)
        ? existing.id
        : null
      : (store.addEvent(input, { id: newEventId })?.id ?? null)
    if (savedId === null) {
      // 저장 실패: 폼·입력값·초안을 그대로 두고(초안은 지금 입력으로 바로 보관), 성공 안내·화면 이동은 하지 않는다.
      // 이동 확인(나가기 전에 묻기)도 그대로 유지된다.
      submitting.current = false
      const draftKept = draft.flush()
      setSaveFailure((prev) => ({ n: (prev?.n ?? 0) + 1, draftKept, dirty }))
      toast(SAVE_FAILED_MESSAGE, 'error')
      return
    }
    setSaveFailure(null)
    finishDraft()
    toast('저장했어요')
    releaseGuard.current?.()
    if (existing) {
      // 수정: 들어온 화면(상세·정보 관리)으로 돌아간다. 바로 열었으면 상세로.
      goBack(`/events/${encodeURIComponent(savedId)}`)
    } else {
      navigate(`/events/${encodeURIComponent(savedId)}`, { replace: true })
    }
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
      finishDraft()
    }
    goBack('/manage')
  }

  const onDelete = async () => {
    if (!existing) return
    const result = await deleteEvent(existing)
    if (result === 'deleted') {
      finishDraft()
      navigate('/manage', { replace: true })
    } else if (result === 'failed') {
      // 삭제를 저장하지 못함 (오류 안내는 useDeleteEvent 가 한다): 이 화면과 입력·초안을 그대로 둔다
      draft.flush()
    }
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

      {draft.offer && <DraftNotice offer={draft.offer} onRestore={restoreDraft} onDiscard={draft.discard} />}

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

      {/* 초안 복구/버리기를 고르기 전에는 입력을 막는다 (고르기 전 입력은 초안으로 보관할 수 없어 뒤로 가기에 사라지므로) */}
      <form id={formId} ref={formRef} className="ef-form" inert={draft.offer !== null} noValidate onSubmit={onSubmit} onBlur={() => submitted && setBadInputErrors(scanBadInputs())} aria-label={isEdit ? '행사 수정' : '행사 등록'}>
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
                    !tzManual &&
                    (countryKey && !countryTz
                      ? '이 국가는 시간대를 자동으로 맞추지 않아요. 직접 골라 주세요.'
                      : '국가를 고르면 자동으로 맞춰져요.')
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
              <ReservationMomentFields
                name="예약 시작"
                tzName={tzName}
                dateField="reservationStartDate"
                timeField="reservationStartTime"
                date={values.reservationStartDate}
                time={values.reservationStartTime}
                dateError={err('reservationStartDate')}
                timeError={err('reservationStartTime')}
                onDate={(v) => set('reservationStartDate', v)}
                onTime={(v) => set('reservationStartTime', v)}
              />
              <ReservationMomentFields
                name="예약 종료"
                tzName={tzName}
                dateField="reservationEndDate"
                timeField="reservationEndTime"
                date={values.reservationEndDate}
                time={values.reservationEndTime}
                minDate={values.reservationStartDate || undefined}
                dateError={err('reservationEndDate')}
                timeError={err('reservationEndTime')}
                onDate={(v) => set('reservationEndDate', v)}
                onTime={(v) => set('reservationEndTime', v)}
              />
              <p className="field__hint">
                날짜를 모르면 비워 두세요. 시작이 지났고 종료가 남은 것이 확실할 때만 ‘예약 접수 중’으로 표시하고, 시각 미정인
                시작일·종료일 당일에는 ‘확인 필요’로 표시해요.
              </p>
            </div>
          ) : (
            <p className="field__hint">예약이 ‘필수’일 때 예약 시작·종료 날짜와 시각을 입력할 수 있어요.</p>
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

      </form>

      {/* 저장 실패 안내: 저장 바 바로 위. 다음 저장이 성공하면 사라진다 (다시 실패하면 새로 읽힌다). */}
      {saveFailure && (
        <Notice key={saveFailure.n} tone="danger" title={isEdit ? '변경 내용이 저장되지 않았어요' : '행사가 등록되지 않았어요'}>
          {SAVE_FAILED_MESSAGE}{' '}
          {!saveFailure.dirty
            ? '입력한 내용은 그대로 남아 있어요.'
            : saveFailure.draftKept
              ? '입력한 내용과 초안은 그대로 남아 있어요.'
              : '입력한 내용은 화면에 남아 있지만 초안으로 보관하지 못했어요. 이 화면을 닫거나 벗어나면 사라질 수 있어요.'}
        </Notice>
      )}

      {/* 저장 바는 form 밖(.ef-page 직속)에 둔다: sticky 요소는 자기 컨테이너 위로 올라갈 수 없어서,
          form 안에 있으면 짧은 화면에서 위쪽 안내문 때문에 하단 메뉴 아래로 일부 가려졌다. */}
      <div className="ef-actions" role="group" aria-label="저장·취소" inert={draft.offer !== null}>
        <Button onClick={onCancel}>취소</Button>
        <Button type="submit" form={formId} variant="primary">
          {isEdit ? '변경 내용 저장' : '저장'}
        </Button>
      </div>

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

/**
 * 예약 시작 또는 종료: 날짜 칸 + 선택 시각 칸.
 * 시각을 비우면 날짜만 저장하고 '시각 미정'으로 표시한다 (00:00 / 23:59 로 채우지 않음).
 * 각 칸은 자기 data-field 래퍼 안에 있어 오류 요약·첫 오류 이동·덜 채운 날짜 검사(badInput)가 칸별로 동작한다.
 */
function ReservationMomentFields({
  name,
  tzName,
  dateField,
  timeField,
  date,
  time,
  minDate,
  dateError,
  timeError,
  onDate,
  onTime,
}: {
  /** '예약 시작' | '예약 종료' */
  name: string
  tzName: string
  dateField: EventFormField
  timeField: EventFormField
  date: string
  time: string
  minDate?: string
  dateError: string | null
  timeError: string | null
  onDate: (v: string) => void
  onTime: (v: string) => void
}) {
  return (
    <FieldSet legend={`${name} (행사 현지 시간: ${tzName})`}>
      {() => (
        <div className="grid-2">
          <div data-field={dateField}>
            <Field label="날짜" error={dateError}>
              {(id, desc) => (
                <div className="ef-input-row">
                  <input
                    id={id}
                    type="date"
                    value={date}
                    min={minDate}
                    onChange={(e) => onDate(e.target.value)}
                    aria-label={`${name} 날짜`}
                    aria-invalid={dateError ? true : undefined}
                    aria-describedby={desc}
                  />
                  {date && (
                    <button type="button" className="icon-btn" aria-label={`${name} 날짜 비우기`} onClick={() => onDate('')}>
                      ✕
                    </button>
                  )}
                </div>
              )}
            </Field>
          </div>
          <div data-field={timeField}>
            <Field label="시각" error={timeError} hint="시각을 모르면 비워 두세요 (‘시각 미정’으로 표시)">
              {(id, desc) => (
                <div className="ef-input-row">
                  <input
                    id={id}
                    type="time"
                    value={time}
                    onChange={(e) => onTime(e.target.value)}
                    aria-label={`${name} 시각`}
                    aria-invalid={timeError ? true : undefined}
                    aria-describedby={desc}
                  />
                  {time && (
                    <button type="button" className="icon-btn" aria-label={`${name} 시각 비우기`} onClick={() => onTime('')}>
                      ✕
                    </button>
                  )}
                </div>
              )}
            </Field>
          </div>
        </div>
      )}
    </FieldSet>
  )
}
