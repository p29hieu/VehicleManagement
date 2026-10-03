export const newId = (): string =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : // Safari < 15.4 and any non-secure context.
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

export const now = () => new Date().toISOString()

/** macOS normalises strings to NFD, so "Nguyễn" can arrive as 19 code units instead of 14.
 *  It renders identically but breaks ===, sorting and dedupe. Normalise at every input edge. */
export const nfc = (v: string) => v.normalize('NFC')
