/** vi-VN formatting. Numbers use "." for thousands and "," for decimals. */

const VND = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 })
const DEC1 = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const DEC2 = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const money = (v: number | null | undefined) =>
  v == null ? '—' : `${VND.format(Math.round(v))} đ`

export const km = (v: number | null | undefined) => (v == null ? '—' : `${VND.format(v)} km`)

export const dec1 = (v: number | null | undefined) => (v == null ? '—' : DEC1.format(v))
export const dec2 = (v: number | null | undefined) => (v == null ? '—' : DEC2.format(v))

/** Group thousands while the user types: "500000" -> "500.000". */
export const groupDigits = (raw: string) => {
  const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
  return digits ? VND.format(Number(digits)) : ''
}
export const parseDigits = (raw: string) => {
  const digits = raw.replace(/\D/g, '')
  return digits ? Number(digits) : null
}

const MONTHS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']

/** "02/10/2026" */
export const dateFull = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/** "02 thg 10" — the short form used down the timeline. */
export const dateShort = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${d} thg ${MONTHS[Number(m) - 1]}`
}

/** "THÁNG 10 2026" — the month separator heading. */
export const monthHeading = (iso: string) => {
  const [y, m] = iso.split('-')
  return `THÁNG ${Number(m)} ${y}`
}

export const monthKey = (iso: string) => iso.slice(0, 7)

export const todayISO = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Current local wall clock as `HH:MM` — the default for a record entered right now. */
export const nowHHMM = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
