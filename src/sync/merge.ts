/**
 * Per-record last-write-wins merge with tombstones.
 *
 * Pure on purpose: no Dexie, no fetch, no clock. Everything that can go wrong with sync
 * goes wrong here, so this is the part that has to be provable in a unit test rather than
 * discovered on a phone.
 *
 * The one rule that makes it work: **every decision must be symmetric.** Two devices
 * merging the same pair of snapshots have to reach the same answer, or they ping-pong
 * forever, each undoing the other. That is why nothing here ever prefers "local".
 */

import {
  SNAPSHOT_FORMAT,
  SNAPSHOT_VERSION,
  SYNC_TABLES,
  type SyncRow,
  type SyncSnapshot,
  type SyncTableName,
  type SyncTables,
  type Tombstone,
  emptyTables,
} from './types'

export interface TableStats {
  /** Rows the remote knew better; local has to change. */
  pulled: number
  /** Rows local knew better; the remote has to change. */
  pushed: number
  /** Live local rows removed because a tombstone won. */
  deleted: number
}

export type MergeStats = Record<SyncTableName, TableStats> & { total: TableStats }

export interface MergeResult {
  snapshot: SyncSnapshot
  stats: MergeStats
}

/**
 * Milliseconds since epoch, or -Infinity for anything unparseable.
 *
 * A corrupt or missing timestamp must LOSE every comparison rather than win one: a row
 * that cannot say when it changed has no business overwriting one that can. Comparing
 * numerically rather than lexicographically also means a row written with a non-UTC or
 * differently-formatted timestamp still orders correctly.
 */
const at = (iso: string | null | undefined): number => {
  if (!iso) return -Infinity
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? -Infinity : ms
}

/** Key-sorted JSON, so two devices that built the same row in a different property order
 *  still produce the same string. Used only as a deterministic tie-breaker. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
}

type Side = 'local' | 'remote'

type Candidate<T> =
  | { kind: 'live'; row: T; ms: number; side: Side }
  | { kind: 'dead'; ms: number; side: Side }

/**
 * Picks the winner among the (at most four) things that can be known about one id.
 *
 * Ties are real — two edits inside the same millisecond, or the same row arriving from
 * two paths — so they get an explicit, side-independent rule:
 *   1. newest timestamp wins;
 *   2. on a tie, deletion beats a live row (a delete racing a no-op edit must not
 *      resurrect the row);
 *   3. between two live rows, the larger key-sorted JSON wins — arbitrary, but identical
 *      on every device, which is the only property that matters.
 */
function pick<T>(candidates: Candidate<T>[]): Candidate<T> {
  let best = candidates[0] as Candidate<T>
  for (const c of candidates.slice(1)) {
    if (c.ms > best.ms) {
      best = c
      continue
    }
    if (c.ms < best.ms) continue

    if (c.kind === 'dead' && best.kind === 'live') best = c
    else if (c.kind === 'live' && best.kind === 'live') {
      if (stableStringify(c.row) > stableStringify(best.row)) best = c
    }
  }
  return best
}

const byId = <T extends SyncRow>(rows: readonly T[]): Map<string, T> =>
  new Map(rows.map((r) => [r.id, r]))

const tombsFor = (tombstones: readonly Tombstone[], table: SyncTableName): Map<string, string> => {
  const m = new Map<string, string>()
  for (const t of tombstones) {
    if (t.table !== table) continue
    // Keep the newest tombstone if a row was somehow deleted twice.
    const prev = m.get(t.id)
    if (prev === undefined || at(t.deleted_at) > at(prev)) m.set(t.id, t.deleted_at)
  }
  return m
}

interface TableMerge<T> {
  rows: T[]
  tombstones: Tombstone[]
  stats: TableStats
}

function mergeTable<T extends SyncRow>(
  table: SyncTableName,
  localRows: readonly T[],
  remoteRows: readonly T[],
  localTombs: Map<string, string>,
  remoteTombs: Map<string, string>,
): TableMerge<T> {
  const local = byId(localRows)
  const remote = byId(remoteRows)

  const ids = new Set<string>([
    ...local.keys(),
    ...remote.keys(),
    ...localTombs.keys(),
    ...remoteTombs.keys(),
  ])

  const rows: T[] = []
  const tombstones: Tombstone[] = []
  const stats: TableStats = { pulled: 0, pushed: 0, deleted: 0 }

  for (const id of ids) {
    const candidates: Candidate<T>[] = []
    const l = local.get(id)
    const r = remote.get(id)
    const lt = localTombs.get(id)
    const rt = remoteTombs.get(id)

    if (l) candidates.push({ kind: 'live', row: l, ms: at(l.updated_at), side: 'local' })
    if (r) candidates.push({ kind: 'live', row: r, ms: at(r.updated_at), side: 'remote' })
    if (lt) candidates.push({ kind: 'dead', ms: at(lt), side: 'local' })
    if (rt) candidates.push({ kind: 'dead', ms: at(rt), side: 'remote' })
    if (candidates.length === 0) continue

    const winner = pick(candidates)

    if (winner.kind === 'dead') {
      // Only a tombstone that actually won is carried forward. One that lost to a newer
      // live row is redundant: that row already beats every older copy elsewhere.
      tombstones.push({ table, id, deleted_at: new Date(winner.ms).toISOString() })
      if (l) stats.deleted++
      if (!lt) stats.pulled++
      else if (!rt) stats.pushed++
      continue
    }

    rows.push(winner.row)

    const sameAsLocal = l !== undefined && stableStringify(l) === stableStringify(winner.row)
    const sameAsRemote = r !== undefined && stableStringify(r) === stableStringify(winner.row)
    if (!sameAsLocal) stats.pulled++
    if (!sameAsRemote) stats.pushed++
  }

  return { rows, tombstones, stats }
}

/**
 * `active_vehicle_id` is which vehicle THIS device is looking at — a UI position, not
 * data. Syncing it would yank the other device's screen to a different vehicle, so the
 * local choice is kept and the remote's only fills a device that has none yet.
 */
function reconcileSettings(merged: SyncTables, local: SyncTables, remote: SyncTables): void {
  const row = merged.settings[0]
  if (!row) return
  const localActive = local.settings[0]?.active_vehicle_id ?? null
  const remoteActive = remote.settings[0]?.active_vehicle_id ?? null
  merged.settings[0] = { ...row, active_vehicle_id: localActive ?? remoteActive }
}

const zero = (): TableStats => ({ pulled: 0, pushed: 0, deleted: 0 })

export function mergeSnapshots(
  local: SyncSnapshot,
  remote: SyncSnapshot,
  writtenAt: string,
): MergeResult {
  const tables = emptyTables()
  const tombstones: Tombstone[] = []
  const stats = { total: zero() } as MergeStats

  for (const table of SYNC_TABLES) {
    const result = mergeTable(
      table,
      local.tables[table] as readonly SyncRow[],
      remote.tables[table] as readonly SyncRow[],
      tombsFor(local.tombstones, table),
      tombsFor(remote.tombstones, table),
    )

    // The cast is contained here: mergeTable is generic over SyncRow and every concrete
    // row type is one, but TS cannot see that through the lookup type.
    ;(tables as Record<SyncTableName, unknown[]>)[table] = result.rows
    tombstones.push(...result.tombstones)

    stats[table] = result.stats
    stats.total.pulled += result.stats.pulled
    stats.total.pushed += result.stats.pushed
    stats.total.deleted += result.stats.deleted
  }

  reconcileSettings(tables, local.tables, remote.tables)

  return {
    snapshot: {
      format: SNAPSHOT_FORMAT,
      version: SNAPSHOT_VERSION,
      written_at: writtenAt,
      tables,
      tombstones,
    },
    stats,
  }
}

/** True when the merge changed nothing on either side — lets the engine skip the upload
 *  entirely, which is the common case for a sync that has nothing to do. */
export const isNoop = (stats: MergeStats): boolean =>
  stats.total.pulled === 0 && stats.total.pushed === 0 && stats.total.deleted === 0

export const __test = { stableStringify, at, pick }
