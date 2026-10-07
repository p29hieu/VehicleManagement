/**
 * Dexie <-> snapshot. The only file under src/sync that knows IndexedDB exists; everything
 * else works on plain objects, which is what keeps the merge engine testable.
 */

import { db } from '../db'
import {
  SNAPSHOT_FORMAT,
  SNAPSHOT_VERSION,
  SYNC_TABLES,
  type SyncSnapshot,
  type SyncStateRow,
  type SyncTableName,
  type Tombstone,
  emptyTables,
} from './types'

const KNOWN = new Set<string>(SYNC_TABLES)

export async function readLocalSnapshot(writtenAt: string): Promise<SyncSnapshot> {
  const tables = emptyTables()

  const [rows, tombRows] = await Promise.all([
    Promise.all(SYNC_TABLES.map((t) => db[t].toArray())),
    db.tombstones.toArray(),
  ])

  SYNC_TABLES.forEach((t, i) => {
    ;(tables as Record<SyncTableName, unknown[]>)[t] = rows[i] ?? []
  })

  // A tombstone naming a table this build does not know about would merge into nothing and
  // then be written straight back out, so it is dropped rather than carried forever.
  const tombstones: Tombstone[] = tombRows
    .filter((t) => KNOWN.has(t.table))
    .map((t) => ({ table: t.table as SyncTableName, id: t.id, deleted_at: t.deleted_at }))

  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    written_at: writtenAt,
    tables,
    tombstones,
  }
}

/**
 * Writes a merged snapshot back into Dexie.
 *
 * Deliberately NOT clear-then-insert. A sync spans a network round trip, and the user may
 * well add a record at the pump while it is in flight; clearing the table would throw that
 * row away because the merge never saw it. Touching only the ids the merge actually
 * decided about leaves anything newer alone, to be picked up on the next sync.
 */
export async function applySnapshot(snapshot: SyncSnapshot): Promise<void> {
  const touched = SYNC_TABLES.map((t) => db[t])

  await db.transaction('rw', [...touched, db.tombstones], async () => {
    for (const table of SYNC_TABLES) {
      const rows = snapshot.tables[table] as unknown[]
      if (rows.length > 0) {
        await (db[table] as unknown as { bulkPut: (r: unknown[]) => Promise<unknown> }).bulkPut(rows)
      }

      const dead = snapshot.tombstones.filter((t) => t.table === table).map((t) => t.id)
      if (dead.length > 0) await db[table].bulkDelete(dead)
    }

    if (snapshot.tombstones.length > 0) {
      await db.tombstones.bulkPut(
        snapshot.tombstones.map((t) => ({ table: t.table, id: t.id, deleted_at: t.deleted_at })),
      )
    }
  })
}

const DEFAULT_SYNC_STATE: SyncStateRow = {
  id: 'singleton',
  backend_id: null,
  account_label: null,
  last_synced_at: null,
  last_token: null,
}

export async function getSyncState(): Promise<SyncStateRow> {
  return (await db.syncState.get('singleton')) ?? DEFAULT_SYNC_STATE
}

export async function patchSyncState(patch: Partial<SyncStateRow>): Promise<void> {
  const current = await getSyncState()
  await db.syncState.put({ ...current, ...patch, id: 'singleton' })
}
