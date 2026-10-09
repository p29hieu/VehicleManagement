/**
 * Time windows for the history screen.
 *
 * Dates stay the plain `yyyy-mm-dd` strings the records carry, and are compared as
 * strings. No Date objects in the comparison path: a record dated 2026-10-07 means that
 * calendar day wherever the user happens to be, and parsing it into an instant would shift
 * it by a timezone the data never had.
 */

export type PeriodId = '1m' | '3m' | '6m' | 'all' | 'custom'

export interface DateRange {
  /** Inclusive `yyyy-mm-dd`. Null means unbounded on that side. */
  from: string | null
  to: string | null
}

export const PERIOD_LABEL: Record<PeriodId, string> = {
  '1m': '1 tháng',
  '3m': '3 tháng',
  '6m': '6 tháng',
  all: 'Tất cả',
  custom: 'Tuỳ chọn',
}

export const PERIOD_ORDER: readonly PeriodId[] = ['1m', '3m', '6m', 'all', 'custom']

const pad = (n: number) => String(n).padStart(2, '0')

export const toISODate = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Days in a calendar month; `month` is 1-indexed. */
const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate()

/**
 * `months` calendar months before `iso`, clamped to the end of the target month.
 *
 * The clamp is the entire reason this is not `setMonth(m - n)`. That rolls 31 March back
 * to 3 March, because February has no 31st and Date quietly overflows into the next month
 * — so "1 tháng" would skip a whole month and silently drop records.
 */
export function monthsBefore(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const total = y * 12 + (m - 1) - months
  const year = Math.floor(total / 12)
  const month = (total % 12) + 1
  return `${year}-${pad(month)}-${pad(Math.min(d, daysInMonth(year, month)))}`
}

/**
 * Turns a preset into a concrete range.
 *
 * `custom` is handed straight back. Those two dates are the user's, and silently
 * "correcting" a from-after-to would hide a mistake they can see and fix themselves.
 */
export function periodRange(id: PeriodId, today: string, custom?: DateRange): DateRange {
  switch (id) {
    case 'all':
      return { from: null, to: null }
    case 'custom':
      return { from: custom?.from ?? null, to: custom?.to ?? null }
    case '1m':
      return { from: monthsBefore(today, 1), to: today }
    case '3m':
      return { from: monthsBefore(today, 3), to: today }
    case '6m':
      return { from: monthsBefore(today, 6), to: today }
  }
}

/** Both ends inclusive: a record dated exactly on the boundary belongs to the window. */
export const inRange = (date: string, { from, to }: DateRange): boolean =>
  (from == null || date >= from) && (to == null || date <= to)

export const withinPeriod = <T extends { date: string }>(
  rows: readonly T[],
  range: DateRange,
): T[] => rows.filter((r) => inRange(r.date, range))
