import { z } from 'zod'
import { ANCHOR_KINDS, VEHICLE_KINDS } from './types'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải ở dạng yyyy-mm-dd')
const nullableNum = z.number().finite().nullable()
const nullableStr = z.string().nullable()

export const vehicleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(VEHICLE_KINDS),
  make: nullableStr,
  model: nullableStr,
  plate: nullableStr,
  year: z.number().int().nullable(),
  fuel_type: z.string().min(1),
  tank_capacity_l: nullableNum,
  battery_kwh: nullableNum,
  initial_odometer_km: z.number().int().min(0),
  odometer_offset_km: z.number().int(),
  consumption_min: z.number().positive(),
  consumption_max: z.number().positive(),
  is_active: z.boolean(),
  note: nullableStr,
})

export const fuelEntrySchema = z.object({
  id: z.string().min(1),
  vehicle_id: z.string().min(1),
  date: isoDate,
  odometer_km: z.number().int().min(0).nullable(),
  // Optional so files written before per-entry fuel types still import cleanly.
  fuel_type: z.string().min(1).nullable().optional(),
  quantity: nullableNum,
  unit_price: nullableNum,
  total_amount: nullableNum,
  is_full_tank: z.boolean(),
  missed_fill: z.boolean(),
  station: nullableStr,
  payment_method: nullableStr,
  note: nullableStr,
})

export const serviceSchema = z.object({
  id: z.string().min(1),
  vehicle_id: z.string().min(1),
  date: isoDate,
  odometer_km: z.number().int().min(0).nullable(),
  // Accepts the legacy string[] shape and the priced form; normalised below.
  items: z
    .array(
      z.union([
        z.string().min(1),
        z.object({ name: z.string().min(1), amount: z.number().finite().nullable().default(null) }),
      ]),
    )
    .min(1)
    .transform((arr) => arr.map((i) => (typeof i === 'string' ? { name: i, amount: null } : i))),
  total_amount: nullableNum,
  workshop: nullableStr,
  note: nullableStr,
})

export const expenseSchema = z.object({
  id: z.string().min(1),
  vehicle_id: z.string().min(1),
  date: isoDate,
  odometer_km: z.number().int().min(0).nullable(),
  category: z.string().min(1),
  total_amount: nullableNum,
  note: nullableStr,
})

export const maintenanceRuleSchema = z.object({
  id: z.string().min(1),
  vehicle_id: z.string().min(1),
  title: z.string().min(1),
  maintenance_type: z.string().min(1),
  interval_km: z.number().int().positive().nullable(),
  interval_months: z.number().int().positive().nullable(),
  is_active: z.boolean(),
  source: z.string().optional(),
})

export const reminderSchema = z.object({
  id: z.string().min(1),
  vehicle_id: z.string().min(1),
  rule_id: z.string().min(1),
  due_date: isoDate.nullable(),
  due_odometer_km: z.number().int().nullable(),
  anchor_kind: z.enum(ANCHOR_KINDS),
  anchor_date: isoDate,
  anchor_odometer_km: z.number().int(),
  completed_at: z.string().nullable(),
  snoozed_until: z.string().nullable(),
  gcal_event_id: z.string().nullable(),
  status: z.string().min(1),
  source: z.string().optional(),
  note: nullableStr.optional(),
})

/** The canonical interchange format — docs/03-DATA-MODEL.md §7.2.
 *  The same shape serves import, export and the Drive appDataFolder state.json. */
export const importFileSchema = z.object({
  format: z.literal('vehicle-management/import'),
  version: z.literal(1),
  generated_at: z.string().optional(),
  source: z.record(z.string(), z.unknown()).optional(),
  settings: z
    .object({
      currency: z.string().optional(),
      distance_unit: z.string().optional(),
      volume_unit: z.string().optional(),
      locale: z.string().optional(),
      timezone: z.string().optional(),
      fuel_prices: z.record(z.string(), z.number().nullable()).optional(),
    })
    .optional(),
  vehicles: z.array(vehicleSchema),
  fuel_entries: z.array(fuelEntrySchema),
  services: z.array(serviceSchema),
  expenses: z.array(expenseSchema).default([]),
  suggested_maintenance_rules: z.array(maintenanceRuleSchema).default([]),
  suggested_reminders: z.array(reminderSchema).default([]),
  data_quality: z.array(z.record(z.string(), z.unknown())).default([]),
})

export type ImportFile = z.infer<typeof importFileSchema>
