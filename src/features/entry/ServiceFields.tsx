import type { ServiceItem } from '../../domain/types'
import { SERVICE_ITEMS } from '../../domain/labels'
import { Field } from '../../components/Field'
import { MoneyInput } from '../../components/MoneyInput'
import { money } from '../../lib/format'

interface Props {
  items: ServiceItem[]
  workshop: string
  totalAmount: number | null
  /** True once the user types in the total, after which it stops tracking the item sum. */
  totalTouched: boolean
  onItems: (items: ServiceItem[]) => void
  onWorkshop: (v: string) => void
  onTotal: (v: number | null) => void
}

export const itemsSum = (items: ServiceItem[]): number | null => {
  const priced = items.filter((i) => i.amount != null)
  return priced.length ? priced.reduce((a, i) => a + (i.amount ?? 0), 0) : null
}

export function ServiceFields({
  items, workshop, totalAmount, totalTouched, onItems, onWorkshop, onTotal,
}: Props) {
  const selected = new Set(items.map((i) => i.name))
  const sum = itemsSum(items)

  const toggle = (name: string) =>
    onItems(
      selected.has(name)
        ? items.filter((i) => i.name !== name)
        : [...items, { name, amount: null }],
    )

  const setAmount = (name: string, amount: number | null) =>
    onItems(items.map((i) => (i.name === name ? { ...i, amount } : i)))

  return (
    <>
      <Field label="Hạng mục" hint="Chọn một hoặc nhiều">
        <div className="chips">
          {SERVICE_ITEMS.map((it) => (
            <button
              key={it}
              type="button"
              aria-pressed={selected.has(it)}
              className={`chip${selected.has(it) ? ' is-active' : ''}`}
              onClick={() => toggle(it)}
            >
              {it}
            </button>
          ))}
        </div>
      </Field>

      {items.length > 0 && (
        <Field
          label="Đơn giá từng hạng mục"
          hint="Không bắt buộc — bỏ trống thì chỉ lưu tổng tiền"
        >
          <ul className="svcitems">
            {items.map((i) => (
              <li className="svcitems__row" key={i.name}>
                <span className="svcitems__name">{i.name}</span>
                <div className="svcitems__price">
                  <MoneyInput
                    value={i.amount}
                    onChange={(v) => setAmount(i.name, v)}
                    placeholder="—"
                  />
                </div>
                <button
                  type="button"
                  className="svcitems__remove"
                  aria-label={`Bỏ ${i.name}`}
                  onClick={() => toggle(i.name)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </Field>
      )}

      {/* The total is what gets stored, whether or not the lines above are priced.
          It mirrors the sum until the user overrides it, and any mismatch is shown
          rather than silently resolved. */}
      {sum != null && totalTouched && sum !== totalAmount && (
        <p className="svcitems__mismatch">
          Tổng các hạng mục là {money(sum)}, khác với số tiền tổng bạn nhập ({money(totalAmount)}).
          Số được lưu là {money(totalAmount)}.{' '}
          <button type="button" className="linkbtn" onClick={() => onTotal(sum)}>
            Dùng {money(sum)}
          </button>
        </p>
      )}

      <Field label="Gara" htmlFor="f-shop">
        <input
          id="f-shop"
          className="input"
          type="text"
          value={workshop}
          onChange={(e) => onWorkshop(e.target.value)}
        />
      </Field>
    </>
  )
}
