/**
 * The sync loop: pull, merge, apply, push — retrying when the remote moved underneath us.
 *
 * I/O arrives as `SyncDeps` so the whole loop, conflict retries included, can be driven in
 * a test by two fake devices with no IndexedDB and no network.
 */

import { now as realNow } from '../lib/id'
import { isNoop, mergeSnapshots, type MergeStats } from './merge'
import { applySnapshot, patchSyncState, readLocalSnapshot } from './snapshot'
import {
  SyncConflictError,
  emptySnapshot,
  type RemoteToken,
  type SyncBackend,
  type SyncSnapshot,
  type SyncStateRow,
} from './types'

export interface SyncDeps {
  readLocal(writtenAt: string): Promise<SyncSnapshot>
  applyLocal(snapshot: SyncSnapshot): Promise<void>
  saveState(patch: Partial<SyncStateRow>): Promise<void>
  now(): string
}

export const defaultDeps: SyncDeps = {
  readLocal: readLocalSnapshot,
  applyLocal: applySnapshot,
  saveState: patchSyncState,
  now: realNow,
}

export interface SyncOutcome {
  /** `up-to-date` means the merge found nothing to move in either direction, so no upload
   *  happened at all — the common case, and the one worth not paying for. */
  status: 'synced' | 'up-to-date'
  stats: MergeStats
  token: RemoteToken | null
  at: string
  attempts: number
}

/**
 * How many times to re-pull and re-merge when the remote changes mid-push.
 *
 * Three is a ceiling on a livelock, not a reliability knob: losing the race repeatedly
 * means another device is pushing continuously, and the honest answer then is to stop and
 * let the user try again rather than spin.
 */
export const MAX_ATTEMPTS = 3

export async function syncOnce(
  backend: SyncBackend,
  deps: SyncDeps = defaultDeps,
): Promise<SyncOutcome> {
  let lastConflict: SyncConflictError | null = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const remote = await backend.pull()
    const at = deps.now()
    const local = await deps.readLocal(at)

    const { snapshot, stats } = mergeSnapshots(local, remote?.snapshot ?? emptySnapshot(at), at)

    // Both sides already agree. Uploading an identical blob would only burn quota and move
    // the remote token for nothing.
    if (isNoop(stats) && remote !== null) {
      await deps.saveState({ last_synced_at: at, last_token: remote.token })
      return { status: 'up-to-date', stats, token: remote.token, at, attempts: attempt }
    }

    // Apply before pushing. If the push then fails, local has still legitimately absorbed
    // the remote's rows — nothing is lost, and the next sync carries ours up.
    if (stats.total.pulled > 0 || stats.total.deleted > 0) await deps.applyLocal(snapshot)

    try {
      const token = await backend.push(snapshot, remote?.token ?? null)
      await deps.saveState({ last_synced_at: at, last_token: token })
      return { status: 'synced', stats, token, at, attempts: attempt }
    } catch (err) {
      if (!(err instanceof SyncConflictError)) throw err
      lastConflict = err
    }
  }

  throw lastConflict ?? new SyncConflictError()
}
