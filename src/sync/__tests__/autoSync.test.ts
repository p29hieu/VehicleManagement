import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTO_SYNC_INTERVAL_MS, AutoSync, type AutoSyncDeps } from '../autoSync'
import { SyncAuthError, SyncConflictError, type SyncBackend } from '../types'
import type { SyncOutcome } from '../engine'
import { MemoryBackend } from '../backends/memory'

const outcome = (at: string): SyncOutcome => ({
  status: 'synced',
  stats: { total: { pulled: 0, pushed: 0, deleted: 0 } } as SyncOutcome['stats'],
  token: '1',
  at,
  attempts: 1,
})

function connectedBackend(): SyncBackend {
  const b = new MemoryBackend()
  void b.connect()
  return b
}

interface Harness {
  auto: AutoSync
  backend: SyncBackend
  calls: () => number
}

function harness(sync: AutoSyncDeps['sync'], { online = true } = {}): Harness {
  let n = 0
  const backend = connectedBackend()
  const auto = new AutoSync({
    sync: async (b) => {
      n++
      return sync(b)
    },
    isOnline: () => online,
  })
  return { auto, backend, calls: () => n }
}

/** Drains the microtask queue so an async run() settles between assertions. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) await Promise.resolve()
}

/** A promise someone else decides when to settle — used to hold a sync mid-flight. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('AutoSync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses a five minute interval', () => {
    expect(AUTO_SYNC_INTERVAL_MS).toBe(5 * 60 * 1000)
  })

  it('syncs immediately on start, then once per interval', async () => {
    const h = harness(async () => outcome('2026-10-08T00:00:00.000Z'))
    h.auto.start(h.backend)
    await settle()
    expect(h.calls()).toBe(1) // does not make the user wait five minutes for the first one

    await vi.advanceTimersByTimeAsync(AUTO_SYNC_INTERVAL_MS)
    await settle()
    expect(h.calls()).toBe(2)

    await vi.advanceTimersByTimeAsync(AUTO_SYNC_INTERVAL_MS * 3)
    await settle()
    expect(h.calls()).toBe(5)
  })

  it('records when the last sync succeeded', async () => {
    const h = harness(async () => outcome('2026-10-08T09:30:00.000Z'))
    h.auto.start(h.backend)
    await settle()

    expect(h.auto.getStatus().lastSyncedAt).toBe('2026-10-08T09:30:00.000Z')
    expect(h.auto.getStatus().running).toBe(true)
  })

  // The behaviour the request was actually about.
  it('stops the schedule for good when the token can no longer be renewed', async () => {
    const h = harness(async () => {
      throw new SyncAuthError('silent renewal failed')
    })
    h.auto.start(h.backend)
    await settle()

    expect(h.auto.getStatus()).toMatchObject({ running: false, pausedBy: 'auth' })

    // And it really is stopped: two hours of ticks produce no further attempts.
    const after = h.calls()
    await vi.advanceTimersByTimeAsync(AUTO_SYNC_INTERVAL_MS * 24)
    await settle()
    expect(h.calls()).toBe(after)
  })

  it('keeps ticking through a conflict, which is transient', async () => {
    let fail = true
    const h = harness(async () => {
      if (fail) throw new SyncConflictError()
      return outcome('2026-10-08T00:05:00.000Z')
    })
    h.auto.start(h.backend)
    await settle()

    expect(h.auto.getStatus().running).toBe(true)
    expect(h.auto.getStatus().pausedBy).toBeNull()

    fail = false
    await vi.advanceTimersByTimeAsync(AUTO_SYNC_INTERVAL_MS)
    await settle()
    expect(h.auto.getStatus().lastSyncedAt).toBe('2026-10-08T00:05:00.000Z')
    expect(h.auto.getStatus().lastError).toBeNull()
  })

  it('keeps ticking through a network failure, and remembers why', async () => {
    const h = harness(async () => {
      throw new Error('Drive tải file thất bại (503)')
    })
    h.auto.start(h.backend)
    await settle()

    expect(h.auto.getStatus().running).toBe(true)
    expect(h.auto.getStatus().lastError).toBe('Drive tải file thất bại (503)')
  })

  it('skips the tick while offline rather than burning a failure', async () => {
    const h = harness(async () => outcome('2026-10-08T00:00:00.000Z'), { online: false })
    h.auto.start(h.backend)
    await settle()

    expect(h.calls()).toBe(0)
    expect(h.auto.getStatus().running).toBe(true) // still armed for when the network returns
    expect(h.auto.getStatus().lastError).toBe('Đang offline')
  })

  // A slow sync must not get a second one started on top of it.
  it('never runs two syncs at once', async () => {
    const gate = deferred()
    const h = harness(async () => {
      await gate.promise
      return outcome('2026-10-08T00:00:00.000Z')
    })

    h.auto.start(h.backend)
    await settle()
    expect(h.calls()).toBe(1)

    // Three intervals pass while the first sync is still in flight.
    await vi.advanceTimersByTimeAsync(AUTO_SYNC_INTERVAL_MS * 3)
    await settle()
    expect(h.calls()).toBe(1)

    gate.resolve()
    await settle()
    expect(h.auto.getStatus().syncing).toBe(false)
  })

  it('shares the mutex with a manual sync', async () => {
    const gate = deferred()
    const h = harness(async () => {
      await gate.promise
      return outcome('2026-10-08T00:00:00.000Z')
    })

    h.auto.start(h.backend)
    await settle()
    void h.auto.syncNow() // lands on top of the in-flight scheduled run
    await settle()

    expect(h.calls()).toBe(1)
    gate.resolve()
    await settle()
  })

  it('lets a manual sync through while paused, and un-pauses on success', async () => {
    let dead = true
    const h = harness(async () => {
      if (dead) throw new SyncAuthError()
      return outcome('2026-10-08T01:00:00.000Z')
    })

    h.auto.start(h.backend)
    await settle()
    expect(h.auto.getStatus().pausedBy).toBe('auth')

    dead = false // the user has reconnected
    await h.auto.syncNow()
    await settle()

    expect(h.auto.getStatus().pausedBy).toBeNull()
    expect(h.auto.getStatus().lastSyncedAt).toBe('2026-10-08T01:00:00.000Z')
  })

  // A React remount must not quietly undo the pause and start hammering Google again.
  it('keeps the auth pause across a restart; only resume() clears it', async () => {
    const h = harness(async () => {
      throw new SyncAuthError()
    })
    h.auto.start(h.backend)
    await settle()
    expect(h.auto.getStatus().pausedBy).toBe('auth')

    const afterPause = h.calls()
    h.auto.start(h.backend) // as a remount would
    await settle()
    await vi.advanceTimersByTimeAsync(AUTO_SYNC_INTERVAL_MS * 4)
    await settle()

    expect(h.calls()).toBe(afterPause)
    expect(h.auto.getStatus()).toMatchObject({ running: false, pausedBy: 'auth' })
  })

  it('re-arms the schedule after resume()', async () => {
    let dead = true
    const h = harness(async () => {
      if (dead) throw new SyncAuthError()
      return outcome('2026-10-08T02:00:00.000Z')
    })

    h.auto.start(h.backend)
    await settle()
    const stalled = h.calls()

    dead = false
    h.auto.resume()
    await settle()
    expect(h.auto.getStatus().running).toBe(true)

    await vi.advanceTimersByTimeAsync(AUTO_SYNC_INTERVAL_MS)
    await settle()
    expect(h.calls()).toBeGreaterThan(stalled + 1)
  })

  it('pauses rather than syncing when nothing is connected', async () => {
    const backend = new MemoryBackend() // never connected
    const auto = new AutoSync({
      sync: async () => outcome('2026-10-08T00:00:00.000Z'),
      isOnline: () => true,
    })
    auto.start(backend)
    await settle()

    expect(auto.getStatus()).toMatchObject({ running: false, pausedBy: 'disconnected' })
  })

  it('notifies subscribers, and stops once unsubscribed', async () => {
    const h = harness(async () => outcome('2026-10-08T00:00:00.000Z'))
    let seen = 0
    const off = h.auto.subscribe(() => {
      seen++
    })

    h.auto.start(h.backend)
    await settle()
    expect(seen).toBeGreaterThan(0)

    const before = seen
    off()
    await vi.advanceTimersByTimeAsync(AUTO_SYNC_INTERVAL_MS)
    await settle()
    expect(seen).toBe(before)
  })

  it('stop() ends the schedule', async () => {
    const h = harness(async () => outcome('2026-10-08T00:00:00.000Z'))
    h.auto.start(h.backend)
    await settle()
    const before = h.calls()

    h.auto.stop()
    await vi.advanceTimersByTimeAsync(AUTO_SYNC_INTERVAL_MS * 5)
    await settle()

    expect(h.calls()).toBe(before)
    expect(h.auto.getStatus().running).toBe(false)
  })
})
