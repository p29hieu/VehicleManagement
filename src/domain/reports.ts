import type { ExpenseRecord, FuelEntry, ServiceRecord } from './types'

/**
 * Cost aggregation for the reports screen. Pure functions, no database.
 *
 * Two different fuel totals live here on purpose, per docs/03-DATA-MODEL.md §4:
 * total ownership cost counts every fill, while cost-per-kilometre counts fills from the
 * second onward, because the first one paid for distance covered before tracking began.
 */

const odoOf = (o: number | null | undefined): number | null => (o != null && o > 0 ? o : null)
const amount = (v: number | null | undefined) => v ?? 0

export interface CostSummary {
  fuelTotal: number
  /** Fuel excluding the first fill — the figure that belongs over distance. */
  fuelAfterFirst: number
  serviceTotal: number
  expenseTotal: number
  total: number
  firstDate: string | null
  lastDate: string | null
  days: number
  distanceKm: number
  perDay: number | null
  perKm: number | null
  fuelPerKm: number | null
  recordCount: number
}

export function costSummary(
  fuel: readonly FuelEntry[],
  services: readonly ServiceRecord[],
  expenses: readonly ExpenseRecord[],
): CostSummary {
  const byDate = [...fuel].sort((a, b) => a.date.localeCompare(b.date))
  const fuelTotal = byDate.reduce((a, e) => a + amount(e.total_amount), 0)
  const fuelAfterFirst = byDate.slice(1).reduce((a, e) => a + amount(e.total_amount), 0)
  const serviceTotal = services.reduce((a, s) => a + amount(s.total_amount), 0)
  const expenseTotal = expenses.reduce((a, x) => a + amount(x.total_amount), 0)
  const total = fuelTotal + serviceTotal + expenseTotal

  // The odometer chain comes from fuel entries only: a service record with a mistyped
  // reading would otherwise distort every per-kilometre figure (docs §4).
  const odos = byDate.map((e) => odoOf(e.odometer_km)).filter((n): n is number => n != null)
  const distanceKm = odos.length >= 2 ? Math.max(...odos) - Math.min(...odos) : 0

  // The window spans every kind of record, not just fills.
  const dates = [
    ...fuel.map((e) => e.date),
    ...services.map((s) => s.date),
    ...expenses.map((x) => x.date),
  ].sort()
  const firstDate = dates[0] ?? null
  const lastDate = dates[dates.length - 1] ?? null
  const days =
    firstDate && lastDate
      ? Math.round((Date.parse(lastDate) - Date.parse(firstDate)) / 86_400_000)
      : 0

  return {
    fuelTotal, fuelAfterFirst, serviceTotal, expenseTotal, total,
    firstDate, lastDate, days, distanceKm,
    perDay: days > 0 ? total / days : null,
    perKm: distanceKm > 0 ? total / distanceKm : null,
    fuelPerKm: distanceKm > 0 ? fuelAfterFirst / distanceKm : null,
    recordCount: fuel.length + services.length + expenses.length,
  }
}

export interface MonthBucket {
  month: string
  fuel: number
  service: number
  expense: number
  total: number
}

/** Cost by calendar month, oldest first, with empty months in between filled in. */
export function monthlyCosts(
  fuel: readonly FuelEntry[],
  services: readonly ServiceRecord[],
  expenses: readonly ExpenseRecord[],
): MonthBucket[] {
  const buckets = new Map<string, MonthBucket>()
  const add = (date: string, key: 'fuel' | 'service' | 'expense', v: number) => {
    const m = date.slice(0, 7)
    const b = buckets.get(m) ?? { month: m, fuel: 0, service: 0, expense: 0, total: 0 }
    b[key] += v
    b.total += v
    buckets.set(m, b)
  }
  for (const e of fuel) add(e.date, 'fuel', amount(e.total_amount))
  for (const s of services) add(s.date, 'service', amount(s.total_amount))
  for (const x of expenses) add(x.date, 'expense', amount(x.total_amount))
  if (buckets.size === 0) return []

  const months = [...buckets.keys()].sort()
  const out: MonthBucket[] = []
  // A month with no spending is still a month; leaving gaps would make the bars lie
  // about the shape of the series.
  const [sy, sm] = months[0]!.split('-').map(Number) as [number, number]
  const [ey, em] = months[months.length - 1]!.split('-').map(Number) as [number, number]
  for (let y = sy, m = sm; y < ey || (y === ey && m <= em); m === 12 ? ((y += 1), (m = 1)) : (m += 1)) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    out.push(buckets.get(key) ?? { month: key, fuel: 0, service: 0, expense: 0, total: 0 })
  }
  return out
}
