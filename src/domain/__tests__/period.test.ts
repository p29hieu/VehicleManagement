import { describe, expect, it } from 'vitest'
import {
  inRange,
  monthsBefore,
  periodRange,
  toISODate,
  withinPeriod,
  type DateRange,
} from '../period'

describe('monthsBefore', () => {
  it('steps back whole calendar months', () => {
    expect(monthsBefore('2026-10-09', 1)).toBe('2026-09-09')
    expect(monthsBefore('2026-10-09', 3)).toBe('2026-07-09')
    expect(monthsBefore('2026-10-09', 6)).toBe('2026-04-09')
  })

  it('crosses the year boundary', () => {
    expect(monthsBefore('2026-02-15', 3)).toBe('2025-11-15')
    expect(monthsBefore('2026-01-31', 1)).toBe('2025-12-31')
  })

  // The reason this is not setMonth(m - n): that rolls 31 March back to 3 March, skipping
  // February entirely and silently dropping a month of records from the window.
  it('clamps to the end of a shorter target month', () => {
    expect(monthsBefore('2026-03-31', 1)).toBe('2026-02-28')
    expect(monthsBefore('2026-05-31', 1)).toBe('2026-04-30')
    expect(monthsBefore('2026-10-31', 8)).toBe('2026-02-28')
  })

  it('lands on 29 February in a leap year', () => {
    expect(monthsBefore('2028-03-31', 1)).toBe('2028-02-29')
  })

  it('never lands in a later month than asked for', () => {
    for (let day = 28; day <= 31; day++) {
      for (let m = 1; m <= 12; m++) {
        const iso = `2026-${String(m).padStart(2, '0')}-${day}`
        if (new Date(iso).getUTCDate() !== day) continue // skip dates that do not exist
        const back = monthsBefore(iso, 1)
        expect(Number(back.split('-')[1])).toBe(m === 1 ? 12 : m - 1)
      }
    }
  })
})

describe('periodRange', () => {
  const today = '2026-10-09'

  it('leaves both ends open for "all"', () => {
    expect(periodRange('all', today)).toEqual({ from: null, to: null })
  })

  it('ends every preset window at today', () => {
    expect(periodRange('1m', today)).toEqual({ from: '2026-09-09', to: today })
    expect(periodRange('3m', today)).toEqual({ from: '2026-07-09', to: today })
    expect(periodRange('6m', today)).toEqual({ from: '2026-04-09', to: today })
  })

  it('hands a custom range straight back, unmassaged', () => {
    const custom: DateRange = { from: '2026-01-01', to: '2026-06-30' }
    expect(periodRange('custom', today, custom)).toEqual(custom)
  })

  it('treats a missing custom end as unbounded rather than guessing one', () => {
    expect(periodRange('custom', today, { from: '2026-01-01', to: null })).toEqual({
      from: '2026-01-01',
      to: null,
    })
  })

  // A from-after-to is the user's typo to see and fix, not ours to quietly swap.
  it('does not reorder a backwards custom range', () => {
    const backwards: DateRange = { from: '2026-06-30', to: '2026-01-01' }
    expect(periodRange('custom', today, backwards)).toEqual(backwards)
    expect(withinPeriod([{ date: '2026-03-01' }], backwards)).toEqual([])
  })
})

describe('inRange', () => {
  const range: DateRange = { from: '2026-09-09', to: '2026-10-09' }

  it('includes both boundary days', () => {
    expect(inRange('2026-09-09', range)).toBe(true)
    expect(inRange('2026-10-09', range)).toBe(true)
  })

  it('excludes the days just outside', () => {
    expect(inRange('2026-09-08', range)).toBe(false)
    expect(inRange('2026-10-10', range)).toBe(false)
  })

  it('treats a null end as unbounded', () => {
    expect(inRange('1999-01-01', { from: null, to: '2026-10-09' })).toBe(true)
    expect(inRange('2099-01-01', { from: '2026-09-09', to: null })).toBe(true)
    expect(inRange('2099-01-01', { from: null, to: null })).toBe(true)
  })
})

describe('withinPeriod', () => {
  const rows = [
    { id: 'a', date: '2026-07-15' },
    { id: 'b', date: '2026-09-09' },
    { id: 'c', date: '2026-10-07' },
    { id: 'd', date: '2026-10-09' },
  ]

  it('keeps only the rows inside the window', () => {
    const got = withinPeriod(rows, periodRange('1m', '2026-10-09'))
    expect(got.map((r) => r.id)).toEqual(['b', 'c', 'd'])
  })

  it('keeps everything for "all"', () => {
    expect(withinPeriod(rows, periodRange('all', '2026-10-09'))).toHaveLength(4)
  })

  it('does not mutate or reorder the input', () => {
    const before = rows.map((r) => r.id)
    withinPeriod(rows, periodRange('3m', '2026-10-09'))
    expect(rows.map((r) => r.id)).toEqual(before)
  })
})

describe('toISODate', () => {
  it('formats from local parts, not UTC', () => {
    // An ISO string sliced off toISOString() would read as the previous day for anyone
    // east of UTC in the small hours — which is most of this app's users.
    expect(toISODate(new Date(2026, 9, 9, 1, 30))).toBe('2026-10-09')
  })

  it('pads single-digit months and days', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
