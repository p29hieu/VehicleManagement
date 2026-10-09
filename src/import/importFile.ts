import { clearAllData, db, forgetTombstones, patchSettings } from '../db'
import { importFileSchema, type ImportFile } from '../domain/schema'
import { DEFAULT_FUEL_TYPES, type FuelTypeRow } from '../domain/fuelTypes'
import { nfc, now } from '../lib/id'
import { dateFull, todayISO } from '../lib/format'

export interface ImportIssue {
  severity: 'error' | 'warning'
  ref: string
  message: string
}

export interface ImportReport {
  ok: boolean
  counts: { vehicles: number; fuel: number; services: number; expenses: number; rules: number; reminders: number }
  issues: ImportIssue[]
  /** data_quality entries carried by the file itself, surfaced after a successful import. */
  dataQuality: Array<Record<string, unknown>>
}

export interface ImportOptions {
  /** 'replace' wipes every table first; 'merge' upserts by id. */
  mode: 'replace' | 'merge'
  includeSuggestions: boolean
}

/** Shape + type validation, then the semantic rules of docs/03-DATA-MODEL.md §7.4. */
export function validateImport(raw: unknown): { file: ImportFile | null; issues: ImportIssue[] } {
  const parsed = importFileSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      file: null,
      issues: parsed.error.issues.map((i) => ({
        severity: 'error' as const,
        ref: i.path.join('.') || '(gốc)',
        message: i.message,
      })),
    }
  }

  const f = parsed.data
  const issues: ImportIssue[] = []
  const err = (ref: string, message: string) => issues.push({ severity: 'error', ref, message })
  const warn = (ref: string, message: string) => issues.push({ severity: 'warning', ref, message })

  const vehicleIds = new Set(f.vehicles.map((v) => v.id))
  const dup = (ids: string[], label: string) => {
    const seen = new Set<string>()
    for (const id of ids) {
      if (seen.has(id)) err(`${label}.${id}`, `Trùng id "${id}"`)
      seen.add(id)
    }
  }
  dup(f.vehicles.map((v) => v.id), 'vehicles')
  dup(f.fuel_entries.map((e) => e.id), 'fuel_entries')
  dup(f.services.map((s) => s.id), 'services')
  dup(f.expenses.map((x) => x.id), 'expenses')

  for (const v of f.vehicles) {
    if (v.consumption_min >= v.consumption_max)
      err(`vehicles.${v.id}`, 'consumption_min phải nhỏ hơn consumption_max')
  }

  const today = todayISO()
  const checkRow = (ref: string, vehicleId: string, date: string) => {
    if (!vehicleIds.has(vehicleId)) err(ref, `vehicle_id "${vehicleId}" không tồn tại`)
    if (date > today) err(ref, `Ngày ${dateFull(date)} ở tương lai`)
  }

  for (const e of f.fuel_entries) {
    const ref = `fuel_entries.${e.id}`
    checkRow(ref, e.vehicle_id, e.date)
    if (e.total_amount == null && e.quantity == null)
      err(ref, 'Phải có ít nhất thành tiền hoặc số lượng')
    if (e.quantity != null && e.unit_price != null && e.total_amount != null) {
      const expected = e.quantity * e.unit_price
      if (Math.abs(expected - e.total_amount) > Math.max(e.total_amount * 0.01, 1))
        warn(ref, `Số lượng × đơn giá = ${Math.round(expected)} nhưng thành tiền ghi ${e.total_amount}`)
    }
  }
  for (const s of f.services) checkRow(`services.${s.id}`, s.vehicle_id, s.date)
  for (const x of f.expenses) checkRow(`expenses.${x.id}`, x.vehicle_id, x.date)

  // Odometer must not go backwards along a vehicle's fuel chain. Readings of 0 or null mean
  // "not recorded" and are skipped, never treated as a reset (docs §3.3).
  for (const vid of vehicleIds) {
    const chain = f.fuel_entries
      .filter((e) => e.vehicle_id === vid && e.odometer_km != null && e.odometer_km > 0)
      .sort((a, b) => a.date.localeCompare(b.date))
    for (let i = 1; i < chain.length; i++) {
      const prev = chain[i - 1]!
      const cur = chain[i]!
      if (cur.odometer_km! < prev.odometer_km!)
        err(
          `fuel_entries.${cur.id}`,
          `ODO lùi: ${cur.odometer_km} km (${dateFull(cur.date)}) nhỏ hơn ${prev.odometer_km} km (${dateFull(prev.date)})`,
        )
    }
  }

  const ruleIds = new Set(f.suggested_maintenance_rules.map((r) => r.id))
  for (const r of f.suggested_reminders) {
    const ref = `suggested_reminders.${r.id}`
    if (!ruleIds.has(r.rule_id)) err(ref, `rule_id "${r.rule_id}" không tồn tại`)
    if (!vehicleIds.has(r.vehicle_id)) err(ref, `vehicle_id "${r.vehicle_id}" không tồn tại`)
    if (r.due_odometer_km != null && r.due_odometer_km <= r.anchor_odometer_km)
      err(ref, 'ODO hạn phải lớn hơn ODO mốc neo')
    if (r.due_date != null && r.due_date <= r.anchor_date)
      err(ref, 'Ngày hạn phải sau ngày mốc neo')
  }

  return { file: f, issues }
}

export async function runImport(raw: unknown, opts: ImportOptions): Promise<ImportReport> {
  const { file, issues } = validateImport(raw)
  const empty = { vehicles: 0, fuel: 0, services: 0, expenses: 0, rules: 0, reminders: 0 }
  if (!file || issues.some((i) => i.severity === 'error'))
    return { ok: false, counts: empty, issues, dataQuality: [] }

  if (opts.mode === 'replace') await clearAllData()

  const ts = now()
  await db.transaction(
    'rw',
    [db.vehicles, db.fuelEntries, db.services, db.expenses, db.maintenanceRules, db.reminders, db.tombstones],
    async () => {
      await db.vehicles.bulkPut(file.vehicles.map((v) => ({ ...v, name: nfc(v.name), updated_at: ts })))
      await db.fuelEntries.bulkPut(
        // `time` is optional in the file format; absent means the hour was never recorded.
        file.fuel_entries.map((e) => ({ ...e, fuel_type: e.fuel_type ?? null, time: e.time ?? null, updated_at: ts })),
      )
      await db.services.bulkPut(
        file.services.map((s) => ({
          ...s,
          items: s.items.map((i) => ({ name: nfc(i.name), amount: i.amount })),
          time: s.time ?? null,
          updated_at: ts,
        })),
      )
      await db.expenses.bulkPut(file.expenses.map((x) => ({ ...x, time: x.time ?? null, updated_at: ts })))

      // A replace-mode load ran clearAllData(), which tombstoned every id it removed.
      // Any id written back above is alive again and must not keep its tombstone: both
      // carry this same instant, and the merge breaks that tie in favour of the delete.
      await Promise.all([
        forgetTombstones('vehicles', file.vehicles.map((v) => v.id)),
        forgetTombstones('fuelEntries', file.fuel_entries.map((e) => e.id)),
        forgetTombstones('services', file.services.map((r) => r.id)),
        forgetTombstones('expenses', file.expenses.map((x) => x.id)),
      ])
      if (opts.includeSuggestions) {
        // Both tables gained updated_at in Dexie v4; the import file predates it, so the
        // import time is the honest answer for "when did this row last change".
        await db.maintenanceRules.bulkPut(
          file.suggested_maintenance_rules.map((r) => ({ ...r, updated_at: ts })),
        )
        await db.reminders.bulkPut(file.suggested_reminders.map((r) => ({ ...r, updated_at: ts })))
        await Promise.all([
          forgetTombstones('maintenanceRules', file.suggested_maintenance_rules.map((r) => r.id)),
          forgetTombstones('reminders', file.suggested_reminders.map((r) => r.id)),
        ])
      }
    },
  )

  // A file may reference a fuel type this device has never seen — a built-in that was
  // deleted, or one the exporting device invented. Create it rather than leaving records
  // pointing at nothing, and carry any legacy prices onto the rows.
  const prices = (file.settings?.fuel_prices ?? {}) as Record<string, number | null>
  const referenced = new Set<string>()
  for (const v of file.vehicles) if (v.fuel_type) referenced.add(v.fuel_type)
  for (const e of file.fuel_entries) if (e.fuel_type) referenced.add(e.fuel_type)
  for (const id of Object.keys(prices)) referenced.add(id)

  const known = new Map((await db.fuelTypes.toArray()).map((f) => [f.id, f]))
  const toPut: FuelTypeRow[] = []
  let nextSort = Math.max(0, ...[...known.values()].map((f) => f.sort))

  for (const id of referenced) {
    const existing = known.get(id)
    const price = prices[id] ?? null
    if (existing) {
      if (price != null && existing.price !== price)
        toPut.push({ ...existing, price, updated_at: now() })
      continue
    }
    const builtin = DEFAULT_FUEL_TYPES.find((d) => d.id === id)
    nextSort += 10
    toPut.push(
      builtin
        ? { ...builtin, price: price ?? builtin.price }
        : {
            id,
            name: id,
            short: id.slice(0, 8),
            unit: 'liter',
            price,
            sort: nextSort,
            archived: false,
            builtin: false,
            updated_at: now(),
          },
    )
  }
  if (toPut.length) await db.fuelTypes.bulkPut(toPut)

  await patchSettings({
    ...(file.settings?.currency ? { currency: file.settings.currency } : {}),
    fuel_prices: prices,
    active_vehicle_id: file.vehicles[0]?.id ?? null,
  })

  return {
    ok: true,
    counts: {
      vehicles: file.vehicles.length,
      fuel: file.fuel_entries.length,
      services: file.services.length,
      expenses: file.expenses.length,
      rules: opts.includeSuggestions ? file.suggested_maintenance_rules.length : 0,
      reminders: opts.includeSuggestions ? file.suggested_reminders.length : 0,
    },
    issues,
    dataQuality: file.data_quality,
  }
}
