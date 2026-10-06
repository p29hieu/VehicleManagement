import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import type { Vehicle } from '../../domain/types'
import { averageConsumption, consumptionSeries } from '../../domain/consumption'
import { costSummary, monthlyCosts } from '../../domain/reports'
import { resolveFuelType, unitLabel } from '../../domain/fuelTypes'
import { listFuelTypes } from '../../db/repo'
import { dec2, km, money } from '../../lib/format'
import { EmptyState } from '../../components/EmptyState'
import { MonthlyCostChart } from './MonthlyCostChart'
import { ConsumptionChart } from './ConsumptionChart'
import './reports.css'

interface Props {
  vehicle: Vehicle
}

/** Below this many fills the averages are noise, so they are withheld (docs §5). */
const MIN_FILLS = 2

export function ReportsScreen({ vehicle }: Props) {
  const data = useLiveQuery(
    async () => {
      const [fuel, services, expenses, fuelTypes] = await Promise.all([
        db.fuelEntries.where('vehicle_id').equals(vehicle.id).toArray(),
        db.services.where('vehicle_id').equals(vehicle.id).toArray(),
        db.expenses.where('vehicle_id').equals(vehicle.id).toArray(),
        listFuelTypes(),
      ])
      // An entry with no price of its own falls back to the type's current price. That is
      // an assumption, so the basis line below names it.
      const priceFor = (id: string | null) =>
        fuelTypes.find((t) => t.id === (id ?? vehicle.fuel_type))?.price ?? null
      return {
        summary: costSummary(fuel, services, expenses),
        months: monthlyCosts(fuel, services, expenses),
        avg: averageConsumption(fuel, vehicle, priceFor),
        series: consumptionSeries(fuel, vehicle, priceFor),
        fuelCount: fuel.length,
        unit: `${unitLabel(resolveFuelType(vehicle.fuel_type, fuelTypes).unit)}/100km`,
      }
    },
    [vehicle.id, vehicle.fuel_type, vehicle.consumption_min, vehicle.consumption_max],
    undefined,
  )

  if (!data) return <p className="route-loading">Đang tải…</p>
  const { summary, months, avg, series, fuelCount, unit } = data

  if (summary.recordCount === 0) {
    return (
      <EmptyState
        kind="report"
        title="Chưa có gì để báo cáo"
        body="Thêm vài bản ghi đổ xăng và bảo dưỡng, các con số sẽ xuất hiện ở đây."
      />
    )
  }

  const enough = fuelCount >= MIN_FILLS

  return (
    <div className="reports">
      <section className="stats3" aria-label="Chỉ số chính">
        <Stat
          label="Chi phí mỗi ngày"
          value={summary.perDay != null ? money(summary.perDay) : null}
          basis={summary.days > 0 ? `${summary.days} ngày theo dõi` : 'cần ít nhất 2 ngày'}
        />
        <Stat
          label="Chi phí mỗi km"
          value={summary.perKm != null ? money(summary.perKm) : null}
          basis={summary.distanceKm > 0 ? km(summary.distanceKm) : 'cần ít nhất 2 mốc ODO'}
        />
        <Stat
          label="Mức tiêu thụ"
          value={enough && avg ? `${!avg.exact ? '~' : ''}${dec2(avg.l100)}` : null}
          suffix={enough && avg ? unit : undefined}
          basis={
            !enough
              ? `cần ít nhất ${MIN_FILLS} lần đổ`
              : avg
                ? (avg.exact
                    ? `đo giữa ${avg.basis} lần đổ đầy`
                    : `ước tính · ${avg.basis} lần đổ`) +
                  // Naming the assumption is the difference between an estimate and a claim.
                  (avg.usedFallbackPrice ? ' · theo đơn giá hiện tại' : '')
                : 'cần số lượng, hoặc đặt đơn giá ở Cài đặt'
          }
          warn={avg?.outOfBand ?? false}
        />
      </section>

      <section className="breakdown" aria-label="Cơ cấu chi phí">
        <h2 className="reports__h2">Tổng chi phí · {money(summary.total)}</h2>
        <Bar label="Nhiên liệu" value={summary.fuelTotal} total={summary.total} fill="var(--c-fuel)" />
        <Bar label="Bảo dưỡng" value={summary.serviceTotal} total={summary.total} fill="var(--c-service)" />
        <Bar label="Chi phí khác" value={summary.expenseTotal} total={summary.total} fill="var(--c-expense)" />
      </section>

      <MonthlyCostChart data={months} />

      {series.length >= 2 ? (
        <ConsumptionChart points={series} unit={unit} />
      ) : (
        <p className="reports__note">
          Chưa vẽ được biểu đồ tiêu thụ — cần thêm lần đổ có ghi số lượng hoặc đơn giá.
        </p>
      )}
    </div>
  )
}

function Stat({
  label, value, suffix, basis, warn,
}: {
  label: string
  value: string | null
  suffix?: string | undefined
  basis: string
  warn?: boolean
}) {
  return (
    <div className="stat" data-warn={warn ? '' : undefined}>
      <span className="stat__label">{label}</span>
      {value ? (
        <>
          <strong className="stat__value num">{value}</strong>
          {suffix && <span className="stat__suffix">{suffix}</span>}
        </>
      ) : (
        /* Saying what is missing beats printing a number the data cannot support. */
        <span className="stat__none">Chưa đủ dữ liệu</span>
      )}
      <span className="stat__basis">{basis}</span>
    </div>
  )
}

function Bar({ label, value, total, fill }: { label: string; value: number; total: number; fill: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div className="bkd">
      <span className="bkd__label">{label}</span>
      <span className="bkd__track" aria-hidden="true">
        <span className="bkd__fill" style={{ inlineSize: `${pct}%`, background: fill }} />
      </span>
      <span className="bkd__value num">{money(value)}</span>
      <span className="bkd__pct num">{pct.toFixed(0)}%</span>
    </div>
  )
}
