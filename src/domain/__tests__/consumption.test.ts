import { describe, expect, it } from 'vitest'
import {
  aggregateEstimate,
  consumptionSeries,
  averageConsumption,
  consumptionByEntry,
  forecastNextFill,
  fullTankSegments,
  litersOf,
} from '../consumption'
import type { FuelEntry, Vehicle } from '../types'

const car: Vehicle = {
  id: 'V', name: 'Test', kind: 'car', make: null, model: null, plate: null, year: null,
  fuel_type: 'ron95', tank_capacity_l: null, battery_kwh: null, initial_odometer_km: 0,
  odometer_offset_km: 0, consumption_min: 4, consumption_max: 25, is_active: true,
  note: null, updated_at: '',
}
const bike: Vehicle = { ...car, kind: 'motorcycle', consumption_min: 1.2, consumption_max: 6 }

let n = 0
const fill = (p: Partial<FuelEntry>): FuelEntry => ({
  id: `E${++n}`, vehicle_id: 'V', date: '2026-01-01', time: null, odometer_km: null, fuel_type: null,
  quantity: null, unit_price: null, total_amount: null, is_full_tank: true, missed_fill: false,
  station: null, payment_method: null, note: null, updated_at: '', ...p,
})

describe('litersOf', () => {
  it('derives litres from money and unit price when quantity is absent', () => {
    expect(litersOf(fill({ total_amount: 500_000, unit_price: 21_000 }))).toBeCloseTo(23.81, 2)
  })
  it('prefers an entered quantity over the derived one', () => {
    expect(litersOf(fill({ quantity: 20, total_amount: 500_000, unit_price: 21_000 }))).toBe(20)
  })
})

describe('fullTankSegments — the off-by-one', () => {
  it('excludes the opening full fill and includes the closing one', () => {
    const segs = fullTankSegments([
      fill({ odometer_km: 1000, quantity: 40 }),            // anchor: its 40 L is NOT counted
      fill({ odometer_km: 1500, quantity: 50 }),            // closes: 50 L over 500 km
    ])
    expect(segs).toHaveLength(1)
    expect(segs[0]!.liters).toBe(50)
    expect(segs[0]!.distance).toBe(500)
    expect(segs[0]!.l100).toBeCloseTo(10, 6)
  })

  it('folds a partial fill into the following full tank as ONE segment', () => {
    // The bug in linuxserver/Clarkson: it emits nothing for this run and loses the fuel.
    const segs = fullTankSegments([
      fill({ odometer_km: 1000, quantity: 40 }),
      fill({ odometer_km: 1200, quantity: 10, is_full_tank: false }),
      fill({ odometer_km: 1500, quantity: 40 }),
    ])
    expect(segs).toHaveLength(1)
    expect(segs[0]!.liters).toBe(50)        // 10 partial + 40 closing
    expect(segs[0]!.distance).toBe(500)
  })

  it('discards litres from a leading partial, whose starting tank level is unknown', () => {
    // The bug in hargata/lubelog: it keeps them and under-reports consumption.
    const segs = fullTankSegments([
      fill({ odometer_km: 1000, quantity: 5, is_full_tank: false }),
      fill({ odometer_km: 1100, quantity: 50 }),             // first anchor
      fill({ odometer_km: 1600, quantity: 45 }),
    ])
    expect(segs).toHaveLength(1)
    expect(segs[0]!.fromOdo).toBe(1100)
    expect(segs[0]!.liters).toBe(45)
  })

  it('drops the run around an admitted missed fill but re-anchors after it', () => {
    const segs = fullTankSegments([
      fill({ odometer_km: 1000, quantity: 40 }),
      fill({ odometer_km: 1500, quantity: 40, missed_fill: true }),
      fill({ odometer_km: 2000, quantity: 45 }),
    ])
    expect(segs).toHaveLength(1)
    expect(segs[0]!.fromOdo).toBe(1500)      // re-anchored at the missed-fill entry
    expect(segs[0]!.liters).toBe(45)
  })

  it('treats odometer 0 as "not recorded" and carries the fuel forward', () => {
    const segs = fullTankSegments([
      fill({ odometer_km: 1000, quantity: 40, date: '2026-01-01' }),
      fill({ odometer_km: 0, quantity: 10, date: '2026-01-02' }),   // forgot the reading
      fill({ odometer_km: 1500, quantity: 40, date: '2026-01-03' }),
    ])
    expect(segs).toHaveLength(1)
    expect(segs[0]!.liters).toBe(50)
    expect(segs[0]!.distance).toBe(500)
  })

  it('keeps the fuel when the odometer does not advance', () => {
    const segs = fullTankSegments([
      fill({ odometer_km: 1000, quantity: 40 }),
      fill({ odometer_km: 1000, quantity: 10, date: '2026-01-02' }),
      fill({ odometer_km: 1500, quantity: 40, date: '2026-01-03' }),
    ])
    expect(segs).toHaveLength(1)
    expect(segs[0]!.liters).toBe(50)
  })
})

describe('averageConsumption', () => {
  it('weights by distance, not by taking the mean of per-tank ratios', () => {
    const entries = [
      fill({ odometer_km: 500, quantity: 10, date: '2026-01-01' }),   // anchor, fuel dropped
      fill({ odometer_km: 600, quantity: 10, date: '2026-01-02' }),   // 10 L / 100 km  = 10
      fill({ odometer_km: 1600, quantity: 50, date: '2026-01-03' }),  // 50 L / 1000 km =  5
    ]
    // Mean of the ratios would be 7.5; the distance-weighted figure is 60 L / 1100 km.
    expect(averageConsumption(entries, car)!.l100).toBeCloseTo(5.4545, 3)
  })

  it('falls back to the aggregate estimate when nothing is marked full', () => {
    const entries = [
      fill({ odometer_km: 1000, quantity: 20, is_full_tank: false }),
      fill({ odometer_km: 1500, quantity: 40, is_full_tank: false }),
    ]
    const r = averageConsumption(entries, car)!
    expect(r.exact).toBe(false)
    expect(r.l100).toBeCloseTo(8, 6)             // 40 L over 500 km, first fill excluded
  })
})

describe('aggregateEstimate — distance must follow the litres', () => {
  it('ignores the distance of a fill whose volume is unknown', () => {
    const entries = [
      fill({ odometer_km: 1000, date: '2026-01-01', is_full_tank: false }),
      // 1000 km covered, but no litres recorded for it: neither side may count.
      fill({ odometer_km: 2000, date: '2026-01-02', is_full_tank: false }),
      fill({ odometer_km: 2100, date: '2026-01-03', quantity: 8, is_full_tank: false }),
    ]
    const r = aggregateEstimate(entries)!
    // Correct: 8 L over the 100 km that fill actually covers = 8 L/100km.
    // The earlier first-to-last formula divided by all 1100 km and returned 0.73.
    expect(r.distanceKm).toBe(100)
    expect(r.l100).toBeCloseTo(8, 6)
    expect(r.basis).toBe(1)
  })

  it('flags an implausible estimate instead of hiding it', () => {
    const entries = [
      fill({ odometer_km: 1000, date: '2026-01-01', is_full_tank: false }),
      fill({ odometer_km: 9000, date: '2026-01-02', quantity: 10, is_full_tank: false }),
    ]
    const r = averageConsumption(entries, car)!
    expect(r.l100).toBeCloseTo(0.125, 3)      // far below the 4 L/100km car floor
    expect(r.outOfBand).toBe(true)
  })
})

describe('the real Drivvo data (golden numbers)', () => {
  // Accent: 14 fills, all 500.000 đ, none marked full, 65.623 -> 69.249 km.
  const accent = [
    65623, 65975, 66240, 66528, 66751, 67029, 67328, 67659, 67874, 68084, 68376, 68691, 68950, 69249,
  ].map((odo, i) =>
    fill({ odometer_km: odo, total_amount: 500_000, unit_price: 21_000, is_full_tank: false,
           date: `2026-07-${String((i % 28) + 1).padStart(2, '0')}` }),
  )

  it('reproduces 8,54 L/100km at 21.000 đ/L', () => {
    const r = aggregateEstimate(accent)!
    expect(r.distanceKm).toBe(3626)
    expect(r.l100).toBeCloseTo(8.54, 2)
    expect(r.exact).toBe(false)
  })

  it('gives each fill its own interval estimate when none is marked full', () => {
    const map = consumptionByEntry(accent, car)

    // One per fill EXCEPT the first, which has no interval behind it to measure.
    expect(map.size).toBe(accent.length - 1)
    expect(map.has(accent[0]!.id)).toBe(false)

    // Distinct per row, which the old behaviour (one number repeated) was not.
    const distinct = new Set([...map.values()].map((v) => v.l100.toFixed(4)))
    expect(distinct.size).toBeGreaterThan(1)

    // Each is this fill's litres over the distance since the previous one.
    const second = map.get(accent[1]!.id)!
    const distance = accent[1]!.odometer_km! - accent[0]!.odometer_km!
    expect(second.distanceKm).toBe(distance)
    expect(second.l100).toBeCloseTo((500_000 / 21_000 / distance) * 100, 6)
    expect(second.exact).toBe(false)
  })

  it('still reports the aggregate, not the mean of the per-row estimates', () => {
    // The per-row figures swing with how far the user happened to drive before refilling;
    // averaging them would weigh a 200 km interval like a 400 km one. The overview keeps
    // the distance-weighted aggregate instead.
    const map = consumptionByEntry(accent, car)
    const meanOfRows =
      [...map.values()].reduce((a, v) => a + v.l100, 0) / map.size
    const aggregate = aggregateEstimate(accent)!.l100

    expect(aggregate).toBeCloseTo(8.54, 2)
    expect(meanOfRows).not.toBeCloseTo(aggregate, 2)
  })

  it('skips an interval whose fuel was admitted to be unrecorded', () => {
    const entries = [
      fill({ odometer_km: 1000, total_amount: 210_000, unit_price: 21_000, is_full_tank: false, date: '2026-01-01' }),
      fill({ odometer_km: 1200, total_amount: 210_000, unit_price: 21_000, is_full_tank: false, date: '2026-01-05',
             missed_fill: true }),
      fill({ odometer_km: 1400, total_amount: 210_000, unit_price: 21_000, is_full_tank: false, date: '2026-01-09' }),
    ]
    const map = consumptionByEntry(entries, car)

    // The flagged fill itself, and the interval that starts at it, are both unusable.
    expect(map.has(entries[1]!.id)).toBe(false)
    expect(map.has(entries[2]!.id)).toBe(false)
  })

  it('skips a fill with no odometer reading rather than inventing a distance', () => {
    const entries = [
      fill({ odometer_km: 1000, total_amount: 210_000, unit_price: 21_000, is_full_tank: false, date: '2026-01-01' }),
      fill({ odometer_km: null, total_amount: 210_000, unit_price: 21_000, is_full_tank: false, date: '2026-01-05' }),
      fill({ odometer_km: 1400, total_amount: 210_000, unit_price: 21_000, is_full_tank: false, date: '2026-01-09' }),
    ]
    const map = consumptionByEntry(entries, car)
    expect(map.has(entries[1]!.id)).toBe(false)
  })

  it('flags a per-row estimate that falls outside the vehicle band', () => {
    // 10 L over 20 km = 50 L/100km: a wrong odometer, not a thirsty car.
    const entries = [
      fill({ odometer_km: 1000, total_amount: 210_000, unit_price: 21_000, is_full_tank: false, date: '2026-01-01' }),
      fill({ odometer_km: 1020, total_amount: 210_000, unit_price: 21_000, is_full_tank: false, date: '2026-01-05' }),
    ]
    const r = consumptionByEntry(entries, car).get(entries[1]!.id)!
    expect(r.l100).toBeCloseTo(50, 1)
    expect(r.outOfBand).toBe(true)
  })

  it('accepts a motorcycle at 2,3 L/100km that a car-shaped band would reject', () => {
    const moto = [20408, 20583, 20754, 20919].map((odo, i) =>
      fill({ odometer_km: odo, total_amount: [70_000, 97_000, 100_000, 50_000][i]!,
             unit_price: 21_000, is_full_tank: false, date: `2026-0${i + 6}-01` }),
    )
    const r = averageConsumption(moto, bike)!
    expect(r.l100).toBeCloseTo(2.3, 1)
    expect(r.l100).toBeGreaterThanOrEqual(bike.consumption_min)
    expect(r.l100).toBeLessThan(car.consumption_min)   // a car band would have rejected it
  })
})

describe('forecastNextFill', () => {
  it('refuses to guess below three fills', () => {
    expect(forecastNextFill([fill({ odometer_km: 100, date: '2026-01-01' })])).toBeNull()
  })

  it('projects the next fill from the recent interval and the daily distance', () => {
    const entries = [
      fill({ odometer_km: 1000, date: '2026-01-01' }),
      fill({ odometer_km: 1300, date: '2026-01-11' }),
      fill({ odometer_km: 1600, date: '2026-01-21' }),
    ]
    const f = forecastNextFill(entries, 5, new Date('2026-01-21T00:00:00Z'))!
    expect(f.kmPerDay).toBeCloseTo(30, 6)          // 600 km over 20 days
    expect(f.kmRemaining).toBe(300)                // mean interval
    expect(f.dueOdometerKm).toBe(1900)
    expect(f.dueDate).toBe('2026-01-31')           // 300 km / 30 km per day = 10 days
    expect(f.daysRemaining).toBe(10)
  })
})

describe('consumptionSeries', () => {
  it('emits one point per measured segment when full tanks exist', () => {
    const entries = [
      fill({ odometer_km: 1000, quantity: 40, date: '2026-01-01' }),
      fill({ odometer_km: 1500, quantity: 50, date: '2026-01-10' }),
      fill({ odometer_km: 2000, quantity: 45, date: '2026-01-20' }),
    ]
    const pts = consumptionSeries(entries, car)
    expect(pts).toHaveLength(2)
    expect(pts.every((p) => p.exact)).toBe(true)
    expect(pts[0]).toMatchObject({ date: '2026-01-10', odometerKm: 1500 })
    expect(pts[0]!.l100).toBeCloseTo(10, 6)
  })

  it('without full tanks, shows the estimate settling instead of a single point', () => {
    const entries = [
      fill({ odometer_km: 1000, quantity: 10, is_full_tank: false, date: '2026-01-01' }),
      fill({ odometer_km: 1100, quantity: 10, is_full_tank: false, date: '2026-01-02' }),
      fill({ odometer_km: 1300, quantity: 10, is_full_tank: false, date: '2026-01-03' }),
    ]
    const pts = consumptionSeries(entries, car)
    expect(pts).toHaveLength(2)
    expect(pts.every((p) => !p.exact)).toBe(true)
    expect(pts[0]!.l100).toBeCloseTo(10, 6)      // 10 L over 100 km
    expect(pts[1]!.l100).toBeCloseTo(6.667, 2)   // 20 L over 300 km
  })
})

describe('price fallback', () => {
  const noPrice = (odo: number, total: number, date: string) =>
    fill({ odometer_km: odo, total_amount: total, is_full_tank: false, date, fuel_type: 'ron95' })

  it('yields nothing when neither the entry nor the type has a price', () => {
    const entries = [noPrice(1000, 500_000, '2026-01-01'), noPrice(1500, 500_000, '2026-01-02')]
    expect(averageConsumption(entries, car)).toBeNull()
  })

  it("uses the type's current price when the entry recorded none, and says so", () => {
    const entries = [noPrice(1000, 500_000, '2026-01-01'), noPrice(1500, 500_000, '2026-01-02')]
    const r = averageConsumption(entries, car, () => 21_000)!
    expect(r.l100).toBeCloseTo((500_000 / 21_000 / 500) * 100, 6)
    expect(r.usedFallbackPrice).toBe(true)
  })

  it("does not claim a fallback when every entry carried its own price", () => {
    const entries = [
      fill({ odometer_km: 1000, total_amount: 500_000, unit_price: 20_000, is_full_tank: false, date: '2026-01-01' }),
      fill({ odometer_km: 1500, total_amount: 500_000, unit_price: 20_000, is_full_tank: false, date: '2026-01-02' }),
    ]
    const r = averageConsumption(entries, car, () => 21_000)!
    expect(r.usedFallbackPrice).toBe(false)
    expect(r.l100).toBeCloseTo((500_000 / 20_000 / 500) * 100, 6)   // the entry's own price wins
  })

  it('reproduces 8,54 L/100km on the real Accent log via the fallback alone', () => {
    const dates = ['07-15','07-21','07-25','07-31','08-05','08-06','08-11','08-14','08-25','08-31','09-05','09-12','09-16','09-21']
    const odos = [65623,65975,66240,66528,66751,67029,67328,67659,67874,68084,68376,68691,68950,69249]
    const log = odos.map((o, i) => noPrice(o, 500_000, `2026-${dates[i]}`))
    const r = averageConsumption(log, car, () => 21_000)!
    expect(r.l100).toBeCloseTo(8.54, 2)
    expect(r.usedFallbackPrice).toBe(true)
  })
})
