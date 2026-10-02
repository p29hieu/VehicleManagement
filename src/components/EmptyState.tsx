type Kind = 'fuel' | 'service' | 'expense' | 'report'

interface Props {
  kind: Kind
  title: string
  body: string
  /** Which build phase will fill this screen in. Temporary, removed as phases land. */
  hint?: string
}

export function EmptyState({ kind, title, body, hint }: Props) {
  return (
    <section className="empty" data-kind={kind} aria-labelledby="empty-title">
      <span className="empty__rule" aria-hidden="true" />
      <h1 className="empty__title" id="empty-title">
        {title}
      </h1>
      <p className="empty__body">{body}</p>
      {hint ? <p className="empty__hint">{hint}</p> : null}
    </section>
  )
}
