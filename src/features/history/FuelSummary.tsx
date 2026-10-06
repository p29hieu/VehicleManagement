import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import type { Vehicle } from '../../domain/types'
import { averageConsumption, forecastNextFill } from '../../domain/consumption'
import { resolveFuelType, unitLabel } from '../../domain/fuelTypes'
import { useFuelTypes } from '../../hooks/useAppData'
import { dateFull, dec1, dec2, km } from '../../lib/format'

interface Props {
  vehicle: Vehicle
}

/**
 * Average consumption and the projected next fill.
 *
 * Both figures carry the evidence they rest on, and the component says "not enough data"
 * rather than printing a number the log cannot support (docs §5).
 */
export function FuelSummary({ vehicle }: Props) {
  const fuelTypes = useFuelTypes()
  const data = useLiveQuery(
    async () => {
      const fuel = await db.fuelEntries.where('vehicle_id').equals(vehicle.id).toArray()
      return {
        count: fuel.length,
        avg: averageConsumption(fuel, vehicle),
        forecast: forecastNextFill(fuel),
      }
    },
    [vehicle.id, vehicle.consumption_min, vehicle.consumption_max],
    undefined,
  )

  if (!data) return null
  const { count, avg, forecast } = data
  if (count === 0) return null

  const unit = `${unitLabel(resolveFuelType(vehicle.fuel_type, fuelTypes ?? []).unit)}/100km`
  const overdue = forecast != null && forecast.daysRemaining < 0

  return (
    <section className="fsum" aria-label="Tóm tắt nhiên liệu">
      <div className="fsum__cell">
        <span className="fsum__label">Mức tiêu thụ</span>
        {avg ? (
          <>
            <strong className="fsum__value num">
              {!avg.exact && <span className="fsum__approx">~</span>}
              {dec2(avg.l100)}
            </strong>
            <span className="fsum__unit">{unit}</span>
            <span className="fsum__basis">
              {avg.exact
                ? `đo giữa ${avg.basis} lần đổ đầy · ${km(avg.distanceKm)}`
                : `ước tính · ${avg.basis} lần đổ · ${km(avg.distanceKm)}`}
            </span>
            {avg.outOfBand && (
              <span className="fsum__warn">
                Ngoài dải hợp lý của {vehicle.kind === 'motorcycle' ? 'xe máy' : 'loại xe này'} (
                {dec1(vehicle.consumption_min)}–{dec1(vehicle.consumption_max)}). Thường do thiếu
                số lít ở một vài lần đổ, hoặc số km nhập sai.
              </span>
            )}
          </>
        ) : (
          <span className="fsum__none">
            Chưa tính được — cần số lượng {unitLabel(resolveFuelType(vehicle.fuel_type, fuelTypes ?? []).unit)} hoặc đơn giá
          </span>
        )}
      </div>

      <div className="fsum__cell" data-overdue={overdue ? '' : undefined}>
        <span className="fsum__label">Đổ kế tiếp</span>
        {forecast ? (
          <>
            <strong className="fsum__value num">
              {overdue ? `quá ${Math.abs(forecast.daysRemaining)} ngày` : `còn ${forecast.daysRemaining} ngày`}
            </strong>
            <span className="fsum__unit">{dateFull(forecast.dueDate)}</span>
            <span className="fsum__basis">
              khoảng {km(forecast.dueOdometerKm)} · đi {dec1(forecast.kmPerDay)} km/ngày
            </span>
          </>
        ) : (
          <span className="fsum__none">Chưa đủ dữ liệu — cần ít nhất 3 lần đổ</span>
        )}
      </div>
    </section>
  )
}
