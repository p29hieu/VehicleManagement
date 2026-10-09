import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import type { Vehicle } from '../../domain/types'
import { forecastNextFill } from '../../domain/consumption'
import { fuelOverview } from '../../domain/reports'
import {
  PERIOD_LABEL,
  PERIOD_ORDER,
  periodRange,
  withinPeriod,
  type DateRange,
  type PeriodId,
} from '../../domain/period'
import { resolveFuelType, unitLabel } from '../../domain/fuelTypes'
import { useFuelTypes } from '../../hooks/useAppData'
import { listFuelTypes } from '../../db/repo'
import { dateFull, dec1, dec2, km, money, todayISO } from '../../lib/format'

interface Props {
  vehicle: Vehicle
}

const isOutOfBand = (v: Vehicle, l100: number) =>
  l100 < v.consumption_min || l100 > v.consumption_max

/**
 * The headline fuel figures for a window of time, plus the projected next fill.
 *
 * Every figure carries the evidence it rests on, and the component says "not enough data"
 * rather than printing a number the log cannot support (docs §5).
 *
 * The window applies to the three aggregates only. The forecast deliberately keeps reading
 * the whole log: it is a claim about the future, and narrowing it to the last month would
 * make it jump around without any new information behind the movement.
 */
export function FuelSummary({ vehicle }: Props) {
  const fuelTypes = useFuelTypes()
  const [period, setPeriod] = useState<PeriodId>('all')
  const [custom, setCustom] = useState<DateRange>({ from: null, to: null })

  const data = useLiveQuery(
    async () => {
      const [fuel, types] = await Promise.all([
        db.fuelEntries.where('vehicle_id').equals(vehicle.id).toArray(),
        listFuelTypes(),
      ])
      return { fuel, types }
    },
    [vehicle.id],
    undefined,
  )

  // Re-filtering on a chip tap must not go back to Dexie — the rows are already here.
  const view = useMemo(() => {
    if (!data) return null
    const priceFor = (id: string | null) =>
      data.types.find((t) => t.id === (id ?? vehicle.fuel_type))?.price ?? null
    const windowed = withinPeriod(data.fuel, periodRange(period, todayISO(), custom))
    return {
      total: data.fuel.length,
      overview: fuelOverview(windowed, vehicle, priceFor),
      forecast: forecastNextFill(data.fuel),
    }
  }, [data, period, custom, vehicle])

  if (!view) return null
  const { total, overview, forecast } = view
  if (total === 0) return null

  const volume = unitLabel(resolveFuelType(vehicle.fuel_type, fuelTypes ?? []).unit)
  const unit = `${volume}/100km`
  const overdue = forecast != null && forecast.daysRemaining < 0

  return (
    <section className="fsum" aria-label="Tổng quan nhiên liệu">
      <div className="fsum__head">
        <h2 className="fsum__title">Tổng quan</h2>
        <div className="periods" role="tablist" aria-label="Lọc theo mốc thời gian">
          {PERIOD_ORDER.map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={period === p}
              className={`periods__chip${period === p ? ' is-active' : ''}`}
              onClick={() => setPeriod(p)}
            >
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      {period === 'custom' && (
        /* Either end may stay empty — an open-ended range is a real request ("từ đầu năm
           đến nay"), not an incomplete one, so neither input is required. */
        <div className="fsum__range">
          <label className="fsum__rangecell">
            <span>Từ ngày</span>
            <input
              type="date"
              className="input"
              value={custom.from ?? ''}
              max={custom.to ?? todayISO()}
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value || null }))}
            />
          </label>
          <label className="fsum__rangecell">
            <span>Đến ngày</span>
            <input
              type="date"
              className="input"
              value={custom.to ?? ''}
              {...(custom.from ? { min: custom.from } : {})}
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value || null }))}
            />
          </label>
        </div>
      )}

      <div className="fsum__grid">
        <div className="fsum__cell">
          <span className="fsum__label">Tiêu hao trung bình</span>
          {overview.avgL100 != null ? (
            <>
              <strong className="fsum__value num">
                {!overview.exact && <span className="fsum__approx">~</span>}
                {dec2(overview.avgL100)}
              </strong>
              <span className="fsum__unit">{unit}</span>
              <span className="fsum__basis">
                {overview.exact
                  ? `đo giữa các lần đổ đầy · ${km(overview.distanceKm)}`
                  : `ước tính · ${overview.fillCount} lần đổ · ${km(overview.distanceKm)}`}
              </span>
            </>
          ) : (
            <span className="fsum__none">
              Chưa tính được — cần ít nhất 2 lần đổ có số km trong khoảng này
            </span>
          )}
        </div>

        <div className="fsum__cell">
          <span className="fsum__label">Tổng số {volume}</span>
          {overview.totalLiters != null ? (
            <>
              <strong className="fsum__value num">
                {overview.litersEstimated && <span className="fsum__approx">~</span>}
                {dec2(overview.totalLiters)}
              </strong>
              <span className="fsum__unit">{volume}</span>
              <span className="fsum__basis">
                {overview.fillCount} lần đổ
                {overview.litersEstimated && ' · có lần suy ra từ đơn giá hiện tại'}
              </span>
            </>
          ) : (
            <span className="fsum__none">Chưa có lần đổ nào ghi số {volume} hoặc đơn giá</span>
          )}
        </div>

        <div className="fsum__cell">
          <span className="fsum__label">Tổng tiền xăng</span>
          <strong className="fsum__value num">{money(overview.totalAmount)}</strong>
          <span className="fsum__basis">
            {overview.fillCount} lần đổ
            {overview.distanceKm > 0 && ` · ${km(overview.distanceKm)}`}
          </span>
        </div>

        <div className="fsum__cell" data-overdue={overdue ? '' : undefined}>
          <span className="fsum__label">Đổ kế tiếp</span>
          {forecast ? (
            <>
              <strong className="fsum__value num">
                {overdue
                  ? `quá ${Math.abs(forecast.daysRemaining)} ngày`
                  : `còn ${forecast.daysRemaining} ngày`}
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
      </div>

      {overview.avgL100 != null && isOutOfBand(vehicle, overview.avgL100) && (
        <p className="fsum__warn">
          Ngoài dải hợp lý của {vehicle.kind === 'motorcycle' ? 'xe máy' : 'loại xe này'} (
          {dec1(vehicle.consumption_min)}–{dec1(vehicle.consumption_max)}). Thường do thiếu số
          lít ở một vài lần đổ, hoặc số km nhập sai.
        </p>
      )}
    </section>
  )
}
