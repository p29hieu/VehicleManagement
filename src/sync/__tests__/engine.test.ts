import { describe, expect, it } from 'vitest'
import { MAX_ATTEMPTS, syncOnce, type SyncDeps } from '../engine'
import { MemoryBackend } from '../backends/memory'
import { SyncConflictError, emptySnapshot } from '../types'
import type { SyncSnapshot, SyncStateRow, Tombstone } from '../types'
import type { FuelEntry } from '../../domain/types'

const T = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString()

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

/**
 * A device: one local snapshot plus the SyncDeps the engine drives it through.
 *
 * `applyLocal` mirrors snapshot.ts — upsert the decided rows, delete the tombstoned ones —
 * rather than replacing the table wholesale, so the "row added mid-sync survives" case is
 * tested against the behaviour the real code has.
 */
class Device {
  snapshot: SyncSnapshot
  state: Partial<SyncStateRow> = {}
  private tick = 100

  constructor(entries: FuelEntry[] = [], tombstones: Tombstone[] = []) {
    this.snapshot = emptySnapshot(T(0))
    this.snapshot.tables.fuelEntries = entries
    this.snapshot.tombstones = tombstones
  }

  get deps(): SyncDeps {
    return {
      readLocal: async (writtenAt) => ({
        ...structuredClone(this.snapshot),
        written_at: writtenAt,
      }),
      applyLocal: async (merged) => {
        const dead = new Set(
          merged.tombstones.filter((t) => t.table === 'fuelEntries').map((t) => t.id),
        )
        const byId = new Map(this.snapshot.tables.fuelEntries.map((r) => [r.id, r]))
        for (const row of merged.tables.fuelEntries) byId.set(row.id, row)
        for (const id of dead) byId.delete(id)
        this.snapshot.tables.fuelEntries = [...byId.values()]
        this.snapshot.tombstones = structuredClone(merged.tombstones)
      },
      saveState: async (patch) => {
        this.state = { ...this.state, ...patch }
      },
      now: () => T(this.tick++),
    }
  }

  ids(): string[] {
    return this.snapshot.tables.fuelEntries.map((e) => e.id).sort()
  }

  amount(id: string): number | null | undefined {
    return this.snapshot.tables.fuelEntries.find((e) => e.id === id)?.total_amount
  }
}

describe('syncOnce', () => {
  it('creates the remote on the first ever sync', async () => {
    const backend = new MemoryBackend()
    const device = new Device([fill('F1', 50_000, T(1))])

    const out = await syncOnce(backend, device.deps)

    expect(out.status).toBe('synced')
    expect(out.attempts).toBe(1)
    expect(backend.peek()?.tables.fuelEntries.map((e) => e.id)).toEqual(['F1'])
    expect(device.state.last_token).toBe(out.token)
    expect(device.state.last_synced_at).toBe(out.at)
  })

  it('brings a second device up to date', async () => {
    const backend = new MemoryBackend()
    const phone = new Device([fill('F1', 50_000, T(1))])
    const laptop = new Device([])

    await syncOnce(backend, phone.deps)
    const out = await syncOnce(backend, laptop.deps)

    expect(laptop.ids()).toEqual(['F1'])
    expect(out.stats.fuelEntries.pulled).toBe(1)
  })

  it('uploads nothing when both sides already agree', async () => {
    const backend = new MemoryBackend()
    const device = new Device([fill('F1', 50_000, T(1))])

    await syncOnce(backend, device.deps)
    const pushesAfterFirst = backend.pushes

    const out = await syncOnce(backend, device.deps)

    expect(out.status).toBe('up-to-date')
    expect(backend.pushes).toBe(pushesAfterFirst) // no second upload
    expect(device.state.last_synced_at).toBe(out.at) // but the clock still moved
  })

  it('retries and succeeds when another device writes mid-sync', async () => {
    // Goes stale exactly once: the token handed out by the first pull is void by the time
    // the push lands, which is the race Drive cannot prevent.
    class RacyBackend extends MemoryBackend {
      racesLeft = 1
      override async pull() {
        const result = await super.pull()
        if (this.racesLeft > 0) {
          this.racesLeft--
          const other = emptySnapshot(T(50))
          other.tables.fuelEntries = [fill('F9', 90_000, T(50))]
          this.clobber(other)
        }
        return result
      }
    }

    const backend = new RacyBackend()
    const device = new Device([fill('F1', 50_000, T(1))])

    const out = await syncOnce(backend, device.deps)

    expect(out.status).toBe('synced')
    expect(out.attempts).toBe(2)
    // The other device's row was picked up by the re-merge, not overwritten.
    expect(
      backend
        .peek()
        ?.tables.fuelEntries.map((e) => e.id)
        .sort(),
    ).toEqual(['F1', 'F9'])
  })

  it('gives up after MAX_ATTEMPTS when the remote never stops moving', async () => {
    class AlwaysRacyBackend extends MemoryBackend {
      override async pull() {
        const result = await super.pull()
        const other = emptySnapshot(T(60))
        other.tables.fuelEntries = [fill('F9', 90_000, T(60))]
        this.clobber(other)
        return result
      }
    }

    const backend = new AlwaysRacyBackend()
    const device = new Device([fill('F1', 50_000, T(1))])

    await expect(syncOnce(backend, device.deps)).rejects.toBeInstanceOf(SyncConflictError)
    expect(backend.pulls).toBe(MAX_ATTEMPTS)
  })

  it('propagates a delete instead of letting the other device resurrect it', async () => {
    const backend = new MemoryBackend()
    const phone = new Device([fill('F1', 50_000, T(1)), fill('F2', 60_000, T(1))])
    const laptop = new Device([])

    await syncOnce(backend, phone.deps)
    await syncOnce(backend, laptop.deps)
    expect(laptop.ids()).toEqual(['F1', 'F2'])

    // Phone deletes F2 exactly as repo.ts does: drop the row, keep a tombstone.
    phone.snapshot.tables.fuelEntries = phone.snapshot.tables.fuelEntries.filter(
      (e) => e.id !== 'F2',
    )
    phone.snapshot.tombstones = [{ table: 'fuelEntries', id: 'F2', deleted_at: T(20) }]

    await syncOnce(backend, phone.deps)
    await syncOnce(backend, laptop.deps)

    expect(laptop.ids()).toEqual(['F1'])

    // And it stays gone: syncing again must not bring it back from anywhere.
    await syncOnce(backend, phone.deps)
    await syncOnce(backend, laptop.deps)
    expect(laptop.ids()).toEqual(['F1'])
    expect(phone.ids()).toEqual(['F1'])
  })

  it('keeps a record added while the sync was in flight', async () => {
    const backend = new MemoryBackend()
    const device = new Device([fill('F1', 50_000, T(1))])
    const base = device.deps

    const racy: SyncDeps = {
      ...base,
      // Stands in for the user saving a fill at the pump between pull and apply.
      applyLocal: async (merged) => {
        device.snapshot.tables.fuelEntries.push(fill('F-NEW', 30_000, T(80)))
        await base.applyLocal(merged)
      },
    }

    const other = emptySnapshot(T(70))
    other.tables.fuelEntries = [fill('F2', 60_000, T(70))]
    backend.clobber(other)

    await syncOnce(backend, racy)

    expect(device.ids()).toEqual(['F-NEW', 'F1', 'F2'])
  })

  // docs/01-PLAN.md P7: "2 thiết bị sửa offline khác nhau → online lại → không mất bản ghi nào."
  it('loses nothing when two devices go offline, diverge, then both reconnect', async () => {
    const backend = new MemoryBackend()
    const phone = new Device([fill('F1', 50_000, T(1)), fill('F2', 60_000, T(1))])
    const laptop = new Device([])

    await syncOnce(backend, phone.deps)
    await syncOnce(backend, laptop.deps)

    // --- both offline, diverging ---
    phone.snapshot.tables.fuelEntries = [
      fill('F1', 55_000, T(30)), // edited
      fill('F2', 60_000, T(1)),
      fill('F3', 70_000, T(31)), // added
    ]
    laptop.snapshot.tables.fuelEntries = [
      fill('F1', 50_000, T(1)),
      fill('F4', 80_000, T(32)), // added
    ]
    laptop.snapshot.tombstones = [{ table: 'fuelEntries', id: 'F2', deleted_at: T(33) }] // deleted

    // --- back online, in either order, more than once ---
    await syncOnce(backend, laptop.deps)
    await syncOnce(backend, phone.deps)
    await syncOnce(backend, laptop.deps)

    expect(phone.ids()).toEqual(['F1', 'F3', 'F4'])
    expect(laptop.ids()).toEqual(['F1', 'F3', 'F4'])
    expect(phone.amount('F1')).toBe(55_000) // the phone's edit survived
    expect(laptop.amount('F1')).toBe(55_000)

    // Settled: another round changes nothing on either side.
    const again = await syncOnce(backend, phone.deps)
    expect(again.status).toBe('up-to-date')
  })
})
