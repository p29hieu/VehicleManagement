import { db } from './index'
import { newId, nfc, now } from '../lib/id'
import type {
  ExpenseRecord,
  FuelType,
  FuelEntry,
  ServiceRecord,
  TimelineItem,
  Vehicle,
} from '../domain/types'
import { FUEL_TYPE_SHORT, fuelVerb, quantityUnit } from '../domain/labels'
import { dec2, money } from '../lib/format'

type New<T> = Omit<T, 'id' | 'updated_at'> & { id?: string }

const stamp = <T extends { id?: string }>(row: T) => ({
  ...row,
  id: row.id ?? newId(),
  updated_at: now(),
})

// ── vehicles ────────────────────────────────────────────────────────────────
export const listVehicles = () => db.vehicles.orderBy('name').toArray()
export const getVehicle = (id: string) => db.vehicles.get(id)

export async function saveVehicle(v: New<Vehicle>): Promise<string> {
  const row = stamp({ ...v, name: nfc(v.name) }) as Vehicle
  await db.vehicles.put(row)
  return row.id
}

/** Removing a vehicle removes everything that references it; nothing is left orphaned. */
export async function deleteVehicle(id: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.vehicles, db.fuelEntries, db.services, db.expenses, db.maintenanceRules, db.reminders],
    async () => {
      await Promise.all([
        db.vehicles.delete(id),
        db.fuelEntries.where('vehicle_id').equals(id).delete(),
        db.services.where('vehicle_id').equals(id).delete(),
        db.expenses.where('vehicle_id').equals(id).delete(),
        db.maintenanceRules.where('vehicle_id').equals(id).delete(),
        db.reminders.where('vehicle_id').equals(id).delete(),
      ])
    },
  )
}

// ── records ─────────────────────────────────────────────────────────────────
export async function saveFuelEntry(e: New<FuelEntry>): Promise<string> {
  const row = stamp(e) as FuelEntry
  await db.fuelEntries.put(row)
  return row.id
}
export async function saveService(s: New<ServiceRecord>): Promise<string> {
  const row = stamp({
    ...s,
    items: s.items.map((i) => ({ name: nfc(i.name), amount: i.amount })),
  }) as ServiceRecord
  await db.services.put(row)
  return row.id
}
export async function saveExpense(x: New<ExpenseRecord>): Promise<string> {
  const row = stamp({ ...x, category: nfc(x.category) }) as ExpenseRecord
  await db.expenses.put(row)
  return row.id
}

export const deleteFuelEntry = (id: string) => db.fuelEntries.delete(id)
export const deleteService = (id: string) => db.services.delete(id)
export const deleteExpense = (id: string) => db.expenses.delete(id)

export const getFuelEntry = (id: string) => db.fuelEntries.get(id)
export const getService = (id: string) => db.services.get(id)
export const getExpense = (id: string) => db.expenses.get(id)

// ── timeline ────────────────────────────────────────────────────────────────
function fuelSubtitle(e: FuelEntry, grade: FuelType): string | null {
  const bits: string[] = []
  // Quantity and unit price together are what let a user sanity-check a past fill.
  if (e.quantity != null) {
    const q = `${dec2(e.quantity)} ${quantityUnit(grade)}`
    bits.push(e.unit_price != null ? `${q} × ${money(e.unit_price)}` : q)
  } else if (e.unit_price != null) {
    bits.push(money(e.unit_price))
  }
  bits.push(e.is_full_tank ? 'đổ đầy' : 'đổ một phần')
  if (e.missed_fill) bits.push('có bỏ sót lần đổ')
  if (e.station) bits.push(e.station)
  return bits.join(' · ') || null
}

function serviceSubtitle(s: ServiceRecord): string | null {
  const rest = s.items.slice(1)
  if (!rest.length) return s.workshop
  // Name the other items rather than just counting them — the count is already the badge.
  const named = rest.map((i) => (i.amount != null ? `${i.name} ${money(i.amount)}` : i.name))
  return [named.join(' · '), s.workshop].filter(Boolean).join(' · ')
}

/**
 * Unified, newest-first timeline for one vehicle.
 *
 * `delta_km` is distance since the previous record that carries an odometer reading, walking
 * the chain in ascending order. Records without a reading are skipped rather than treated as
 * zero, because `0`/null means "not recorded", not "the vehicle did not move" (docs §3.3).
 */
export async function buildTimeline(vehicleId: string): Promise<TimelineItem[]> {
  const [fuel, services, expenses, vehicle] = await Promise.all([
    db.fuelEntries.where('vehicle_id').equals(vehicleId).toArray(),
    db.services.where('vehicle_id').equals(vehicleId).toArray(),
    db.expenses.where('vehicle_id').equals(vehicleId).toArray(),
    db.vehicles.get(vehicleId),
  ])

  const items: TimelineItem[] = [
    ...fuel.map<TimelineItem>((e) => {
      // The entry's own grade wins; null means it was filled with the vehicle's default.
      const grade = e.fuel_type ?? vehicle?.fuel_type ?? 'ron95'
      return {
        kind: 'fuel',
        id: e.id,
        vehicle_id: e.vehicle_id,
        date: e.date,
        odometer_km: e.odometer_km,
        total_amount: e.total_amount,
        title: fuelVerb(grade),
        subtitle: fuelSubtitle(e, grade),
        delta_km: null,
        badge: FUEL_TYPE_SHORT[grade],
      }
    }),
    ...services.map<TimelineItem>((s) => ({
      kind: 'service',
      id: s.id,
      vehicle_id: s.vehicle_id,
      date: s.date,
      odometer_km: s.odometer_km,
      total_amount: s.total_amount,
      title: s.items[0]?.name ?? 'Bảo dưỡng',
      subtitle: serviceSubtitle(s),
      delta_km: null,
      badge: s.items.length > 1 ? `${s.items.length} hạng mục` : null,
    })),
    ...expenses.map<TimelineItem>((x) => ({
      kind: 'expense',
      id: x.id,
      vehicle_id: x.vehicle_id,
      date: x.date,
      odometer_km: x.odometer_km,
      total_amount: x.total_amount,
      title: x.category,
      subtitle: x.note,
      delta_km: null,
      badge: null,
    })),
  ]

  // Ascending pass to fill deltas, then reverse for display.
  items.sort((a, b) => a.date.localeCompare(b.date) || (a.odometer_km ?? 0) - (b.odometer_km ?? 0))
  let prevOdo: number | null = null
  for (const it of items) {
    if (it.odometer_km != null && it.odometer_km > 0) {
      if (prevOdo != null) it.delta_km = it.odometer_km - prevOdo
      prevOdo = it.odometer_km
    }
  }
  return items.reverse()
}

/** Latest recorded odometer for a vehicle, used to prefill the next entry. */
export async function latestOdometer(vehicleId: string): Promise<number | null> {
  const rows = await db.fuelEntries.where('vehicle_id').equals(vehicleId).toArray()
  const svc = await db.services.where('vehicle_id').equals(vehicleId).toArray()
  const all = [...rows, ...svc].map((r) => r.odometer_km).filter((n): n is number => n != null && n > 0)
  return all.length ? Math.max(...all) : null
}
