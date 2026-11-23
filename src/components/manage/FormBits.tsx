import { useId, type ReactNode } from 'react'

/**
 * 칩·라디오처럼 여러 컨트롤을 묶는 입력 그룹 (fieldset + legend).
 * 단일 입력은 ui.tsx 의 Field 를 쓴다. 스타일은 Field 와 같은 클래스를 재사용.
 */
export function FieldSet({
  legend,
  required,
  hint,
  error,
  children,
}: {
  legend: string
  required?: boolean
  hint?: ReactNode
  error?: string | null
  children: (describedBy: string | undefined) => ReactNode
}) {
  const id = useId()
  const descId = error ? `${id}-err` : hint ? `${id}-hint` : undefined
  return (
    <fieldset className={`field ef-fieldset${error ? ' field--error' : ''}`} aria-describedby={descId}>
      <legend className="field__label ef-fieldset__legend">
        {legend}
        {required && <span className="field__req"> *</span>}
      </legend>
      {children(descId)}
      {error ? (
        <p id={`${id}-err`} className="field__error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="field__hint">
          {hint}
        </p>
      ) : null}
    </fieldset>
  )
}

/** 폼 안의 카드형 구역 */
export function FormSection({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  const id = useId()
  return (
    <section className="card ef-section" aria-labelledby={id}>
      <div className="ef-section__head">
        <h2 id={id} className="ef-section__title">
          {title}
        </h2>
        {description && <p className="field__hint">{description}</p>}
      </div>
      <div className="stack">{children}</div>
    </section>
  )
}
