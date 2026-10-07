import { describe, expect, it } from 'vitest'
import {
  amountFromQuantity,
  fillMissing,
  quantityFromAmount,
  reconcile,
  type FuelSide,
} from '../fuelMath'

const PRICE = 21_000

describe('quantityFromAmount', () => {
  it('converts money to litres at 2 decimals', () => {
    expect(quantityFromAmount(50_000, PRICE)).toBe(2.38) // 2,380952…
    expect(quantityFromAmount(100_000, PRICE)).toBe(4.76)
    expect(quantityFromAmount(42_000, PRICE)).toBe(2)
  })

  it('gives null when the price cannot support a conversion', () => {
    expect(quantityFromAmount(50_000, null)).toBeNull()
    expect(quantityFromAmount(50_000, 0)).toBeNull()
    expect(quantityFromAmount(null, PRICE)).toBeNull()
    expect(quantityFromAmount(0, PRICE)).toBeNull()
  })
})

describe('amountFromQuantity', () => {
  it('converts litres to whole đồng', () => {
    expect(amountFromQuantity(2.38, PRICE)).toBe(49_980)
    expect(amountFromQuantity(2.5, PRICE)).toBe(52_500)
    expect(Number.isInteger(amountFromQuantity(3.333, PRICE) as number)).toBe(true)
  })

  it('gives null when the price cannot support a conversion', () => {
    expect(amountFromQuantity(2.5, null)).toBeNull()
    expect(amountFromQuantity(2.5, 0)).toBeNull()
    expect(amountFromQuantity(null, PRICE)).toBeNull()
  })
})

describe('reconcile', () => {
  it('derives litres when the user typed the money', () => {
    expect(reconcile({ amount: 50_000, quantity: null, price: PRICE, typed: 'amount' })).toEqual({
      amount: 50_000,
      quantity: 2.38,
    })
  })

  it('derives money when the user typed the litres', () => {
    expect(reconcile({ amount: null, quantity: 2.5, price: PRICE, typed: 'quantity' })).toEqual({
      amount: 52_500,
      quantity: 2.5,
    })
  })

  it('treats money as authoritative before either side is typed', () => {
    // The form is amount-first: at a pump you know what you paid first.
    expect(reconcile({ amount: 50_000, quantity: 99, price: PRICE, typed: null })).toEqual({
      amount: 50_000,
      quantity: 2.38,
    })
  })

  // The whole point of tracking `typed`. Without it a price edit would recompute the money
  // from the rounded litres and quietly shave 20 đ off, every time.
  it('never recomputes the typed side from the rounded one', () => {
    const first = reconcile({ amount: 50_000, quantity: null, price: PRICE, typed: 'amount' })
    expect(first).toEqual({ amount: 50_000, quantity: 2.38 })

    const afterPriceEdit = reconcile({ ...first, price: 22_000, typed: 'amount' })
    expect(afterPriceEdit.amount).toBe(50_000) // what they paid must not move
    expect(afterPriceEdit.quantity).toBe(2.27)

    const again = reconcile({ ...afterPriceEdit, price: 22_000, typed: 'amount' })
    expect(again).toEqual(afterPriceEdit) // stable, not drifting further each pass
  })

  it('keeps the typed litres exact across repeated price edits', () => {
    let pair = reconcile({ amount: null, quantity: 2.5, price: PRICE, typed: 'quantity' })
    expect(pair).toEqual({ amount: 52_500, quantity: 2.5 })

    pair = reconcile({ ...pair, price: 20_000, typed: 'quantity' })
    expect(pair).toEqual({ amount: 50_000, quantity: 2.5 })

    pair = reconcile({ ...pair, price: PRICE, typed: 'quantity' })
    expect(pair).toEqual({ amount: 52_500, quantity: 2.5 }) // exactly back where it started
  })

  it('clears the derived side when the typed side is cleared', () => {
    expect(reconcile({ amount: null, quantity: 2.38, price: PRICE, typed: 'amount' })).toEqual({
      amount: null,
      quantity: null,
    })
  })

  it('leaves the typed side alone when the price is unusable', () => {
    expect(reconcile({ amount: 50_000, quantity: null, price: null, typed: 'amount' })).toEqual({
      amount: 50_000,
      quantity: null,
    })
  })
})

describe('fillMissing', () => {
  it('fills the litres once a remembered price finally arrives', () => {
    // The user typed an amount while the fuel-type table was still resolving.
    expect(fillMissing({ amount: 50_000, quantity: null, price: PRICE, typed: 'amount' })).toEqual({
      amount: 50_000,
      quantity: 2.38,
    })
  })

  it('fills the money when only litres were entered', () => {
    expect(fillMissing({ amount: null, quantity: 2.5, price: PRICE, typed: 'quantity' })).toEqual({
      amount: 52_500,
      quantity: 2.5,
    })
  })

  // Opening an old record must not rewrite it. Stored litres and money that disagree are
  // the user's data, not a mistake to silently correct.
  it('never overwrites a figure that is already present', () => {
    expect(fillMissing({ amount: 50_000, quantity: 3, price: PRICE, typed: null })).toEqual({
      amount: 50_000,
      quantity: 3,
    })
    const typedQty = { amount: 50_000, quantity: 3, price: PRICE, typed: 'quantity' as FuelSide }
    expect(fillMissing(typedQty)).toEqual({ amount: 50_000, quantity: 3 })
  })

  it('is a no-op when there is nothing to work from', () => {
    expect(fillMissing({ amount: null, quantity: null, price: PRICE, typed: null })).toEqual({
      amount: null,
      quantity: null,
    })
    expect(fillMissing({ amount: 50_000, quantity: null, price: null, typed: 'amount' })).toEqual({
      amount: 50_000,
      quantity: null,
    })
  })
})
