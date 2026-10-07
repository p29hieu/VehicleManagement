/**
 * Runs a sync every few minutes once the user has connected, and stops when the grant dies.
 *
 * A module-level object rather than a hook, because the scheduler has to outlive any
 * screen: the sync panel lives in Settings, which is lazy loaded and unmounts the moment
 * you navigate away. A timer owned by that component would only tick while you were
 * looking at it — the opposite of what auto-sync is for.
 */

import { syncOnce, type SyncOutcome } from './engine'
import { SyncAuthError, type SyncBackend } from './types'

export const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000

export type PauseReason =
  /** Silent token renewal failed. Only a user gesture can fix it, so stop asking. */
  | 'auth'
  /** Nothing connected, or no client id was built in. */
  | 'disconnected'

export interface AutoSyncStatus {
  /** Ticking. False while paused or disconnected. */
  running: boolean
  syncing: boolean
  pausedBy: PauseReason | null
  lastSyncedAt: string | null
  /** Last failure that did NOT stop the schedule — reported quietly, retried next tick. */
  lastError: string | null
}

export interface AutoSyncDeps {
  sync: (backend: SyncBackend) => Promise<SyncOutcome>
  isOnline: () => boolean
}

const defaultDeps: AutoSyncDeps = {
  sync: syncOnce,
  isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine),
}

const IDLE: AutoSyncStatus = {
  running: false,
  syncing: false,
  pausedBy: null,
  lastSyncedAt: null,
  lastError: null,
}

export class AutoSync {
  private status: AutoSyncStatus = IDLE
  private listeners = new Set<() => void>()
  private timer: ReturnType<typeof setInterval> | null = null
  private backend: SyncBackend | null = null
  /** Guards against two syncs overlapping — a slow one running past the next tick, or a
   *  manual tap landing on a scheduled run. Two in flight would merge against each other's
   *  half-written state and conflict for no reason. */
  private inFlight: Promise<SyncOutcome | null> | null = null

  constructor(private readonly deps: AutoSyncDeps = defaultDeps) {}

  getStatus = (): AutoSyncStatus => this.status

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  /** Replaces the status object rather than mutating it, so useSyncExternalStore can see
   *  a change by identity. */
  private patch(next: Partial<AutoSyncStatus>): void {
    this.status = { ...this.status, ...next }
    for (const fn of this.listeners) fn()
  }

  /** Begins, or restarts, the schedule. Safe to call repeatedly. */
  start(backend: SyncBackend, intervalMs: number = AUTO_SYNC_INTERVAL_MS): void {
    this.backend = backend
    this.clearTimer()

    if (!backend.isConfigured()) {
      this.patch({ running: false, pausedBy: 'disconnected' })
      return
    }

    // An auth pause survives a restart. App.tsx calls start() on mount, and React remounts
    // components freely — without this, a remount would quietly re-arm a schedule that can
    // only fail, hammering Google every five minutes. Only resume(), which the user
    // triggers by reconnecting, clears it.
    if (this.status.pausedBy === 'auth') return

    this.timer = setInterval(() => void this.tick(), intervalMs)
    this.patch({ running: true, pausedBy: null, lastError: null })
    void this.tick()
  }

  stop(): void {
    this.clearTimer()
    this.patch({ running: false })
  }

  /** Called after the user reconnects: clears the pause and resumes ticking. */
  resume(): void {
    if (!this.backend) return
    this.patch({ pausedBy: null })
    this.start(this.backend)
  }

  /** The manual "Đồng bộ ngay" path. Shares the mutex with the schedule, and rethrows so
   *  the panel can explain the failure. */
  syncNow(): Promise<SyncOutcome | null> {
    return this.run(true)
  }

  private clearTimer(): void {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
  }

  private async tick(): Promise<void> {
    // A scheduled tick never surfaces its own errors; run() has already recorded them.
    await this.run(false).catch(() => undefined)
  }

  private async run(manual: boolean): Promise<SyncOutcome | null> {
    const backend = this.backend
    if (!backend) return null
    // `manual` is what lets the panel's "Đồng bộ ngay" retry out of a pause; the schedule
    // itself cannot arrive here while paused, because pausing clears the timer.
    void manual
    if (this.inFlight) return this.inFlight

    if (!this.deps.isOnline()) {
      // Offline is temporary and self-correcting, so the schedule stays armed.
      this.patch({ lastError: 'Đang offline' })
      return null
    }

    const work = (async (): Promise<SyncOutcome | null> => {
      const account = await backend.currentAccount()
      if (!account) {
        this.clearTimer()
        this.patch({ running: false, syncing: false, pausedBy: 'disconnected' })
        return null
      }

      this.patch({ syncing: true, lastError: null })
      try {
        const outcome = await this.deps.sync(backend)
        this.patch({ syncing: false, lastSyncedAt: outcome.at, lastError: null, pausedBy: null })
        return outcome
      } catch (err: unknown) {
        if (err instanceof SyncAuthError) {
          // The access token lasts an hour and there is no refresh token; renewal needs a
          // popup, which a timer cannot open. Retrying on a schedule would fail every five
          // minutes forever, so stop and let the UI ask for one tap.
          this.clearTimer()
          this.patch({ syncing: false, running: false, pausedBy: 'auth', lastError: null })
        } else {
          // Conflicts and network blips are expected and transient: keep ticking.
          this.patch({
            syncing: false,
            lastError: err instanceof Error ? err.message : String(err),
          })
        }
        throw err
      }
    })()

    this.inFlight = work
    try {
      return await work
    } finally {
      this.inFlight = null
    }
  }
}

export const autoSync = new AutoSync()
