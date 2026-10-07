/**
 * A SyncBackend that keeps the snapshot in a variable.
 *
 * Exists to drive the engine in tests, and doubles as the reference implementation: if the
 * interface needed anything Drive-shaped, this file could not exist.
 */

import {
  SyncConflictError,
  type RemoteSnapshot,
  type RemoteToken,
  type SyncAccount,
  type SyncBackend,
  type SyncSnapshot,
} from '../types'

export class MemoryBackend implements SyncBackend {
  readonly id = 'memory'
  readonly label = 'Bộ nhớ tạm'

  private stored: { snapshot: SyncSnapshot; token: RemoteToken } | null = null
  private counter = 0
  private account: SyncAccount | null = null

  /** Counts uploads, so a test can assert an up-to-date sync uploads nothing at all. */
  pushes = 0
  pulls = 0

  constructor(initial?: SyncSnapshot) {
    if (initial) this.stored = { snapshot: initial, token: String(++this.counter) }
  }

  isConfigured(): boolean {
    return true
  }

  async currentAccount(): Promise<SyncAccount | null> {
    return this.account
  }

  async connect(): Promise<SyncAccount> {
    this.account = { label: 'memory@test' }
    return this.account
  }

  async disconnect(): Promise<void> {
    this.account = null
  }

  async pull(): Promise<RemoteSnapshot | null> {
    this.pulls++
    if (!this.stored) return null
    // Deep copy: a caller must not be able to mutate the remote by editing what it read,
    // which a real backend gets for free by going over the wire.
    return { snapshot: structuredClone(this.stored.snapshot), token: this.stored.token }
  }

  async push(snapshot: SyncSnapshot, expected: RemoteToken | null): Promise<RemoteToken> {
    const actual = this.stored?.token ?? null
    // Covers both races: someone else wrote since our pull, and someone else created the
    // file when our pull found nothing.
    if (actual !== expected) {
      throw new SyncConflictError(`expected ${expected}, remote is ${actual}`)
    }

    this.pushes++
    const token = String(++this.counter)
    this.stored = { snapshot: structuredClone(snapshot), token }
    return token
  }

  /** Test helper: another device writing while ours was still thinking. */
  clobber(snapshot: SyncSnapshot): RemoteToken {
    const token = String(++this.counter)
    this.stored = { snapshot: structuredClone(snapshot), token }
    return token
  }

  peek(): SyncSnapshot | null {
    return this.stored ? structuredClone(this.stored.snapshot) : null
  }
}
