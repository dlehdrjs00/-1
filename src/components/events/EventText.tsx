import type { EventItem } from '../../types'
import { formatDateRange } from '../../lib/date'

/** 비어 있는 값 표시. 값을 지어내지 않고 '확인 필요'로 보여 준다. */
export function Unknown({ label = '확인 필요' }: { label?: string }) {
  return <span className="unknown ev-nw">{label}</span>
}

/** 문자열 값이 비었으면 '확인 필요' */
export function TextOrUnknown({ value, label }: { value: string | null | undefined; label?: string }) {
  return value && value.trim() ? <>{value}</> : <Unknown label={label} />
}

/** 행사 기간. 한쪽이라도 모르면 해당 부분을 경고색으로 */
export function PeriodText({ event }: { event: Pick<EventItem, 'startDate' | 'endDate'> }) {
  const text = formatDateRange(event.startDate, event.endDate)
  if (event.startDate && event.endDate) return <>{text}</>
  return <span className="unknown">{text}</span>
}

/** '도시 · 장소'. 둘 다 없으면 '확인 필요' */
export function PlaceText({ event }: { event: Pick<EventItem, 'city' | 'venue'> }) {
  const city = event.city.trim()
  const venue = event.venue.trim()
  if (!city && !venue) return <Unknown />
  return (
    <>
      {city ? city : <Unknown label="도시 확인 필요" />}
      <span className="ev-sep" aria-hidden>
        {' · '}
      </span>
      {venue ? venue : <Unknown label="장소 확인 필요" />}
    </>
  )
}

/** http(s) 주소만 링크로 허용 (가져온 JSON 의 javascript: 등 차단) */
function safeHttpUrl(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  try {
    const u = new URL(v)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}

/** 외부 링크. 비어 있으면 '확인 필요', 형식이 이상하면 링크 없이 원문 표시 */
export function ExternalUrl({ value }: { value: string }) {
  const v = value.trim()
  if (!v) return <Unknown />
  const href = safeHttpUrl(v)
  if (!href) {
    return (
      <span className="ev-url">
        {v} <span className="unknown small">(링크 형식 확인 필요)</span>
      </span>
    )
  }
  return (
    <a className="ev-url" href={href} target="_blank" rel="noopener noreferrer">
      {v}
      <span className="ev-url__ext" aria-hidden>
        {' ↗'}
      </span>
      <span className="sr-only"> (새 창에서 열림)</span>
    </a>
  )
}
