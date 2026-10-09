import { db } from './index'
import { newId, nfc, now } from '../lib/id'
import type {
  ExpenseRecord,
  FuelEntry,
  ServiceRecord,
  TimelineItem,
  Vehicle,
} from '../domain/types'
import {
  resolveFuelType,
  unitLabel,
  verbForUnit,
  type FuelTypeRow,
} from '../domain/fuelTypes'
import { money } from '../lib/format'
import { consumptionByEntry, litersOf } from '../domain/consumption'

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

/**
 * Remembers that a row is gone.
 *
 * Always written in the same transaction as the delete itself. A delete that is not
 * remembered is indistinguishable from "this device has not seen that row yet", so the
 * next sync treats the other device's copy as news and brings the row back.
 */
async function tombstone(table: string, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return
  const deleted_at = now()
  await db.tombstones.bulkPut(ids.map((id) => ({ table, id, deleted_at })))
}

/** Removing a vehicle removes everything that references it; nothing is left orphaned. */
export async function deleteVehicle(id: string): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.vehicles,
      db.fuelEntries,
      db.services,
      db.expenses,
      db.maintenanceRules,
      db.reminders,
      db.tombstones,
    ],
    async () => {
      // Read the ids before the rows go, or there is nothing left to tombstone.
      const [fuel, services, expenses, rules, reminders] = await Promise.all([
        db.fuelEntries.where('vehicle_id').equals(id).primaryKeys(),
        db.services.where('vehicle_id').equals(id).primaryKeys(),
        db.expenses.where('vehicle_id').equals(id).primaryKeys(),
        db.maintenanceRules.where('vehicle_id').equals(id).primaryKeys(),
        db.reminders.where('vehicle_id').equals(id).primaryKeys(),
      ])

      await Promise.all([
        db.vehicles.delete(id),
        db.fuelEntries.where('vehicle_id').equals(id).delete(),
        db.services.where('vehicle_id').equals(id).delete(),
        db.expenses.where('vehicle_id').equals(id).delete(),
        db.maintenanceRules.where('vehicle_id').equals(id).delete(),
        db.reminders.where('vehicle_id').equals(id).delete(),
      ])

      await Promise.all([
        tombstone('vehicles', [id]),
        tombstone('fuelEntries', fuel),
        tombstone('services', services),
        tombstone('expenses', expenses),
        tombstone('maintenanceRules', rules),
        tombstone('reminders', reminders),
      ])
    },
  )
}

// ── fuel types ──────────────────────────────────────────────────────────────
export const listFuelTypes = () => db.fuelTypes.orderBy('sort').toArray()

export async function listActiveFuelTypes(): Promise<FuelTypeRow[]> {
  return (await listFuelTypes()).filter((f) => !f.archived)
}

/** `updated_at` is stamped here rather than taken from the caller: a timestamp the caller
 *  invents would only be overwritten, and one it forgets would break the merge. */
export async function saveFuelType(row: Omit<FuelTypeRow, 'updated_at'>): Promise<void> {
  await db.fuelTypes.put({
    ...row,
    name: nfc(row.name),
    short: nfc(row.short),
    updated_at: now(),
  })
}

/** How many records point at this type. Deleting one that is in use would orphan them. */
export async function fuelTypeUsage(id: string): Promise<{ vehicles: number; entries: number }> {
  const [vehicles, entries] = await Promise.all([
    db.vehicles.filter((v) => v.fuel_type === id).count(),
    db.fuelEntries.where('fuel_type').equals(id).count(),
  ])
  return { vehicles, entries }
}

/**
 * Removes a fuel type only when nothing references it. A type that history depends on is
 * archived instead: it disappears from the pickers while old rows keep rendering.
 */
export async function deleteFuelType(id: string): Promise<{ ok: true } | { ok: false; usage: { vehicles: number; entries: number } }> {
  const usage = await fuelTypeUsage(id)
  if (usage.vehicles > 0 || usage.entries > 0) return { ok: false, usage }
  await db.transaction('rw', [db.fuelTypes, db.tombstones], async () => {
    await db.fuelTypes.delete(id)
    await tombstone('fuelTypes', [id])
  })
  return { ok: true }
}

export async function setFuelTypeArchived(id: string, archived: boolean): Promise<void> {
  await db.fuelTypes.update(id, { archived, updated_at: now() })
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

/** Each of these pairs the delete with its tombstone inside one transaction, so a row can
 *  never be gone locally while the other devices still believe in it. */
const deleteRecord = (table: 'fuelEntries' | 'services' | 'expenses', id: string) =>
  db.transaction('rw', [db[table], db.tombstones], async () => {
    await db[table].delete(id)
    await tombstone(table, [id])
  })

export const deleteFuelEntry = (id: string) => deleteRecord('fuelEntries', id)
export const deleteService = (id: string) => deleteRecord('services', id)
export const deleteExpense = (id: string) => deleteRecord('expenses', id)

export const getFuelEntry = (id: string) => db.fuelEntries.get(id)
export const getService = (id: string) => db.services.get(id)
export const getExpense = (id: string) => db.expenses.get(id)

// ── timeline ────────────────────────────────────────────────────────────────
/**
 * The tags on a fill — what the numbers cannot say.
 *
 * Quantity and unit price used to live here too. They are now facts on the row, each with
 * its own label, and repeating them here put the same two figures on screen twice within
 * three lines — with the second copy being the one that got truncated.
 */
function fuelSubtitle(e: FuelEntry): string | null {
  const bits: string[] = []
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
  const [fuel, services, expenses, vehicle, fuelTypes] = await Promise.all([
    db.fuelEntries.where('vehicle_id').equals(vehicleId).toArray(),
    db.services.where('vehicle_id').equals(vehicleId).toArray(),
    db.expenses.where('vehicle_id').equals(vehicleId).toArray(),
    db.vehicles.get(vehicleId),
    listFuelTypes(),
  ])

  // One pass over the whole fuel log; each row then reads its own figure out of the map.
  const priceFor = (id: string | null) =>
    fuelTypes.find((t) => t.id === (id ?? vehicle?.fuel_type))?.price ?? null
  const consumption = vehicle ? consumptionByEntry(fuel, vehicle, priceFor) : new Map()

  const items: TimelineItem[] = [
    ...fuel.map<TimelineItem>((e) => {
      // The entry's own grade wins; null means it was filled with the vehicle's default.
      // A grade the user has since deleted still renders, as a visible placeholder.
      const grade = resolveFuelType(e.fuel_type, fuelTypes, vehicle?.fuel_type)
      // Litres as RECORDED, or derived from this fill's own money and price. Today's pump
      // price is deliberately not used as a fallback here: the row is a statement about a
      // past purchase, and a figure from a price that has since moved would be fiction.
      const liters = litersOf(e, null)
      return {
        kind: 'fuel',
        id: e.id,
        vehicle_id: e.vehicle_id,
        date: e.date,
        time: e.time,
        odometer_km: e.odometer_km,
        total_amount: e.total_amount,
        title: verbForUnit(grade.unit),
        subtitle: fuelSubtitle(e),
        delta_km: null,
        badge: grade.short,
        liters,
        unit: unitLabel(grade.unit),
        unit_price: e.unit_price,
        consumption: (() => {
          const c = consumption.get(e.id)
          return c ? { l100: c.l100, exact: c.exact, outOfBand: c.outOfBand } : null
        })(),
      }
    }),
    ...services.map<TimelineItem>((s) => ({
      kind: 'service',
      id: s.id,
      vehicle_id: s.vehicle_id,
      date: s.date,
      time: s.time,
      odometer_km: s.odometer_km,
      total_amount: s.total_amount,
      title: s.items[0]?.name ?? 'Bảo dưỡng',
      subtitle: serviceSubtitle(s),
      delta_km: null,
      badge: s.items.length > 1 ? `${s.items.length} hạng mục` : null,
      liters: null,
      unit: null,
      unit_price: null,
      consumption: null,
    })),
    ...expenses.map<TimelineItem>((x) => ({
      kind: 'expense',
      id: x.id,
      vehicle_id: x.vehicle_id,
      date: x.date,
      time: x.time,
      odometer_km: x.odometer_km,
      total_amount: x.total_amount,
      title: x.category,
      subtitle: x.note,
      delta_km: null,
      badge: null,
      liters: null,
      unit: null,
      unit_price: null,
      consumption: null,
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
