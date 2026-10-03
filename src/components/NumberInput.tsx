interface Props {
  id?: string | undefined
  value: number | null
  onChange: (v: number | null) => void
  placeholder?: string | undefined
  suffix?: string | undefined
  step?: string | undefined
  /** Tap-to-accept suggestion shown beside the field (e.g. a predicted odometer). */
  suggestion?: { value: number; label: string } | undefined
}

export function NumberInput({ id, value, onChange, placeholder, suffix, step, suggestion }: Props) {
  const parse = (raw: string) => {
    const cleaned = raw.replace(',', '.').replace(/[^\d.]/g, '')
    if (!cleaned) return null
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : null
  }
  return (
    <div className="numfield">
      <div className="numfield__row">
        <input
          id={id}
          className="numfield__input num"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          step={step}
          value={value == null ? '' : String(value)}
          placeholder={placeholder ?? ''}
          onChange={(e) => onChange(parse(e.target.value))}
        />
        {suffix ? <span className="numfield__suffix">{suffix}</span> : null}
      </div>
      {suggestion ? (
        <button type="button" className="numfield__suggest" onClick={() => onChange(suggestion.value)}>
          {suggestion.label}
        </button>
      ) : null}
    </div>
  )
}
