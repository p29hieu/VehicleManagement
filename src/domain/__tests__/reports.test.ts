import { describe, expect, it } from 'vitest'
import { costSummary, fuelOverview, monthlyCosts } from '../reports'
import type { ExpenseRecord, FuelEntry, ServiceRecord, Vehicle } from '../types'

const car: Vehicle = {
  id: 'V', name: 'Test', kind: 'car', make: null, model: null, plate: null, year: null,
  fuel_type: 'ron95', tank_capacity_l: null, battery_kwh: null, initial_odometer_km: 0,
  odometer_offset_km: 0, consumption_min: 4, consumption_max: 25, is_active: true,
  note: null, updated_at: '',
}

let n = 0
const fill = (date: string, odo: number | null, total: number): FuelEntry => ({
  id: `F${++n}`, vehicle_id: 'V', date, time: null, odometer_km: odo, fuel_type: null, quantity: null,
  unit_price: null, total_amount: total, is_full_tank: false, missed_fill: false,
  station: null, payment_method: null, note: null, updated_at: '',
})
const svc = (date: string, odo: number | null, total: number): ServiceRecord => ({
  id: `S${++n}`, vehicle_id: 'V', date, time: null, odometer_km: odo, items: [{ name: 'x', amount: null }],
  total_amount: total, workshop: null, note: null, updated_at: '',
})
const exp = (date: string, total: number): ExpenseRecord => ({
  id: `X${++n}`, vehicle_id: 'V', date, time: null, odometer_km: null, category: 'Gửi xe',
  total_amount: total, note: null, updated_at: '',
})

describe('costSummary — the Hyundai Accent golden numbers', () => {
  // 14 fills of 500.000 đ, 65.623 -> 69.249 km, 15/07 -> 21/09; services on 12/06, 18/06, 10/07.
  const dates = ['07-15','07-21','07-25','07-31','08-05','08-06','08-11','08-14','08-25','08-31','09-05','09-12','09-16','09-21']
  const odos = [65623,65975,66240,66528,66751,67029,67328,67659,67874,68084,68376,68691,68950,69249]
  const fuel = odos.map((o, i) => fill(`2026-${dates[i]}`, o, 500_000))
  const services = [
    svc('2026-06-12', 62900, 300_000),
    svc('2026-06-18', 65227, 500_000),
    svc('2026-07-10', 65228, 900_000),
  ]

  const r = costSummary(fuel, services, [])

  it('totals every fill, plus maintenance', () => {
    expect(r.fuelTotal).toBe(7_000_000)
    expect(r.serviceTotal).toBe(1_700_000)
    expect(r.total).toBe(8_700_000)
  })

  it('measures distance from the fuel chain only, ignoring the suspect service odometer', () => {
    // 62.900 km on 12/06 contradicts 65.227 km on 18/06; including it would add 2.723 km.
    expect(r.distanceKm).toBe(3626)
  })

  it('spans every kind of record, not just fills', () => {
    expect(r.firstDate).toBe('2026-06-12')
    expect(r.lastDate).toBe('2026-09-21')
    expect(r.days).toBe(101)
  })

  it('reproduces the per-day and per-km figures', () => {
    expect(r.perDay!).toBeCloseTo(86_138.61, 2)
    expect(r.perKm!).toBeCloseTo(2_399.34, 2)
    // Cost per km for fuel alone drops the first fill, which paid for earlier distance.
    expect(r.fuelAfterFirst).toBe(6_500_000)
    expect(r.fuelPerKm!).toBeCloseTo(1_792.61, 2)
  })
})

describe('costSummary — the Honda Moto golden numbers', () => {
  const fuel = [
    fill('2026-08-18', 20408, 70_000),
    fill('2026-09-11', 20583, 97_000),
    fill('2026-09-27', 20754, 100_000),
    fill('2026-10-02', 20919, 50_000),
  ]
  const r = costSummary(fuel, [], [])

  it('matches the verified workbook', () => {
    expect(r.total).toBe(317_000)
    expect(r.distanceKm).toBe(511)
    expect(r.days).toBe(45)
    expect(r.perDay!).toBeCloseTo(7_044.44, 2)
    expect(r.fuelPerKm!).toBeCloseTo(483.37, 2)
  })
})

describe('costSummary — edges', () => {
  it('returns nulls rather than dividing by zero', () => {
    const r = costSummary([fill('2026-01-01', 100, 50_000)], [], [])
    expect(r.days).toBe(0)
    expect(r.perDay).toBeNull()
    expect(r.perKm).toBeNull()      // a single reading is no distance
  })
})

describe('monthlyCosts', () => {
  it('splits by kind and keeps empty months in the series', () => {
    const r = monthlyCosts(
      [fill('2026-01-10', 100, 200_000), fill('2026-03-05', 400, 300_000)],
      [svc('2026-01-20', 150, 500_000)],
      [exp('2026-03-11', 60_000)],
    )
    expect(r.map((b) => b.month)).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(r[0]).toMatchObject({ fuel: 200_000, service: 500_000, expense: 0, total: 700_000 })
    expect(r[1]).toMatchObject({ total: 0 })          // February had no spending, but exists
    expect(r[2]).toMatchObject({ fuel: 300_000, expense: 60_000, total: 360_000 })
  })

  it('rolls the year over correctly', () => {
    const r = monthlyCosts([fill('2025-11-01', 1, 1), fill('2026-02-01', 2, 1)], [], [])
    expect(r.map((b) => b.month)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })
})


describe('fuelOverview', () => {
  const priced = (date: string, odo: number, total: number, price: number | null = 21_000) => ({
    ...fill(date, odo, total),
    unit_price: price,
  })

  it('totals the money over exactly the fills it is given', () => {
    const o = fuelOverview([priced('2026-01-01', 1000, 210_000), priced('2026-01-10', 1300, 210_000)], car)
    expect(o.totalAmount).toBe(420_000)
    expect(o.fillCount).toBe(2)
    expect(o.distanceKm).toBe(300)
  })

  it('sums the litres, deriving them from money and price where needed', () => {
    const o = fuelOverview([priced('2026-01-01', 1000, 210_000), priced('2026-01-10', 1300, 210_000)], car)
    expect(o.totalLiters).toBeCloseTo(20, 6) // 210.000 / 21.000 twice
    expect(o.litersEstimated).toBe(false)    // each fill recorded its own price
  })

  it('flags litres that leant on the fuel type\'s current price', () => {
    const noPrice = [priced('2026-01-01', 1000, 210_000, null), priced('2026-01-10', 1300, 210_000, null)]
    const o = fuelOverview(noPrice, car, () => 21_000)
    expect(o.totalLiters).toBeCloseTo(20, 6)
    expect(o.litersEstimated).toBe(true)
  })

  it('reports no litres at all when nothing can produce them', () => {
    const o = fuelOverview([priced('2026-01-01', 1000, 210_000, null)], car)
    expect(o.totalLiters).toBeNull()
    expect(o.litersEstimated).toBe(false)
  })

  // The headline figure must be distance-weighted, not the mean of the per-row estimates.
  it('uses the distance-weighted aggregate, not the mean of the intervals', () => {
    const entries = [
      priced('2026-01-01', 1000, 210_000),  // 10 L
      priced('2026-01-10', 1100, 210_000),  // 10 L over 100 km -> 10 L/100km
      priced('2026-01-20', 1500, 210_000),  // 10 L over 400 km -> 2.5 L/100km
    ]
    const o = fuelOverview(entries, car)
    const meanOfIntervals = (10 + 2.5) / 2

    // 20 L over 500 km = 4 L/100km, which is NOT 6.25.
    expect(o.avgL100).toBeCloseTo(4, 6)
    expect(o.avgL100).not.toBeCloseTo(meanOfIntervals, 2)
    expect(o.exact).toBe(false)
  })

  it('reports an exact figure when full tanks bracket the window', () => {
    const entries = [
      { ...priced('2026-01-01', 1000, 210_000), is_full_tank: true },
      { ...priced('2026-01-10', 1200, 210_000), is_full_tank: true }, // 10 L over 200 km
    ]
    const o = fuelOverview(entries, car)
    expect(o.exact).toBe(true)
    expect(o.avgL100).toBeCloseTo(5, 6)
  })

  it('is empty, not broken, with no fills', () => {
    const o = fuelOverview([], car)
    expect(o).toMatchObject({
      avgL100: null, totalLiters: null, totalAmount: 0, fillCount: 0, distanceKm: 0,
    })
  })

  it('cannot measure a distance from a single fill', () => {
    const o = fuelOverview([priced('2026-01-01', 1000, 210_000)], car)
    expect(o.distanceKm).toBe(0)
    expect(o.avgL100).toBeNull()
  })
})
