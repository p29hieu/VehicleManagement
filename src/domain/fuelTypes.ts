import { PRE_SYNC_EPOCH } from '../lib/id'

/**
 * Fuel types are user data, not a fixed enum.
 *
 * Built-ins ship with stable ids ('ron95', …) so records written before this table existed
 * still resolve. Anything the user adds gets a generated id. Nothing is hard-coded about
 * the set — it can be added to, renamed, re-priced, hidden or removed.
 */

export type FuelUnit = 'liter' | 'kwh'

export interface FuelTypeRow {
  id: string
  name: string
  /** Compact form for the timeline badge, where the full name will not fit. */
  short: string
  unit: FuelUnit
  /** Last price used for this type; seeds the next fill of the same type. */
  price: number | null
  sort: number
  /** Kept so historical records still render, but hidden from the pickers. */
  archived: boolean
  /** Shipped by default. Only affects the hint shown on delete, never the rules. */
  builtin: boolean
  /** Added in Dexie v4. Fuel types are user data and therefore sync, and a per-row merge
   *  needs a per-row timestamp to order on — see sync/merge.ts. */
  updated_at: string
}

/** The built-ins all carry PRE_SYNC_EPOCH so two devices seeding them independently write
 *  byte-identical rows, leaving the merge with nothing to resolve. */
export const DEFAULT_FUEL_TYPES: readonly FuelTypeRow[] = [
  { id: 'ron95', name: 'Xăng RON 95', short: 'RON 95', unit: 'liter', price: null, sort: 10, archived: false, builtin: true, updated_at: PRE_SYNC_EPOCH },
  { id: 'e5ron92', name: 'Xăng E5 RON 92', short: 'E5', unit: 'liter', price: null, sort: 20, archived: false, builtin: true, updated_at: PRE_SYNC_EPOCH },
  { id: 'diesel', name: 'Dầu Diesel', short: 'Diesel', unit: 'liter', price: null, sort: 30, archived: false, builtin: true, updated_at: PRE_SYNC_EPOCH },
  { id: 'electric', name: 'Điện', short: 'Điện', unit: 'kwh', price: null, sort: 40, archived: false, builtin: true, updated_at: PRE_SYNC_EPOCH },
]

export const unitLabel = (u: FuelUnit) => (u === 'kwh' ? 'kWh' : 'lít')
export const priceUnitLabel = (u: FuelUnit) => (u === 'kwh' ? 'đ/kWh' : 'đ/lít')

/** "Đổ xăng" vs "Sạc điện" — the wording follows the fuel, per docs/02-UIUX.md §8. */
export const verbForUnit = (u: FuelUnit) => (u === 'kwh' ? 'Sạc điện' : 'Đổ xăng')

/**
 * A record may point at a type the user has since deleted. Rather than crash or silently
 * drop the row, render a placeholder that keeps the id visible.
 */
export const unknownFuelType = (id: string): FuelTypeRow => ({
  id,
  name: `Loại đã xoá (${id})`,
  short: '?',
  unit: 'liter',
  price: null,
  sort: 9999,
  archived: true,
  builtin: false,
  // Never persisted — this is a placeholder rendered for a type the user has deleted.
  updated_at: PRE_SYNC_EPOCH,
})

export const resolveFuelType = (
  id: string | null | undefined,
  rows: readonly FuelTypeRow[],
  fallbackId?: string | null,
): FuelTypeRow => {
  const wanted = id ?? fallbackId
  if (!wanted) return rows[0] ?? unknownFuelType('—')
  return rows.find((r) => r.id === wanted) ?? unknownFuelType(wanted)
}

/** Slug from the name, so ids stay readable; collisions get a numeric suffix. */
export function makeFuelTypeId(name: string, taken: readonly string[]): string {
  const base =
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24) || 'nhien-lieu'
  if (!taken.includes(base)) return base
  for (let i = 2; ; i++) if (!taken.includes(`${base}-${i}`)) return `${base}-${i}`
}

/**
 * Options for a picker: everything still active, plus the row currently selected even if
 * it has been archived. Without the second part, opening an old record would show an empty
 * selector and quietly drop its fuel type on save.
 */
export function pickerOptions(
  all: readonly FuelTypeRow[],
  selectedId: string | null | undefined,
): FuelTypeRow[] {
  const active = all.filter((f) => !f.archived)
  if (!selectedId || active.some((f) => f.id === selectedId)) return active
  const current = all.find((f) => f.id === selectedId)
  return current ? [...active, current] : active
}
