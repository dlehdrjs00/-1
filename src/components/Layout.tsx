import type { ReactNode } from 'react'
import { Link } from '../router'
import { useStore } from '../store/AppStore'
import { Notice } from './ui'

const NAV = [
  { to: '/events', label: '행사', icon: '🎪', match: (p: string) => p.startsWith('/events') },
  { to: '/favorites', label: '관심', icon: '★', match: (p: string) => p.startsWith('/favorites') },
  { to: '/trips', label: '내 여행', icon: '🧳', match: (p: string) => p.startsWith('/trips') },
  { to: '/manage', label: '정보 관리', icon: '⚙️', match: (p: string) => p.startsWith('/manage') },
]

export function Layout({ path, children }: { path: string; children: ReactNode }) {
  const store = useStore()
  const favCount = store.data.favorites.length
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/events" className="brand">
          <span className="brand__mark" aria-hidden>✦</span>
          <span className="brand__name">덕질 여행 플래너</span>
        </Link>
        <nav className="topnav" aria-label="주 메뉴">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className={`topnav__link${n.match(path) ? ' is-active' : ''}`} aria-current={n.match(path) ? 'page' : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="main">
        {store.loadNotice === 'corrupt_reset' && (
          <Notice tone="warning" title="저장된 데이터를 읽지 못했어요">
            브라우저에 저장된 데이터가 손상되어 초기 상태로 시작했습니다. 이전 데이터는 브라우저에 백업해 두었습니다.{' '}
            <button type="button" className="link-btn" onClick={store.dismissLoadNotice}>닫기</button>
          </Notice>
        )}
        {store.saveError && (
          <Notice tone="danger" title="저장 실패">
            브라우저 저장 공간에 저장하지 못했습니다. 저장 공간이 부족하거나 사생활 보호 모드일 수 있습니다. 정보 관리에서 JSON으로 내보내 백업하세요.
          </Notice>
        )}
        {children}
      </main>

      <nav className="bottomnav" aria-label="하단 메뉴">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} className={`bottomnav__link${n.match(path) ? ' is-active' : ''}`} aria-current={n.match(path) ? 'page' : undefined}>
            <span className="bottomnav__icon" aria-hidden>{n.icon}</span>
            <span className="bottomnav__label">{n.label}</span>
            {n.to === '/favorites' && favCount > 0 && <span className="bottomnav__count">{favCount}</span>}
          </Link>
        ))}
      </nav>
    </div>
  )
}
