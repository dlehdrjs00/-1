import { useId, useMemo, useState } from 'react'
import type { EventItem } from '../types'
import { EVENT_TYPE_MAP, WORK_MAP } from '../constants'
import { Link } from '../router'
import { SAVE_FAILED_MESSAGE, useStore } from '../store/AppStore'
import { clearEventDraftsFor } from '../lib/eventDraft'
import { Button, EmptyState, PageHeader, SampleBadge, useConfirm, useToast } from '../components/ui'
import { TypeLabel, WorkTags } from '../components/EventBits'
import { PeriodText } from '../components/events/EventText'
import { useDeleteEvent, type DeleteEventResult } from '../components/manage/useDeleteEvent'
import { BackupSection } from '../components/manage/BackupSection'
import { ResetSection } from '../components/manage/ResetSection'
import './manage.css'

function matchesQuery(e: EventItem, q: string): boolean {
  if (!q) return true
  const hay = [
    e.title,
    e.country,
    e.city,
    e.venue,
    e.address,
    e.memo,
    EVENT_TYPE_MAP[e.type]?.label ?? '',
    ...e.works.map((w) => `${WORK_MAP[w]?.name ?? ''} ${WORK_MAP[w]?.short ?? ''}`),
  ]
    .join(' ')
    .toLowerCase()
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => hay.includes(t))
}

function placeText(e: EventItem): string {
  return [e.city, e.country].map((s) => s.trim()).filter(Boolean).join(', ')
}

function ManageEventRow({ event, onDelete }: { event: EventItem; onDelete: (e: EventItem) => Promise<DeleteEventResult> }) {
  const place = placeText(event)
  return (
    <li className="manage-event">
      <div className="manage-event__main">
        <div className="manage-event__title-row">
          <Link to={`/events/${encodeURIComponent(event.id)}`} className="manage-event__title">
            {event.title}
          </Link>
          {event.isSample && <SampleBadge />}
        </div>
        <div className="manage-event__meta">
          <WorkTags works={event.works} />
          <TypeLabel event={event} />
        </div>
        <p className="manage-event__sub">
          {place ? <span>{place}</span> : <span className="unknown">장소 확인 필요</span>}
          <span aria-hidden> · </span>
          <span>
            <PeriodText event={event} />
          </span>
        </p>
      </div>
      <div className="manage-event__actions">
        <Link
          to={`/manage/edit/${encodeURIComponent(event.id)}`}
          className="btn btn--secondary btn--sm"
          aria-label={`${event.title} 수정`}
        >
          수정
        </Link>
        <Button size="sm" variant="danger" onClick={() => void onDelete(event)} aria-label={`${event.title} 삭제`}>
          삭제
        </Button>
      </div>
    </li>
  )
}

const JUMPS = [
  { key: 'events', label: '전체 행사' },
  { key: 'samples', label: '샘플 데이터' },
  { key: 'backup', label: '백업 · 불러오기' },
  { key: 'storage', label: '저장 안내' },
  { key: 'reset', label: '초기화' },
] as const

export default function ManagePage() {
  const store = useStore()
  const toast = useToast()
  const confirm = useConfirm()
  const deleteEvent = useDeleteEvent()
  const [query, setQuery] = useState('')
  const baseId = useId()
  const hid = (k: (typeof JUMPS)[number]['key']) => `${baseId}-${k}`
  const searchId = `${baseId}-search`

  const { events } = store.data
  const { mine, samples } = useMemo(() => {
    const mine = events.filter((e) => !e.isSample).sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : b.updatedAt < a.updatedAt ? -1 : 0))
    const samples = events.filter((e) => e.isSample)
    return { mine, samples }
  }, [events])

  const q = query.trim()
  const shownMine = useMemo(() => mine.filter((e) => matchesQuery(e, q)), [mine, q])
  const shownSamples = useMemo(() => samples.filter((e) => matchesQuery(e, q)), [samples, q])
  const shownCount = shownMine.length + shownSamples.length

  const sampleCount = store.sampleCount
  const sampleItemCount = useMemo(() => {
    const ids = new Set(samples.map((e) => e.id))
    return store.data.trips.reduce((n, t) => n + t.items.filter((i) => i.kind === 'event' && i.eventId && ids.has(i.eventId)).length, 0)
  }, [samples, store.data.trips])
  const sampleFavCount = useMemo(() => {
    const ids = new Set(samples.map((e) => e.id))
    return store.data.favorites.filter((f) => ids.has(f)).length
  }, [samples, store.data.favorites])

  const onDeleteSamples = async () => {
    const ok = await confirm({
      title: '샘플 행사를 모두 삭제할까요?',
      danger: true,
      confirmLabel: '샘플 모두 삭제',
      message: (
        <div className="stack">
          <p>시연용 샘플 행사 {sampleCount}개를 삭제합니다.</p>
          <ul className="plain-list">
            <li>관심 목록에서 샘플 행사 {sampleFavCount}개가 함께 빠집니다.</li>
            <li>여행 일정에 담긴 샘플 행사 {sampleItemCount}개도 함께 삭제됩니다.</li>
            <li>직접 등록한 행사와 여행은 그대로 남아요.</li>
          </ul>
        </div>
      ),
    })
    if (!ok) return
    const sampleIds = samples.map((e) => e.id)
    const n = store.deleteSamples()
    // 저장 실패: 샘플은 그대로 남아 있다 → 성공 안내 없이, 샘플 수정 초안도 지우지 않는다
    if (n === null) return toast(`${SAVE_FAILED_MESSAGE} 샘플 행사는 삭제되지 않았어요.`, 'error')
    // 삭제가 저장된 뒤에만 삭제한 샘플의 저장하지 않은 수정 초안을 지운다
    clearEventDraftsFor(sampleIds)
    toast(`샘플 행사 ${n}개를 삭제했어요.`)
  }

  const jumpTo = (k: (typeof JUMPS)[number]['key']) => {
    const el = document.getElementById(hid(k))
    if (!el) return
    el.scrollIntoView({ block: 'start' })
    el.focus({ preventScroll: true })
  }

  return (
    <div className="manage-page stack-lg">
      <PageHeader title="정보 관리" subtitle="행사 정보를 직접 등록·수정하고, 데이터를 백업하거나 불러올 수 있어요." />

      <nav className="manage-jump" aria-label="정보 관리 바로가기">
        {JUMPS.map((j) => (
          <button key={j.key} type="button" className="chip manage-jump__chip" onClick={() => jumpTo(j.key)}>
            {j.label}
          </button>
        ))}
      </nav>

      {/* 전체 행사 (직접 등록 + 샘플) */}
      <section className="card manage-section" aria-labelledby={hid('events')}>
        <div className="manage-section__head manage-section__head--row">
          <h2 id={hid('events')} className="manage-section__title" tabIndex={-1}>
            전체 행사 <span className="manage-count">{events.length}</span>
          </h2>
          <Link to="/manage/new" className="btn btn--primary btn--md">
            + 행사 등록
          </Link>
        </div>

        {events.length === 0 ? (
          <EmptyState
            icon="📝"
            title="등록된 행사가 없어요"
            description="가고 싶은 행사 정보를 직접 등록해 보세요. 모르는 정보는 비워 두면 ‘확인 필요’로 표시돼요."
            action={
              <Link to="/manage/new" className="btn btn--primary btn--md">
                + 행사 등록
              </Link>
            }
          />
        ) : (
          <>
            <div className="manage-search">
              <label htmlFor={searchId} className="sr-only">
                행사 검색
              </label>
              <input
                id={searchId}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="행사명, 작품, 도시로 검색"
                autoComplete="off"
              />
              {q && (
                <p className="muted small" role="status">
                  검색 결과 {shownCount}개
                </p>
              )}
            </div>

            {shownCount === 0 ? (
              <EmptyState
                icon="🔍"
                title="검색 결과가 없어요"
                description="다른 검색어로 찾아보세요."
                action={<Button onClick={() => setQuery('')}>검색어 지우기</Button>}
              />
            ) : (
              <div className="stack">
                {(shownMine.length > 0 || !q) && (
                  <div className="manage-group">
                    <h3 className="manage-group__title">직접 등록한 행사 ({mine.length})</h3>
                    {shownMine.length > 0 ? (
                      <ul className="manage-list">
                        {shownMine.map((e) => (
                          <ManageEventRow key={e.id} event={e} onDelete={deleteEvent} />
                        ))}
                      </ul>
                    ) : (
                      <p className="muted small">아직 직접 등록한 행사가 없어요. ‘+ 행사 등록’으로 추가해 보세요.</p>
                    )}
                  </div>
                )}
                {shownSamples.length > 0 && (
                  <div className="manage-group">
                    <h3 className="manage-group__title">
                      샘플 행사 ({samples.length}) <span className="faint small">시연용 가상 데이터</span>
                    </h3>
                    <ul className="manage-list">
                      {shownSamples.map((e) => (
                        <ManageEventRow key={e.id} event={e} onDelete={deleteEvent} />
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {/* 샘플 데이터 */}
      <section className="card manage-section" aria-labelledby={hid('samples')}>
        <div className="manage-section__head">
          <h2 id={hid('samples')} className="manage-section__title" tabIndex={-1}>
            샘플 데이터
          </h2>
        </div>
        {sampleCount > 0 ? (
          <>
            <p className="muted small">
              시연용 가상 행사 <strong className="manage-strong">{sampleCount}개</strong>가 들어 있어요. 실제 행사가 아니며 목록에 <SampleBadge /> 표시가 붙어요.
              내 행사를 등록했다면 샘플을 지워 목록을 정리할 수 있어요.
            </p>
            <div>
              <Button variant="danger" onClick={onDeleteSamples}>
                샘플 모두 삭제
              </Button>
            </div>
          </>
        ) : (
          <p className="muted small">샘플 데이터가 없어요. 직접 등록하거나 불러온 행사만 남아 있어요.</p>
        )}
      </section>

      <BackupSection headingId={hid('backup')} />

      {/* 저장 안내 */}
      <section className="card manage-section manage-section--info" aria-labelledby={hid('storage')}>
        <div className="manage-section__head">
          <h2 id={hid('storage')} className="manage-section__title" tabIndex={-1}>
            저장 안내
          </h2>
        </div>
        <ul className="manage-storage">
          <li>
            데이터는 <strong>이 브라우저에만</strong> 저장되며 다른 기기와 자동 동기화되지 않습니다.
          </li>
          <li>브라우저 데이터를 지우면 사라질 수 있으니 주기적으로 JSON으로 내보내 백업하세요.</li>
        </ul>
      </section>

      <ResetSection headingId={hid('reset')} />
    </div>
  )
}
