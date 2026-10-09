import { describe, expect, it } from 'vitest'
import { expenseSchema, fuelEntrySchema, importFileSchema, serviceSchema } from '../schema'

/**
 * The time of day is the newest field in the record shape, and the one a hand-written or
 * third-party import file is most likely to get wrong. These pin down what the boundary
 * accepts, so a malformed hour is rejected at the edge instead of reaching IndexedDB and
 * rendering as rubbish on every row that carries it.
 */

const base = {
  id: 'F1',
  vehicle_id: 'V',
  date: '2026-10-09',
  odometer_km: 12_345,
  fuel_type: 'ron95',
  quantity: 20,
  unit_price: 21_000,
  total_amount: 420_000,
  is_full_tank: false,
  missed_fill: false,
  station: null,
  payment_method: null,
  note: null,
}

describe('fuelEntrySchema — time', () => {
  it('accepts a 24-hour HH:MM', () => {
    expect(fuelEntrySchema.parse({ ...base, time: '07:05' }).time).toBe('07:05')
    expect(fuelEntrySchema.parse({ ...base, time: '23:59' }).time).toBe('23:59')
    expect(fuelEntrySchema.parse({ ...base, time: '00:00' }).time).toBe('00:00')
  })

  it('accepts an explicit null — the hour was not recorded', () => {
    expect(fuelEntrySchema.parse({ ...base, time: null }).time).toBeNull()
  })

  // Files written before the field existed must keep importing. They carry no `time` key
  // at all, which is a different thing from carrying a broken one.
  it('accepts the key being absent entirely', () => {
    expect(fuelEntrySchema.parse(base).time).toBeUndefined()
  })

  it('rejects an hour past 23 or a minute past 59', () => {
    expect(() => fuelEntrySchema.parse({ ...base, time: '24:00' })).toThrow()
    expect(() => fuelEntrySchema.parse({ ...base, time: '07:60' })).toThrow()
  })

  it('rejects 12-hour and seconds-bearing forms', () => {
    expect(() => fuelEntrySchema.parse({ ...base, time: '7:05 PM' })).toThrow()
    expect(() => fuelEntrySchema.parse({ ...base, time: '07:05:00' })).toThrow()
  })

  it('rejects an unpadded hour, so stored strings sort lexicographically', () => {
    expect(() => fuelEntrySchema.parse({ ...base, time: '7:05' })).toThrow()
  })

  it('rejects a full timestamp — this field is a wall clock, not an instant', () => {
    expect(() => fuelEntrySchema.parse({ ...base, time: '2026-10-09T07:05:00Z' })).toThrow()
  })
})

describe('serviceSchema and expenseSchema take the same time', () => {
  const svc = {
    id: 'S1', vehicle_id: 'V', date: '2026-10-09', odometer_km: null,
    items: [{ name: 'Thay dầu máy', amount: 450_000 }],
    total_amount: 450_000, workshop: null, note: null,
  }
  const exp = {
    id: 'X1', vehicle_id: 'V', date: '2026-10-09', odometer_km: null,
    category: 'Gửi xe', total_amount: 120_000, note: null,
  }

  it('accepts a valid hour on both', () => {
    expect(serviceSchema.parse({ ...svc, time: '09:30' }).time).toBe('09:30')
    expect(expenseSchema.parse({ ...exp, time: '09:30' }).time).toBe('09:30')
  })

  it('rejects a bad hour on both', () => {
    expect(() => serviceSchema.parse({ ...svc, time: '9:30' })).toThrow()
    expect(() => expenseSchema.parse({ ...exp, time: '25:00' })).toThrow()
  })
})

describe('importFileSchema', () => {
  const file = (fuel: unknown[]) => ({
    format: 'vehicle-management/import' as const,
    version: 1 as const,
    vehicles: [],
    fuel_entries: fuel,
    services: [],
  })

  it('carries the hour through a whole file', () => {
    const parsed = importFileSchema.parse(file([{ ...base, time: '07:05' }]))
    expect(parsed.fuel_entries[0]?.time).toBe('07:05')
  })

  // One bad row must fail the file rather than be quietly dropped: a partial import the
  // user was told succeeded is worse than one they were told to fix.
  it('fails the whole file on one malformed hour', () => {
    expect(() =>
      importFileSchema.parse(file([{ ...base }, { ...base, id: 'F2', time: '7am' }])),
    ).toThrow()
  })

  it('still imports a pre-time file untouched', () => {
    const parsed = importFileSchema.parse(file([base]))
    expect(parsed.fuel_entries).toHaveLength(1)
    expect(parsed.fuel_entries[0]?.date).toBe('2026-10-09')
  })
})
