import type { FuelType } from '../../domain/types'
import { priceUnitLabel, unitLabel, type FuelTypeRow } from '../../domain/fuelTypes'
import { Field } from '../../components/Field'
import { MoneyInput } from '../../components/MoneyInput'
import { NumberInput } from '../../components/NumberInput'
import { dec2 } from '../../lib/format'

interface Props {
  fuelTypes: readonly FuelTypeRow[]
  fuelType: FuelType
  unitPrice: number | null
  quantity: number | null
  totalAmount: number | null
  isFullTank: boolean
  missedFill: boolean
  station: string
  onFuelType: (f: FuelType) => void
  onUnitPrice: (v: number | null) => void
  onQuantity: (v: number | null) => void
  onFullTank: (v: boolean) => void
  onMissedFill: (v: boolean) => void
  onStation: (v: string) => void
  more: boolean
  onMore: (v: boolean) => void
}

export function FuelFields({
  fuelTypes, fuelType, unitPrice, quantity, totalAmount, isFullTank, missedFill, station,
  onFuelType, onUnitPrice, onQuantity, onFullTank, onMissedFill, onStation, more, onMore,
}: Props) {
  const unit = fuelTypes.find((f) => f.id === fuelType)?.unit ?? 'liter'
  // Shown rather than silently stored, so the figure the maths will use is visible up front.
  const derived =
    quantity == null && unitPrice != null && unitPrice > 0 && totalAmount != null
      ? totalAmount / unitPrice
      : null

  return (
    <>
      <Field label="Loại nhiên liệu" hint="Một xe có thể đổ nhiều loại — chọn loại của lần này">
        <div className="chips" role="radiogroup" aria-label="Loại nhiên liệu">
          {fuelTypes.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={fuelType === f.id}
              className={`chip chip--fuel${fuelType === f.id ? ' is-active' : ''}`}
              onClick={() => onFuelType(f.id)}
            >
              {f.name}
            </button>
          ))}
          {fuelTypes.length === 0 && (
            <span className="field__msg">
              Chưa có loại nhiên liệu nào — thêm ở Cài đặt → Loại nhiên liệu.
            </span>
          )}
        </div>
      </Field>

      <Field
        label={`Đơn giá (${priceUnitLabel(unit)})`}
        htmlFor="f-price"
        hint="Sửa ở đây sẽ được nhớ làm đơn giá mặc định cho lần sau"
      >
        <MoneyInput
          id="f-price"
          value={unitPrice}
          onChange={onUnitPrice}
          suffix={priceUnitLabel(unit)}
        />
      </Field>

      {/* The flag that decides whether exact L/100km is ever computable (docs §3.1),
          so it is a pair of real buttons, not a checkbox in an "advanced" section. */}
      <Field label="Mức đổ">
        <div className="segmented" role="radiogroup" aria-label="Mức đổ">
          <button
            type="button"
            role="radio"
            aria-checked={isFullTank}
            className={`segmented__opt${isFullTank ? ' is-active' : ''}`}
            onClick={() => onFullTank(true)}
          >
            Đổ đầy bình
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={!isFullTank}
            className={`segmented__opt${!isFullTank ? ' is-active' : ''}`}
            onClick={() => onFullTank(false)}
          >
            Đổ một phần
          </button>
        </div>
      </Field>

      <button type="button" className="disclose" aria-expanded={more} onClick={() => onMore(!more)}>
        {more ? '▾' : '▸'} Thêm chi tiết
      </button>

      {more && (
        <>
          <Field
            label={`Số lượng (${unitLabel(unit)})`}
            htmlFor="f-qty"
            hint={
              derived != null
                ? `Để trống sẽ tự tính: ${dec2(derived)} ${unitLabel(unit)}`
                : undefined
            }
          >
            <NumberInput
              id="f-qty"
              value={quantity}
              onChange={onQuantity}
              suffix={unitLabel(unit)}
            />
          </Field>
          <Field label="Trạm" htmlFor="f-station">
            <input
              id="f-station"
              className="input"
              type="text"
              value={station}
              onChange={(e) => onStation(e.target.value)}
            />
          </Field>
          <label className="check">
            <input
              type="checkbox"
              checked={missedFill}
              onChange={(e) => onMissedFill(e.target.checked)}
            />
            <span>Có lần đổ trước đó tôi quên ghi</span>
          </label>
        </>
      )}
    </>
  )
}
