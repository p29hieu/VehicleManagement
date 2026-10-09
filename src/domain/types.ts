/** Entity types — mirror of docs/03-DATA-MODEL.md §1. */

export const VEHICLE_KINDS = ['car', 'motorcycle', 'ev_car', 'ev_motorcycle', 'truck'] as const
export type VehicleKind = (typeof VEHICLE_KINDS)[number]

/**
 * Id of a row in the user-managed `fuelTypes` table (see domain/fuelTypes.ts).
 * It is a plain string rather than a union because the set is the user's to change:
 * they can add, rename and remove types to suit the vehicles they actually own.
 */
export type FuelType = string

export const ANCHOR_KINDS = ['service', 'completion', 'baseline'] as const
export type AnchorKind = (typeof ANCHOR_KINDS)[number]

/** Plausibility band in L/100km (or kWh/100km for EVs) — docs §3.4.
 *  A car-oriented band would wrongly reject a motorcycle at ~2.3 L/100km. */
export const CONSUMPTION_BAND: Record<VehicleKind, readonly [number, number]> = {
  motorcycle: [1.2, 6],
  car: [4, 25],
  truck: [5, 40],
  ev_car: [8, 35],
  ev_motorcycle: [2, 12],
}

export interface Vehicle {
  id: string
  name: string
  kind: VehicleKind
  make: string | null
  model: string | null
  plate: string | null
  year: number | null
  fuel_type: FuelType
  tank_capacity_l: number | null
  battery_kwh: number | null
  initial_odometer_km: number
  odometer_offset_km: number
  consumption_min: number
  consumption_max: number
  is_active: boolean
  note: string | null
  updated_at: string
}

export interface FuelEntry {
  id: string
  vehicle_id: string
  /** Fuel actually put in on THIS fill. A vehicle can take more than one grade, so the
   *  type belongs to the entry; null falls back to the vehicle's default. */
  fuel_type: FuelType | null
  /** ISO yyyy-mm-dd. Stored as a string so sorting is lexicographic and timezone-free. */
  date: string
  /** Optional `HH:MM`, 24-hour, local wall clock. Null on every record written before the
   *  field existed, and on any the user did not bother to time — the hour is a nicety, and
   *  demanding it would make the fastest path through the form slower. */
  time: string | null
  /** Nullable on purpose. `0` means "not recorded", never "brand new vehicle" — docs §3.3. */
  odometer_km: number | null
  quantity: number | null
  unit_price: number | null
  total_amount: number | null
  /** The single most load-bearing field in the model — docs §3.1. */
  is_full_tank: boolean
  missed_fill: boolean
  station: string | null
  payment_method: string | null
  note: string | null
  updated_at: string
}

/** One line of a service record. `amount` is optional: a user may price each item, or
 *  price nothing and just record the total. The total is always stored either way. */
export interface ServiceItem {
  name: string
  amount: number | null
}

export interface ServiceRecord {
  id: string
  vehicle_id: string
  date: string
  /** See FuelEntry.time. */
  time: string | null
  odometer_km: number | null
  items: ServiceItem[]
  /** Authoritative. Item amounts are optional detail that may not add up to it. */
  total_amount: number | null
  workshop: string | null
  note: string | null
  updated_at: string
}

export interface ExpenseRecord {
  id: string
  vehicle_id: string
  date: string
  /** See FuelEntry.time. */
  time: string | null
  odometer_km: number | null
  category: string
  total_amount: number | null
  note: string | null
  updated_at: string
}

export interface AppSettings {
  id: 'singleton'
  currency: string
  distance_unit: string
  volume_unit: string
  locale: string
  timezone: string
  /** Legacy: prices now live on each row of the `fuelTypes` table. Kept so import files
   *  written before that move still carry their prices across. */
  fuel_prices: Partial<Record<FuelType, number | null>>
  active_vehicle_id: string | null
  updated_at: string
}

/** One row in the unified history timeline. */
export type RecordKind = 'fuel' | 'service' | 'expense'

export interface TimelineItem {
  kind: RecordKind
  id: string
  vehicle_id: string
  date: string
  /** `HH:MM` or null — see FuelEntry.time. */
  time: string | null
  odometer_km: number | null
  total_amount: number | null
  title: string
  subtitle: string | null
  /** Distance since the previous record of the same vehicle — the number users actually want. */
  delta_km: number | null
  /** Short tag shown beside the title: the fuel grade, or the service item count. */
  badge: string | null
  /** Volume put in, and the unit it is measured in ("L" / "kWh"). Null on non-fuel rows,
   *  and on a fill that recorded neither litres nor a unit price to derive them from:
   *  a figure guessed from today's pump price does not belong on a past record. */
  liters: number | null
  unit: string | null
  /** Price per litre/kWh as recorded on the fill itself. */
  unit_price: number | null
  /** Consumption for this fill, in litres (or kWh) per 100 km. Null on non-fuel rows and
   *  whenever the data cannot support a figure. `exact` separates a measurement between
   *  two full tanks from the aggregate estimate. */
  consumption: { l100: number; exact: boolean; outOfBand: boolean } | null
}
