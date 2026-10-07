/**
 * The seam between "what to sync" and "where it lives".
 *
 * Everything above this file (the merge engine, the UI) is backend-agnostic and pure.
 * Everything below it (Drive, and whatever replaces it) only has to move one JSON blob
 * around and report whether the remote moved while we were not looking.
 *
 * This is deliberately NOT the `vehicle-management/import` format from domain/schema.ts.
 * That one is an interchange format: it carries `suggested_*` rules the app proposed, a
 * partial settings object, no fuelTypes table and — fatally for sync — no tombstones.
 */

import type { FuelTypeRow } from '../domain/fuelTypes'
import type { MaintenanceRuleRow, ReminderRow } from '../db'
import type {
  AppSettings,
  ExpenseRecord,
  FuelEntry,
  ServiceRecord,
  Vehicle,
} from '../domain/types'

/** Tables that take part in sync. Order is the apply order: vehicles before anything that
 *  references a vehicle_id, so a half-applied merge never dangles. */
export const SYNC_TABLES = [
  'vehicles',
  'fuelTypes',
  'fuelEntries',
  'services',
  'expenses',
  'maintenanceRules',
  'reminders',
  'settings',
] as const

export type SyncTableName = (typeof SYNC_TABLES)[number]

/** Every synced row carries these two. The merge engine needs nothing else. */
export interface SyncRow {
  id: string
  updated_at: string
}

export interface SyncTables {
  vehicles: Vehicle[]
  fuelTypes: FuelTypeRow[]
  fuelEntries: FuelEntry[]
  services: ServiceRecord[]
  expenses: ExpenseRecord[]
  maintenanceRules: MaintenanceRuleRow[]
  reminders: ReminderRow[]
  settings: AppSettings[]
}

/**
 * A deleted row, remembered.
 *
 * Without this a delete is indistinguishable from "this device has not heard of that row
 * yet", so the next merge resurrects it. Tombstones live in their own table rather than as
 * a `deleted_at` column precisely so no existing read path has to learn to filter.
 */
export interface Tombstone {
  table: SyncTableName
  id: string
  deleted_at: string
}

export const SNAPSHOT_FORMAT = 'vehicle-management/sync'
export const SNAPSHOT_VERSION = 1

export interface SyncSnapshot {
  format: typeof SNAPSHOT_FORMAT
  version: typeof SNAPSHOT_VERSION
  /** Diagnostic only. Merge decisions use per-row `updated_at`, never this. */
  written_at: string
  tables: SyncTables
  tombstones: Tombstone[]
}

/**
 * Opaque concurrency marker. Drive uses the file's `version` field; another backend might
 * use an ETag or a row version. The engine only compares it for equality and hands it
 * back, so its shape is the backend's business.
 */
export type RemoteToken = string

export interface RemoteSnapshot {
  snapshot: SyncSnapshot
  token: RemoteToken
}

/** Thrown by push() when the remote moved since the token was issued. The engine answers
 *  by pulling again and re-merging, so this is control flow, not a failure. */
export class SyncConflictError extends Error {
  constructor(message = 'Remote changed since the last pull') {
    super(message)
    this.name = 'SyncConflictError'
  }
}

/** Raised when the user has not connected, or the grant expired and silent renewal
 *  failed. The UI turns this into "bấm Kết nối lại", never into a stack trace. */
export class SyncAuthError extends Error {
  constructor(message = 'Not connected') {
    super(message)
    this.name = 'SyncAuthError'
  }
}

export interface SyncAccount {
  /** Shown so the user can tell which Google account holds the data. */
  label: string
}

/**
 * A remote that holds exactly one snapshot.
 *
 * Deliberately tiny: no per-record API, no queries, no partial reads. A backend that can
 * store and return one blob with a concurrency token is enough, which is what makes Drive,
 * a file on disk and a row in Postgres all equally implementable.
 */
export interface SyncBackend {
  /** Stable key, persisted in syncState so the app knows which backend wrote last. */
  readonly id: string
  /** Shown in the UI: "Google Drive". */
  readonly label: string

  /** False when the backend cannot work at all — e.g. no client id was built in. */
  isConfigured(): boolean

  /** Resolves to null when not connected. Must not prompt. */
  currentAccount(): Promise<SyncAccount | null>

  /** May open a popup, so it is only ever called from a user gesture. */
  connect(): Promise<SyncAccount>

  /** Forgets local credentials. Does not touch remote data. */
  disconnect(): Promise<void>

  /** Null when the remote holds nothing yet (first ever sync). */
  pull(): Promise<RemoteSnapshot | null>

  /**
   * @param expected token from the pull this push is based on, or null if that pull found
   *        nothing. Implementations MUST throw SyncConflictError rather than overwrite
   *        when the remote no longer matches.
   */
  push(snapshot: SyncSnapshot, expected: RemoteToken | null): Promise<RemoteToken>
}

export interface SyncStateRow {
  id: 'singleton'
  backend_id: string | null
  account_label: string | null
  last_synced_at: string | null
  /** Token of the snapshot we last successfully pushed or pulled. */
  last_token: RemoteToken | null
}

export const emptyTables = (): SyncTables => ({
  vehicles: [],
  fuelTypes: [],
  fuelEntries: [],
  services: [],
  expenses: [],
  maintenanceRules: [],
  reminders: [],
  settings: [],
})

export const emptySnapshot = (written_at: string): SyncSnapshot => ({
  format: SNAPSHOT_FORMAT,
  version: SNAPSHOT_VERSION,
  written_at,
  tables: emptyTables(),
  tombstones: [],
})
