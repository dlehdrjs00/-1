/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react'
import type { Tone } from '../constants'

/* ---------------- Button ---------------- */

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type BtnSize = 'md' | 'sm'

export function Button({
  variant = 'secondary',
  size = 'md',
  block,
  className = '',
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize; block?: boolean }) {
  return (
    <button
      type={type}
      className={`btn btn--${variant} btn--${size}${block ? ' btn--block' : ''} ${className}`}
      {...rest}
    />
  )
}

/* ---------------- Badge ---------------- */

export function Badge({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={`badge badge--${tone}`} title={title}>
      {children}
    </span>
  )
}

export function SampleBadge() {
  return (
    <span className="badge badge--sample" title="시연용 가상 데이터">
      샘플
    </span>
  )
}

/* ---------------- Card ---------------- */

export function Card({ children, className = '', as = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'article' | 'li' }) {
  const Tag = as
  return <Tag className={`card ${className}`}>{children}</Tag>
}

/* ---------------- Page header ---------------- */

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div className="page-header__text">
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  )
}

/* ---------------- Empty state ---------------- */

export function EmptyState({ icon = '🗂️', title, description, action }: { icon?: string; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty__icon" aria-hidden>
        {icon}
      </div>
      <p className="empty__title">{title}</p>
      {description && <p className="empty__desc">{description}</p>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  )
}

/* ---------------- Notice / Alert ---------------- */

export function Notice({ tone = 'info', children, title }: { tone?: 'info' | 'warning' | 'danger' | 'success'; children: ReactNode; title?: string }) {
  return (
    <div className={`notice notice--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      {title && <strong className="notice__title">{title}</strong>}
      <div>{children}</div>
    </div>
  )
}

/* ---------------- Form field ---------------- */

/**
 * 라벨 + 입력 + 도움말 + 오류. children 에 input/select/textarea 를 넣는다.
 * children 이 함수면 id 를 받아 쓸 수 있다.
 */
export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string
  hint?: ReactNode
  error?: string | null
  required?: boolean
  children: ReactNode | ((id: string, describedBy: string | undefined) => ReactNode)
}) {
  const id = useId()
  const descId = error ? `${id}-err` : hint ? `${id}-hint` : undefined
  return (
    <div className={`field${error ? ' field--error' : ''}`}>
      <label htmlFor={id} className="field__label">
        {label}
        {required && <span className="field__req"> *</span>}
      </label>
      {typeof children === 'function' ? children(id, descId) : children}
      {error ? (
        <p id={`${id}-err`} className="field__error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="field__hint">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/* ---------------- Chip (toggle) ---------------- */

export function Chip({
  active,
  onClick,
  children,
  color,
}: {
  active?: boolean
  onClick?: () => void
  children: ReactNode
  color?: string
}) {
  return (
    <button
      type="button"
      className={`chip${active ? ' chip--active' : ''}`}
      aria-pressed={active}
      onClick={onClick}
      style={color ? ({ '--chip-color': color } as React.CSSProperties) : undefined}
    >
      {children}
    </button>
  )
}

/* ---------------- Modal ---------------- */

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  // onClose 가 매 렌더마다 새 함수여도 포커스를 다시 뺏지 않도록 ref 로 보관.
  // 렌더 중에 ref 를 쓰지 않도록 화면 반영 직후(키 입력 처리 전)에 최신 함수로 바꾼다.
  const onCloseRef = useRef(onClose)
  useLayoutEffect(() => {
    onCloseRef.current = onClose
  })
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    const prevFocus = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      prevFocus?.focus?.()
    }
  }, [open])
  if (!open) return null
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="modal__head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="닫기" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>
  )
}

/* ---------------- Toast ---------------- */

export type ToastKind = 'success' | 'error' | 'info'
export interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

/**
 * 알림 자리는 두 개뿐이다: 오류 하나(error), 성공·안내 하나(note).
 * - 같은 자리에 새 알림이 오면 이전 알림을 바로 바꾼다 (쌓이지 않음, 가장 최근 것만).
 * - 성공·안내 알림은 오류 알림 자리를 건드리지 않으므로, 방금 뜬 오류를 성공 알림이 덮어 가리지 않는다.
 */
export type ToastSlot = 'note' | 'error'
export interface ToastSlots {
  note: ToastItem | null
  error: ToastItem | null
}
export const EMPTY_TOASTS: ToastSlots = { note: null, error: null }
export const TOAST_DURATION_MS: Record<ToastKind, number> = { success: 3000, info: 3000, error: 6000 }

export const toastSlotOf = (kind: ToastKind): ToastSlot => (kind === 'error' ? 'error' : 'note')

/** 새 알림을 제 자리에 넣는다 (같은 자리의 이전 알림은 사라진다) */
export function placeToast(slots: ToastSlots, item: ToastItem): ToastSlots {
  return { ...slots, [toastSlotOf(item.kind)]: item }
}

/** 시간이 다 된 알림을 뺀다. 그 사이 같은 자리에 더 새 알림이 들어왔으면 그대로 둔다. */
export function expireToast(slots: ToastSlots, id: number): ToastSlots {
  if (slots.note?.id === id) return { ...slots, note: null }
  if (slots.error?.id === id) return { ...slots, error: null }
  return slots
}

/** 화면에 그릴 순서. 오류를 마지막에 둔다 (모달이 열려 하나만 보일 때 오류가 남도록, index.css 참고) */
export function visibleToasts(slots: ToastSlots): ToastItem[] {
  return [slots.note, slots.error].filter((t): t is ToastItem => t !== null)
}

const ToastCtx = createContext<((message: string, kind?: ToastKind) => void) | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [slots, setSlots] = useState<ToastSlots>(EMPTY_TOASTS)
  const seq = useRef(0)
  const timers = useRef<Record<ToastSlot, number | undefined>>({ note: undefined, error: undefined })
  const push = useCallback((message: string, kind: ToastKind = 'success') => {
    // id 가 바뀌면 key 가 바뀌어 새 요소로 그려진다 → 같은 문구가 다시 와도 화면 읽기 프로그램이 다시 읽고,
    // 나타나는 애니메이션도 다시 재생된다.
    const id = ++seq.current
    const slot = toastSlotOf(kind)
    window.clearTimeout(timers.current[slot])
    setSlots((s) => placeToast(s, { id, kind, message }))
    timers.current[slot] = window.setTimeout(() => setSlots((s) => expireToast(s, id)), TOAST_DURATION_MS[kind])
  }, [])
  useEffect(() => {
    const t = timers.current
    return () => {
      window.clearTimeout(t.note)
      window.clearTimeout(t.error)
    }
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {visibleToasts(slots).map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <span aria-hidden>{t.kind === 'success' ? '✓' : t.kind === 'error' ? '!' : 'i'}</span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  const t = useContext(ToastCtx)
  if (!t) throw new Error('useToast must be used inside ToastProvider')
  return t
}

/* ---------------- Confirm dialog ---------------- */

interface ConfirmOpts {
  title: string
  message?: ReactNode
  confirmLabel?: string
  danger?: boolean
}

const ConfirmCtx = createContext<((o: ConfirmOpts) => Promise<boolean>) | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null)
  const ask = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), [])
  const close = (v: boolean) => {
    state?.resolve(v)
    setState(null)
  }
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      <Modal
        open={!!state}
        title={state?.title ?? ''}
        onClose={() => close(false)}
        footer={
          <>
            <Button onClick={() => close(false)}>취소</Button>
            <Button variant={state?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
              {state?.confirmLabel ?? '확인'}
            </Button>
          </>
        }
      >
        {state?.message && <div className="confirm-msg">{state.message}</div>}
      </Modal>
    </ConfirmCtx.Provider>
  )
}

export function useConfirm() {
  const c = useContext(ConfirmCtx)
  if (!c) throw new Error('useConfirm must be used inside ConfirmProvider')
  return c
}
