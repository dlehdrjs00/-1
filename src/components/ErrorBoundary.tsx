import { Component, type ReactNode } from 'react'

/** 화면 하나가 예기치 않게 실패해도 앱 전체가 빈 화면이 되지 않도록 막는다. 경로가 바뀌면 다시 시도. */
export class ErrorBoundary extends Component<{ resetKey: string; children: ReactNode }, { error: Error | null; key: string }> {
  state = { error: null as Error | null, key: this.props.resetKey }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  static getDerivedStateFromProps(props: { resetKey: string }, state: { error: Error | null; key: string }) {
    if (props.resetKey !== state.key) return { error: null, key: props.resetKey }
    return null
  }

  componentDidCatch(error: Error) {
    console.error(error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="empty" role="alert">
        <div className="empty__icon" aria-hidden>⚠️</div>
        <p className="empty__title">화면을 표시하는 중 문제가 생겼어요</p>
        <p className="empty__desc">저장된 데이터는 그대로입니다. 다른 메뉴로 이동하거나 정보 관리에서 JSON으로 백업해 주세요.</p>
        <div className="empty__action">
          <a className="btn btn--primary btn--md" href="#/events">행사 목록으로</a>
          <a className="btn btn--secondary btn--md" href="#/manage">정보 관리</a>
        </div>
      </div>
    )
  }
}
