import type { FuelEntry, Vehicle } from './types'

/**
 * Fuel consumption and refuelling forecast.
 *
 * Implements docs/03-DATA-MODEL.md §3 and §5. Pure functions over plain records, so the
 * arithmetic can be reasoned about and tested without a database or a browser.
 *
 * The reported unit is litres (or kWh) per 100 km, not per km: per-km figures land around
 * 0.085 and are unreadable, and /100km is the convention in Vietnam and in the source data.
 */

/** `0` and `null` both mean "not recorded" — never "a brand new vehicle" (§3.3). */
const odoOf = (e: FuelEntry): number | null =>
  e.odometer_km != null && e.odometer_km > 0 ? e.odometer_km : null

/** Quantity as entered, or derived from money and unit price when both are known. */
export const litersOf = (e: FuelEntry): number | null => {
  if (e.quantity != null && e.quantity > 0) return e.quantity
  if (e.unit_price != null && e.unit_price > 0 && e.total_amount != null && e.total_amount > 0)
    return e.total_amount / e.unit_price
  return null
}

/**
 * Chronological order, with the odometer as the tiebreak.
 *
 * Sorting by odometer first looks more natural, but an entry with no reading has no place
 * in that order and would be shoved to the front, where its fuel is discarded as a leading
 * partial. Date order keeps it between its real neighbours. Odometer regressions are
 * already blocked at entry, and the negative-distance guard below covers a back-dated row.
 */
const byDateThenOdometer = (a: FuelEntry, b: FuelEntry) =>
  a.date.localeCompare(b.date) || (odoOf(a) ?? 0) - (odoOf(b) ?? 0)

export interface Segment {
  fromOdo: number
  toOdo: number
  distance: number
  liters: number
  /** The entry that closes the segment — the row this figure belongs to. */
  entryId: string
  l100: number
}

/**
 * Full-tank to full-tank segments (§3.1).
 *
 * The invariant every correct implementation shares: add the current entry's volume to the
 * accumulator BEFORE testing `is_full_tank`. That is what makes the off-by-one come out
 * right — the opening full fill is excluded (it was burnt by the previous interval), the
 * closing full fill is included, and every partial in between is included.
 */
export function fullTankSegments(entries: readonly FuelEntry[]): Segment[] {
  const sorted = [...entries].sort(byDateThenOdometer)
  const out: Segment[] = []
  let anchorOdo: number | null = null
  let liters = 0

  for (const e of sorted) {
    const odo = odoOf(e)

    // An admitted missing fill makes the run unusable, but the entry still re-anchors so
    // the NEXT run is trustworthy.
    if (e.missed_fill) {
      if (odo != null) anchorOdo = odo
      liters = 0
      continue
    }

    const qty = litersOf(e)
    if (qty != null) liters += qty

    if (!e.is_full_tank) continue
    // A full tank with no odometer cannot close a segment; hold the fuel for the next one.
    if (odo == null) continue

    if (anchorOdo == null) {
      // First anchor. Anything accumulated before it came from leading partials whose
      // starting tank level is unknown, so it is discarded rather than guessed.
      anchorOdo = odo
      liters = 0
      continue
    }

    const distance = odo - anchorOdo
    if (distance <= 0) {
      // Keep the fuel for the next interval instead of throwing it away; just do not
      // emit a segment, and do not move the anchor backwards.
      continue
    }
    if (liters > 0) {
      out.push({ fromOdo: anchorOdo, toOdo: odo, distance, liters, entryId: e.id, l100: (liters / distance) * 100 })
    }
    anchorOdo = odo
    liters = 0
  }
  return out
}

const inBand = (v: Vehicle, l100: number) => l100 >= v.consumption_min && l100 <= v.consumption_max

export interface ConsumptionResult {
  l100: number
  /** true = measured between two full tanks; false = the aggregate estimate of §3.5. */
  exact: boolean
  /** Segments (exact) or fills (estimate) the figure rests on. */
  basis: number
  distanceKm: number
  /** Outside the vehicle class's plausible range: shown, but flagged, never averaged in (§3.3). */
  outOfBand: boolean
}

/**
 * Aggregate estimate for data with no full-tank markers (§3.5).
 *
 * Total fuel bought from the SECOND fill onward over the distance covered. The first
 * fill is excluded because it paid for distance travelled before tracking began. The
 * error is the difference in tank level between the first and last fill spread over the
 * whole distance, so it shrinks as the log grows.
 */
export function aggregateEstimate(entries: readonly FuelEntry[]): ConsumptionResult | null {
  const withOdo = [...entries].filter((e) => odoOf(e) != null).sort(byDateThenOdometer)
  if (withOdo.length < 2) return null

  // Pairwise, not first-to-last: a fill whose volume is unknown must not contribute its
  // distance either, or the figure is dragged down by kilometres no litres account for.
  let liters = 0
  let distance = 0
  let counted = 0
  for (let i = 1; i < withOdo.length; i++) {
    const prev = withOdo[i - 1]!
    const cur = withOdo[i]!
    const q = litersOf(cur)
    if (q == null) continue
    const d = odoOf(cur)! - odoOf(prev)!
    if (d <= 0) continue
    liters += q
    distance += d
    counted++
  }
  if (liters <= 0 || distance <= 0) return null

  return { l100: (liters / distance) * 100, exact: false, basis: counted, distanceKm: distance, outOfBand: false }
}

/** Best available figure for a vehicle: exact when full tanks exist, else the estimate. */
export function averageConsumption(
  entries: readonly FuelEntry[],
  vehicle: Vehicle,
): ConsumptionResult | null {
  // Distance-weighted, never the mean of per-tank ratios — that would weigh a 100 km tank
  // the same as a 400 km one (§3.2).
  const usable = fullTankSegments(entries).filter((s) => inBand(vehicle, s.l100))
  if (usable.length) {
    const distance = usable.reduce((a, s) => a + s.distance, 0)
    const liters = usable.reduce((a, s) => a + s.liters, 0)
    return {
      l100: (liters / distance) * 100, exact: true, basis: usable.length,
      distanceKm: distance, outOfBand: false,
    }
  }
  const est = aggregateEstimate(entries)
  // An implausible estimate is still reported, flagged, rather than hidden — a wrong
  // odometer is something the user needs to see, not something to quietly swallow.
  return est ? { ...est, outOfBand: !inBand(vehicle, est.l100) } : null
}

/** Per-entry figure for the timeline: exact where a segment closes, else the vehicle estimate. */
export function consumptionByEntry(
  entries: readonly FuelEntry[],
  vehicle: Vehicle,
): Map<string, ConsumptionResult> {
  const map = new Map<string, ConsumptionResult>()
  for (const s of fullTankSegments(entries)) {
    if (inBand(vehicle, s.l100))
      map.set(s.entryId, { l100: s.l100, exact: true, basis: 1, distanceKm: s.distance, outOfBand: false })
  }
  if (map.size === 0) {
    // No full-tank markers anywhere: every row carries the same vehicle-level estimate,
    // which is the only defensible figure for this data (§3.5).
    const est = aggregateEstimate(entries)
    if (est) {
      const flagged = { ...est, outOfBand: !inBand(vehicle, est.l100) }
      for (const e of entries) if (odoOf(e) != null) map.set(e.id, flagged)
    }
  }
  return map
}

export interface Forecast {
  dueOdometerKm: number
  dueDate: string
  kmRemaining: number
  daysRemaining: number
  kmPerDay: number
  /** Number of fills the averages rest on. */
  basis: number
}

const MIN_FILLS_FOR_FORECAST = 3

/**
 * When the next fill is due (§5), from the average distance between recent fills and the
 * average distance covered per day. Returns null below the minimum sample rather than
 * printing a number the data cannot support.
 */
export function forecastNextFill(
  entries: readonly FuelEntry[],
  windowSize = 5,
  today = new Date(),
): Forecast | null {
  const sorted = [...entries].filter((e) => odoOf(e) != null).sort(byDateThenOdometer)
  if (sorted.length < MIN_FILLS_FOR_FORECAST) return null

  const recent = sorted.slice(-Math.max(windowSize + 1, 2))
  const intervals: number[] = []
  for (let i = 1; i < recent.length; i++) {
    const d = odoOf(recent[i]!)! - odoOf(recent[i - 1]!)!
    if (d > 0) intervals.push(d)
  }
  if (!intervals.length) return null
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length

  const first = sorted[0]!
  const last = sorted[sorted.length - 1]!
  const days = (Date.parse(last.date) - Date.parse(first.date)) / 86_400_000
  const distance = odoOf(last)! - odoOf(first)!
  if (days <= 0 || distance <= 0) return null
  const kmPerDay = distance / days

  const dueOdometerKm = Math.round(odoOf(last)! + avgInterval)
  const daysToDue = avgInterval / kmPerDay
  const due = new Date(Date.parse(last.date) + daysToDue * 86_400_000)
  const p = (n: number) => String(n).padStart(2, '0')
  const dueDate = `${due.getFullYear()}-${p(due.getMonth() + 1)}-${p(due.getDate())}`

  return {
    dueOdometerKm,
    dueDate,
    kmRemaining: Math.round(avgInterval),
    daysRemaining: Math.round((due.getTime() - today.getTime()) / 86_400_000),
    kmPerDay,
    basis: sorted.length,
  }
}
