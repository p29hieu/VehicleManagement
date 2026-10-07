export const newId = (): string =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : // Safari < 15.4 and any non-secure context.
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

export const now = () => new Date().toISOString()

/**
 * Stamp for rows written before `updated_at` existed — the Dexie v4 backfill, and the
 * built-in fuel types.
 *
 * A fixed literal, NOT `now()`: every device writes the identical value, so when two of
 * them merge these rows they land on the deterministic content tie-break in sync/merge.ts
 * rather than whichever device upgraded last winning every row.
 */
export const PRE_SYNC_EPOCH = '2026-10-07T00:00:00.000Z'

/** macOS normalises strings to NFD, so "Nguyễn" can arrive as 19 code units instead of 14.
 *  It renders identically but breaks ===, sorting and dedupe. Normalise at every input edge. */
export const nfc = (v: string) => v.normalize('NFC')
