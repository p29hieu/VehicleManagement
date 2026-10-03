import type { ReactNode } from 'react'

interface Props {
  label: string
  hint?: string | undefined
  error?: string | undefined
  htmlFor?: string | undefined
  children: ReactNode
}

export function Field({ label, hint, error, htmlFor, children }: Props) {
  return (
    <div className="field" data-invalid={error ? '' : undefined}>
      <label className="field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="field__msg field__msg--error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="field__msg">{hint}</p>
      ) : null}
    </div>
  )
}
