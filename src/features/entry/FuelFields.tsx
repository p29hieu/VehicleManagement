import { FUEL_TYPES, type FuelType } from '../../domain/types'
import { FUEL_TYPE_LABEL, priceUnit, quantityUnit } from '../../domain/labels'
import { Field } from '../../components/Field'
import { MoneyInput } from '../../components/MoneyInput'
import { NumberInput } from '../../components/NumberInput'
import { dec2 } from '../../lib/format'

interface Props {
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
  fuelType, unitPrice, quantity, totalAmount, isFullTank, missedFill, station,
  onFuelType, onUnitPrice, onQuantity, onFullTank, onMissedFill, onStation, more, onMore,
}: Props) {
  // Shown rather than silently stored, so the figure the maths will use is visible up front.
  const derived =
    quantity == null && unitPrice != null && unitPrice > 0 && totalAmount != null
      ? totalAmount / unitPrice
      : null

  return (
    <>
      <Field label="Loại nhiên liệu" hint="Một xe có thể đổ nhiều loại — chọn loại của lần này">
        <div className="chips" role="radiogroup" aria-label="Loại nhiên liệu">
          {FUEL_TYPES.filter((f) => f !== 'hybrid').map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={fuelType === f}
              className={`chip chip--fuel${fuelType === f ? ' is-active' : ''}`}
              onClick={() => onFuelType(f)}
            >
              {FUEL_TYPE_LABEL[f]}
            </button>
          ))}
        </div>
      </Field>

      <Field
        label={`Đơn giá (${priceUnit(fuelType)})`}
        htmlFor="f-price"
        hint="Sửa ở đây sẽ được nhớ làm đơn giá mặc định cho lần sau"
      >
        <MoneyInput
          id="f-price"
          value={unitPrice}
          onChange={onUnitPrice}
          suffix={priceUnit(fuelType)}
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
            label={`Số lượng (${quantityUnit(fuelType)})`}
            htmlFor="f-qty"
            hint={
              derived != null
                ? `Để trống sẽ tự tính: ${dec2(derived)} ${quantityUnit(fuelType)}`
                : undefined
            }
          >
            <NumberInput
              id="f-qty"
              value={quantity}
              onChange={onQuantity}
              suffix={quantityUnit(fuelType)}
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
