type Kind = 'fuel' | 'service' | 'expense' | 'report'

interface Props {
  kind: Kind
  title: string
  body: string
  /** Which build phase will fill this screen in. Temporary, removed as phases land. */
  hint?: string | undefined
  action?: { label: string; onClick: () => void } | undefined
}

export function EmptyState({ kind, title, body, hint, action }: Props) {
  return (
    <section className="empty" data-kind={kind} aria-labelledby="empty-title">
      <span className="empty__rule" aria-hidden="true" />
      <h1 className="empty__title" id="empty-title">
        {title}
      </h1>
      <p className="empty__body">{body}</p>
      {action ? (
        <button type="button" className="btn btn--primary empty__action" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
      {hint ? <p className="empty__hint">{hint}</p> : null}
    </section>
  )
}
