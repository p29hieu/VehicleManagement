import Dexie, { type Table } from 'dexie'
import { DEFAULT_FUEL_TYPES, type FuelTypeRow } from '../domain/fuelTypes'
import type {
  AppSettings,
  ExpenseRecord,
  FuelEntry,
  ServiceRecord,
  Vehicle,
} from '../domain/types'

/**
 * Every GitHub Pages project under one account shares a single origin, and therefore a
 * single IndexedDB and localStorage namespace. Names here are deliberately distinctive so
 * a sibling project on p29hieu.github.io cannot collide with them.
 */
export const DB_NAME = 'vehicle-management'
export const STORAGE_PREFIX = 'vm:'

export interface MaintenanceRuleRow {
  id: string
  vehicle_id: string
  title: string
  maintenance_type: string
  interval_km: number | null
  interval_months: number | null
  is_active: boolean
  source?: string | undefined
}

export interface ReminderRow {
  id: string
  vehicle_id: string
  rule_id: string
  due_date: string | null
  due_odometer_km: number | null
  anchor_kind: string
  anchor_date: string
  anchor_odometer_km: number
  completed_at: string | null
  snoozed_until: string | null
  gcal_event_id: string | null
  status: string
  source?: string | undefined
  note?: string | null | undefined
}

class VehicleManagementDB extends Dexie {
  vehicles!: Table<Vehicle, string>
  fuelEntries!: Table<FuelEntry, string>
  services!: Table<ServiceRecord, string>
  expenses!: Table<ExpenseRecord, string>
  settings!: Table<AppSettings, string>
  maintenanceRules!: Table<MaintenanceRuleRow, string>
  reminders!: Table<ReminderRow, string>
  fuelTypes!: Table<FuelTypeRow, string>

  constructor() {
    super(DB_NAME)
    this.version(1).stores({
      vehicles: 'id, is_active, name',
      // The compound [vehicle_id+date] index is what the timeline reads; [vehicle_id+odometer_km]
      // is what the consumption engine will walk in P3, which sorts by odometer, not date.
      fuelEntries: 'id, vehicle_id, date, [vehicle_id+date], [vehicle_id+odometer_km]',
      services: 'id, vehicle_id, date, [vehicle_id+date]',
      expenses: 'id, vehicle_id, date, [vehicle_id+date], category',
      settings: 'id',
      maintenanceRules: 'id, vehicle_id',
      reminders: 'id, vehicle_id, rule_id, status',
    })

    // v2: a vehicle can take more than one fuel grade, so the grade moved onto the entry;
    // and service items carry an optional per-item price.
    this.version(2)
      .stores({
        fuelEntries:
          'id, vehicle_id, date, fuel_type, [vehicle_id+date], [vehicle_id+odometer_km]',
      })
      .upgrade(async (tx) => {
        // Existing fills predate the field. null means "use the vehicle's default grade",
        // which is exactly what they were before, so no data is invented here.
        await tx
          .table('fuelEntries')
          .toCollection()
          .modify((e: { fuel_type?: unknown }) => {
            if (e.fuel_type === undefined) e.fuel_type = null
          })

        // items: string[] -> { name, amount }[]. Amount is null because the old shape
        // never carried per-item prices; the record's total is untouched.
        await tx
          .table('services')
          .toCollection()
          .modify((s: { items?: unknown }) => {
            if (Array.isArray(s.items)) {
              s.items = s.items.map((i) => (typeof i === 'string' ? { name: i, amount: null } : i))
            }
          })
      })

    // v3: fuel types become user data. The built-ins keep their old ids, so every record
    // written before this table existed still resolves without being rewritten.
    this.version(3)
      .stores({ fuelTypes: 'id, sort, archived' })
      .upgrade(async (tx) => {
        const table = tx.table('fuelTypes')
        if ((await table.count()) > 0) return

        // Carry the prices across from where they used to live.
        const settings = (await tx.table('settings').get('singleton')) as
          | { fuel_prices?: Record<string, number | null> }
          | undefined
        const prices = settings?.fuel_prices ?? {}

        await table.bulkAdd(
          DEFAULT_FUEL_TYPES.map((f) => ({ ...f, price: prices[f.id] ?? null })),
        )
      })
  }
}

export const db = new VehicleManagementDB()

/** Seed the built-in fuel types on a database that was created fresh (no upgrade runs). */
db.on('ready', async () => {
  if ((await db.fuelTypes.count()) === 0) {
    await db.fuelTypes.bulkAdd(DEFAULT_FUEL_TYPES.map((f) => ({ ...f })))
  }
})

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'singleton',
  currency: 'VND',
  distance_unit: 'km',
  volume_unit: 'L',
  locale: 'vi-VN',
  timezone: 'Asia/Ho_Chi_Minh',
  fuel_prices: {},
  active_vehicle_id: null,
  updated_at: new Date().toISOString(),
}

export async function getSettings(): Promise<AppSettings> {
  return (await db.settings.get('singleton')) ?? DEFAULT_SETTINGS
}

export async function patchSettings(patch: Partial<AppSettings>): Promise<void> {
  const current = await getSettings()
  await db.settings.put({ ...current, ...patch, id: 'singleton', updated_at: new Date().toISOString() })
}

/** Wipes every table. Used by "xoá toàn bộ dữ liệu" and by a replace-mode import. */
export async function clearAllData(): Promise<void> {
  await db.transaction(
    'rw',
    [db.vehicles, db.fuelEntries, db.services, db.expenses, db.maintenanceRules, db.reminders, db.settings, db.fuelTypes],
    async () => {
      await Promise.all([
        db.vehicles.clear(),
        db.fuelEntries.clear(),
        db.services.clear(),
        db.expenses.clear(),
        db.maintenanceRules.clear(),
        db.reminders.clear(),
        db.settings.clear(),
      ])
      // Wiping everything must not leave the app with no fuel types to pick from.
      await db.fuelTypes.clear()
      await db.fuelTypes.bulkAdd(DEFAULT_FUEL_TYPES.map((f) => ({ ...f })))
    },
  )
}
