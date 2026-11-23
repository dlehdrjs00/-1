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
    window.history.replaceState(null, '', url)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    window.location.hash = path
  }
}

// 앱 안에서 이동한 횟수. 0이면 외부에서 바로 들어온 것이므로 history.back() 대신 fallback 으로 이동
let inAppNavCount = 0
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    inAppNavCount++
  })
}

export function goBack(fallback = '/events') {
  if (inAppNavCount > 0) window.history.back()
  else navigate(fallback, { replace: true })
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
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i])
    else if (p[i] !== a[i]) return null
  }
  return params
}

export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return (
    <a
      href={`#${to}`}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e)
      }}
      {...rest}
    />
  )
}
