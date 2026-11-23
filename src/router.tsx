/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from 'react'

/**
 * 아주 작은 해시 라우터. 정적 파일만으로 동작하도록 #/path 형식을 사용한다.
 * 경로 목록:
 *   #/events              행사 목록
 *   #/events/:id          행사 상세
 *   #/favorites           관심 행사
 *   #/trips               내 여행 (활성 여행)
 *   #/trips/:id           특정 여행
 *   #/manage              정보 관리 (내 행사 목록, 입출력, 샘플 삭제, 안내)
 *   #/manage/new          행사 등록
 *   #/manage/edit/:id     행사 수정
 */

export function currentPath(): string {
  const h = window.location.hash.replace(/^#/, '')
  return h.startsWith('/') ? h : '/events'
}

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  const url = `#${path}`
  if (opts.replace) {
    window.history.replaceState({ idx: currentIdx }, '', url)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    window.location.hash = path
  }
}

/*
 * 앱 안 기록 위치(idx)를 history.state 에 남긴다.
 * idx 가 0 이면 앱에 처음 들어온 항목이므로 '뒤로'는 history.back() 대신 fallback 으로 이동한다.
 */
let currentIdx = 0
function syncIdxFromState(): boolean {
  const s = window.history.state as { idx?: number } | null
  if (typeof s?.idx === 'number') {
    currentIdx = s.idx
    return true
  }
  return false
}
if (typeof window !== 'undefined') {
  if (!syncIdxFromState()) window.history.replaceState({ idx: 0 }, '')
  window.addEventListener('hashchange', () => {
    if (!syncIdxFromState()) {
      currentIdx += 1
      window.history.replaceState({ idx: currentIdx }, '')
    }
  })
  // 같은 해시 사이를 오가는 경우 hashchange 가 생기지 않으므로 popstate 로도 동기화
  window.addEventListener('popstate', () => {
    syncIdxFromState()
  })
}

export function goBack(fallback = '/events') {
  if (currentIdx > 0) window.history.back()
  else navigate(fallback, { replace: true })
}

/* ---------------- 이동 확인 (저장하지 않은 변경 등) ---------------- */

type NavGuard = () => Promise<boolean>
let navGuard: NavGuard | null = null

/** 메뉴 링크 이동 전에 확인할 함수를 등록한다. 반환값으로 해제 */
export function setNavigationGuard(fn: NavGuard): () => void {
  navGuard = fn
  return () => {
    if (navGuard === fn) navGuard = null
  }
}

/** 경로 세그먼트를 안전하게 인코딩해 경로를 만든다. 예: pathTo('events', id) */
export function pathTo(...segments: string[]): string {
  return '/' + segments.map((x) => encodeURIComponent(x)).join('/')
}

export function usePath(): string {
  const [path, setPath] = useState(currentPath)
  useEffect(() => {
    const on = () => {
      setPath(currentPath())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return path
}

/** '/events/:id' 형식 패턴 매칭 */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean)
  const a = path.split('?')[0].split('/').filter(Boolean)
  if (p.length !== a.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) {
      try {
        params[p[i].slice(1)] = decodeURIComponent(a[i])
      } catch {
        return null // 잘못된 % 인코딩 → 찾을 수 없는 페이지
      }
    } else if (p[i] !== a[i]) return null
  }
  return params
}

export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return (
    <a
      href={`#${to}`}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e)
        if (e.defaultPrevented || !navGuard) return
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        const guard = navGuard
        void guard().then((ok) => {
          if (ok) {
            if (navGuard === guard) navGuard = null
            navigate(to)
          }
        })
      }}
      {...rest}
    />
  )
}
