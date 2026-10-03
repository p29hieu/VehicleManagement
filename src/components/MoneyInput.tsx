import { groupDigits, parseDigits } from '../lib/format'

interface Props {
  id?: string | undefined
  value: number | null
  onChange: (v: number | null) => void
  placeholder?: string | undefined
  big?: boolean | undefined
  suffix?: string | undefined
}

/**
 * Digits only, grouped as the user types ("500000" renders "500.000").
 * inputMode="numeric" brings up the phone's number pad; the bespoke pad with a `000`
 * key arrives in P2 along with the rest of the sub-10-second entry flow.
 */
export function MoneyInput({ id, value, onChange, placeholder, big, suffix = 'đ' }: Props) {
  return (
    <div className={`money${big ? ' money--big' : ''}`}>
      <input
        id={id}
        className="money__input num"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value == null ? '' : groupDigits(String(value))}
        placeholder={placeholder ?? '0'}
        onChange={(e) => onChange(parseDigits(e.target.value))}
      />
      <span className="money__suffix" aria-hidden="true">
        {suffix}
      </span>
    </div>
  )
}
