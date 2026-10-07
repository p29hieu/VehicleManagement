/**
 * The money <-> volume pair on the fuel form.
 *
 * Three fields, one constraint: `amount = quantity x price`. Enter any two and the third
 * follows, so the form has to decide which figure is the truth and which is a convenience.
 *
 * The rule, and the only reason this is its own module: **always derive from the side the
 * user typed, never from the rounded result.** 50.000 đ at 21.000 đ/L is 2,380952… L,
 * shown as 2,38. Recomputing the money back from 2,38 gives 49.980 — 20 đ lost every time
 * the price is touched. Carrying `typed` means the authoritative figure is never recomputed.
 */

/** Which of the two the user actually entered. `null` = neither yet. */
export type FuelSide = 'amount' | 'quantity'

export interface FuelPair {
  amount: number | null
  quantity: number | null
}

const usablePrice = (price: number | null): price is number => price != null && price > 0

/** Litres (or kWh) to 2 decimals — the precision both the entry field and `dec2` show. */
export const quantityFromAmount = (amount: number | null, price: number | null): number | null =>
  usablePrice(price) && amount != null && amount > 0
    ? Math.round((amount / price) * 100) / 100
    : null

/** Whole đồng. Vietnamese fuel is never priced in subunits, and a fractional total would
 *  only resurface as a rounding artefact in the cost reports. */
export const amountFromQuantity = (quantity: number | null, price: number | null): number | null =>
  usablePrice(price) && quantity != null && quantity > 0 ? Math.round(quantity * price) : null

/**
 * Recomputes the derived side after any of the three fields changes.
 *
 * `typed` defaults to 'amount' because the form is amount-first (docs/02-UIUX.md): at a
 * pump you know what you paid before you know what you got.
 */
export function reconcile(
  input: FuelPair & { price: number | null; typed: FuelSide | null },
): FuelPair {
  const { amount, quantity, price, typed } = input
  return (typed ?? 'amount') === 'quantity'
    ? { quantity, amount: amountFromQuantity(quantity, price) }
    : { amount, quantity: quantityFromAmount(amount, price) }
}

/**
 * Fills a side that is empty, and only that.
 *
 * Needed because the remembered unit price arrives after the first render: the user may
 * already have typed an amount while the price was still null. It must never overwrite a
 * figure that is already there — an existing record whose stored litres and money disagree
 * is the user's data, not an error to silently correct when they open it.
 */
export function fillMissing(
  input: FuelPair & { price: number | null; typed: FuelSide | null },
): FuelPair {
  const { amount, quantity, price, typed } = input
  if ((typed ?? 'amount') === 'quantity') {
    return amount == null ? { quantity, amount: amountFromQuantity(quantity, price) } : { amount, quantity }
  }
  return quantity == null ? { amount, quantity: quantityFromAmount(amount, price) } : { amount, quantity }
}
