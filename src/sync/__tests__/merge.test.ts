import { describe, expect, it } from 'vitest'
import { isNoop, mergeSnapshots } from '../merge'
import { SNAPSHOT_FORMAT, SNAPSHOT_VERSION, emptyTables } from '../types'
import type { SyncSnapshot, SyncTableName, Tombstone } from '../types'
import type { AppSettings, FuelEntry, Vehicle } from '../../domain/types'

const T = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString()
const WRITTEN = T(999)

function snap(parts: {
  vehicles?: Vehicle[]
  fuelEntries?: FuelEntry[]
  settings?: AppSettings[]
  tombstones?: Tombstone[]
}): SyncSnapshot {
  const { tombstones = [], ...tables } = parts
  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    written_at: WRITTEN,
    tables: { ...emptyTables(), ...tables },
    tombstones,
  }
}

const vehicle = (id: string, name: string, updated_at: string): Vehicle => ({
  id,
  name,
  kind: 'motorcycle',
  make: null,
  model: null,
  plate: null,
  year: null,
  fuel_type: 'ron95',
  tank_capacity_l: null,
  battery_kwh: null,
  initial_odometer_km: 0,
  odometer_offset_km: 0,
  consumption_min: 1.2,
  consumption_max: 6,
  is_active: true,
  note: null,
  updated_at,
})

const fill = (id: string, amount: number, updated_at: string): FuelEntry => ({
  id,
  vehicle_id: 'VH1',
  fuel_type: 'ron95',
  date: '2026-01-01',
  odometer_km: 1000,
  quantity: null,
  unit_price: null,
  total_amount: amount,
  is_full_tank: false,
  missed_fill: false,
  station: null,
  payment_method: null,
  note: null,
  updated_at,
})

const settings = (active: string | null, updated_at: string): AppSettings => ({
  id: 'singleton',
  currency: 'VND',
  distance_unit: 'km',
  volume_unit: 'L',
  locale: 'vi-VN',
  timezone: 'Asia/Ho_Chi_Minh',
  fuel_prices: {},
  active_vehicle_id: active,
  updated_at,
})

const tomb = (table: SyncTableName, id: string, deleted_at: string): Tombstone => ({
  table,
  id,
  deleted_at,
})

/** Order-independent view, so two merges can be compared for equality. */
const canonical = (s: SyncSnapshot) => ({
  tables: Object.fromEntries(
    Object.entries(s.tables).map(([k, rows]) => [
      k,
      [...(rows as { id: string }[])].sort((a, b) => a.id.localeCompare(b.id)),
    ]),
  ),
  tombstones: [...s.tombstones].sort((a, b) =>
    `${a.table}/${a.id}`.localeCompare(`${b.table}/${b.id}`),
  ),
})

const ids = (s: SyncSnapshot, table: 'vehicles' | 'fuelEntries') =>
  s.tables[table].map((r) => r.id).sort()

describe('mergeSnapshots', () => {
  it('returns an empty snapshot when both sides are empty', () => {
    const { snapshot, stats } = mergeSnapshots(snap({}), snap({}), WRITTEN)
    expect(snapshot.tables.vehicles).toEqual([])
    expect(isNoop(stats)).toBe(true)
  })

  it('keeps a row only one side has, in both directions', () => {
    const local = snap({ vehicles: [vehicle('VH1', 'Xe A', T(1))] })
    const remote = snap({ vehicles: [vehicle('VH2', 'Xe B', T(1))] })

    const { snapshot, stats } = mergeSnapshots(local, remote, WRITTEN)
    expect(ids(snapshot, 'vehicles')).toEqual(['VH1', 'VH2'])
    expect(stats.vehicles.pulled).toBe(1) // VH2 is new to local
    expect(stats.vehicles.pushed).toBe(1) // VH1 is new to remote
  })

  it('is a no-op when both sides already agree', () => {
    const v = vehicle('VH1', 'Xe A', T(1))
    const { stats } = mergeSnapshots(snap({ vehicles: [v] }), snap({ vehicles: [v] }), WRITTEN)
    expect(isNoop(stats)).toBe(true)
  })

  it('lets the newer edit win, whichever side it is on', () => {
    const older = vehicle('VH1', 'Tên cũ', T(1))
    const newer = vehicle('VH1', 'Tên mới', T(2))

    const localNewer = mergeSnapshots(
      snap({ vehicles: [newer] }),
      snap({ vehicles: [older] }),
      WRITTEN,
    )
    expect(localNewer.snapshot.tables.vehicles[0]?.name).toBe('Tên mới')

    const remoteNewer = mergeSnapshots(
      snap({ vehicles: [older] }),
      snap({ vehicles: [newer] }),
      WRITTEN,
    )
    expect(remoteNewer.snapshot.tables.vehicles[0]?.name).toBe('Tên mới')
  })

  // The bug this whole design exists to prevent.
  it('does NOT resurrect a row the other device deleted', () => {
    const local = snap({ tombstones: [tomb('fuelEntries', 'F1', T(5))] })
    const remote = snap({ fuelEntries: [fill('F1', 50_000, T(2))] })

    const { snapshot, stats } = mergeSnapshots(local, remote, WRITTEN)
    expect(snapshot.tables.fuelEntries).toEqual([])
    expect(snapshot.tombstones).toEqual([tomb('fuelEntries', 'F1', T(5))])
    expect(stats.fuelEntries.pushed).toBe(1)
  })

  it('deletes locally when the remote tombstone is newer than the local row', () => {
    const local = snap({ fuelEntries: [fill('F1', 50_000, T(2))] })
    const remote = snap({ tombstones: [tomb('fuelEntries', 'F1', T(5))] })

    const { snapshot, stats } = mergeSnapshots(local, remote, WRITTEN)
    expect(snapshot.tables.fuelEntries).toEqual([])
    expect(stats.fuelEntries.deleted).toBe(1)
  })

  it('lets a row created after a delete beat the tombstone, and drops the tombstone', () => {
    const local = snap({ fuelEntries: [fill('F1', 70_000, T(9))] })
    const remote = snap({ tombstones: [tomb('fuelEntries', 'F1', T(5))] })

    const { snapshot } = mergeSnapshots(local, remote, WRITTEN)
    expect(snapshot.tables.fuelEntries).toHaveLength(1)
    expect(snapshot.tables.fuelEntries[0]?.total_amount).toBe(70_000)
    // The tombstone lost, so carrying it forward would only risk a later false delete.
    expect(snapshot.tombstones).toEqual([])
  })

  it('breaks a row-vs-tombstone tie in favour of the delete', () => {
    const local = snap({ fuelEntries: [fill('F1', 50_000, T(5))] })
    const remote = snap({ tombstones: [tomb('fuelEntries', 'F1', T(5))] })

    const { snapshot } = mergeSnapshots(local, remote, WRITTEN)
    expect(snapshot.tables.fuelEntries).toEqual([])
  })

  it('makes an unparseable timestamp lose to a valid one', () => {
    const broken = { ...vehicle('VH1', 'Hỏng', T(9)), updated_at: 'not-a-date' }
    const good = vehicle('VH1', 'Tốt', T(1))

    const { snapshot } = mergeSnapshots(
      snap({ vehicles: [broken] }),
      snap({ vehicles: [good] }),
      WRITTEN,
    )
    expect(snapshot.tables.vehicles[0]?.name).toBe('Tốt')
  })

  describe('convergence', () => {
    // If merge(A,B) !== merge(B,A) the two devices never settle: each sync undoes the
    // other's. Every tie-break in merge.ts exists to keep this test green.
    const cases: Array<[string, SyncSnapshot, SyncSnapshot]> = [
      [
        'disjoint rows',
        snap({ vehicles: [vehicle('VH1', 'A', T(1))] }),
        snap({ vehicles: [vehicle('VH2', 'B', T(2))] }),
      ],
      [
        'same id, different timestamps',
        snap({ vehicles: [vehicle('VH1', 'A', T(1))] }),
        snap({ vehicles: [vehicle('VH1', 'B', T(2))] }),
      ],
      [
        'same id, IDENTICAL timestamps but different content',
        snap({ vehicles: [vehicle('VH1', 'A', T(3))] }),
        snap({ vehicles: [vehicle('VH1', 'B', T(3))] }),
      ],
      [
        'row against a tombstone at the same instant',
        snap({ fuelEntries: [fill('F1', 1, T(4))] }),
        snap({ tombstones: [tomb('fuelEntries', 'F1', T(4))] }),
      ],
      [
        'tombstones on both sides at different times',
        snap({ tombstones: [tomb('fuelEntries', 'F1', T(4))] }),
        snap({ fuelEntries: [fill('F1', 1, T(2))], tombstones: [tomb('fuelEntries', 'F1', T(6))] }),
      ],
    ]

    it.each(cases)('merge(A,B) equals merge(B,A) — %s', (_label, a, b) => {
      const ab = mergeSnapshots(a, b, WRITTEN).snapshot
      const ba = mergeSnapshots(b, a, WRITTEN).snapshot
      expect(canonical(ab)).toEqual(canonical(ba))
    })
  })

  it('is idempotent — merging the result back in changes nothing', () => {
    const local = snap({
      vehicles: [vehicle('VH1', 'A', T(1))],
      fuelEntries: [fill('F1', 50_000, T(2))],
    })
    const remote = snap({
      vehicles: [vehicle('VH1', 'B', T(3))],
      tombstones: [tomb('fuelEntries', 'F2', T(4))],
    })

    const first = mergeSnapshots(local, remote, WRITTEN).snapshot
    const second = mergeSnapshots(first, first, WRITTEN)
    expect(canonical(second.snapshot)).toEqual(canonical(first))
    expect(isNoop(second.stats)).toBe(true)
  })

  describe('settings', () => {
    it('keeps the local active vehicle even when the remote row wins', () => {
      const local = snap({ settings: [settings('VH-LOCAL', T(1))] })
      const remote = snap({ settings: [settings('VH-REMOTE', T(9))] })

      const { snapshot } = mergeSnapshots(local, remote, WRITTEN)
      expect(snapshot.tables.settings[0]?.active_vehicle_id).toBe('VH-LOCAL')
    })

    it('adopts the remote active vehicle on a device that has none yet', () => {
      const local = snap({ settings: [settings(null, T(1))] })
      const remote = snap({ settings: [settings('VH-REMOTE', T(9))] })

      const { snapshot } = mergeSnapshots(local, remote, WRITTEN)
      expect(snapshot.tables.settings[0]?.active_vehicle_id).toBe('VH-REMOTE')
    })
  })

  // docs/01-PLAN.md P7: "2 thiết bị sửa offline khác nhau → online lại → không mất bản ghi nào."
  it('loses nothing when two devices edit different records while offline', () => {
    const base = snap({
      vehicles: [vehicle('VH1', 'Xe', T(1))],
      fuelEntries: [fill('F1', 50_000, T(1)), fill('F2', 60_000, T(1))],
    })

    // Phone edits F1 and adds F3. Laptop deletes F2 and adds F4.
    const phone = snap({
      vehicles: [vehicle('VH1', 'Xe', T(1))],
      fuelEntries: [fill('F1', 55_000, T(10)), fill('F2', 60_000, T(1)), fill('F3', 70_000, T(11))],
    })
    const laptop = snap({
      vehicles: [vehicle('VH1', 'Xe', T(1))],
      fuelEntries: [fill('F1', 50_000, T(1)), fill('F4', 80_000, T(12))],
      tombstones: [tomb('fuelEntries', 'F2', T(13))],
    })

    // Phone syncs against what the laptop already pushed.
    const afterPhone = mergeSnapshots(phone, laptop, WRITTEN).snapshot
    // Laptop then syncs against the result.
    const afterLaptop = mergeSnapshots(laptop, afterPhone, WRITTEN).snapshot

    expect(ids(afterPhone, 'fuelEntries')).toEqual(['F1', 'F3', 'F4'])
    expect(ids(afterLaptop, 'fuelEntries')).toEqual(['F1', 'F3', 'F4'])
    // The phone's edit to F1 survived; the laptop's delete of F2 survived.
    expect(afterLaptop.tables.fuelEntries.find((e) => e.id === 'F1')?.total_amount).toBe(55_000)
    expect(canonical(afterPhone)).toEqual(canonical(afterLaptop))
    expect(base.tables.fuelEntries).toHaveLength(2) // the inputs were not mutated
  })
})
