import type { MonthBucket } from '../../domain/reports'
import { money } from '../../lib/format'

interface Props {
  data: readonly MonthBucket[]
}

const SERIES = [
  { key: 'fuel', label: 'Nhiên liệu', fill: 'var(--c-fuel)' },
  { key: 'service', label: 'Bảo dưỡng', fill: 'var(--c-service)' },
  { key: 'expense', label: 'Chi phí khác', fill: 'var(--c-expense)' },
] as const

const VB_W = 320
const VB_H = 140
const PAD_B = 18

/**
 * Stacked monthly cost.
 *
 * Hand-drawn SVG rather than a charting library: the shapes needed here are rectangles,
 * a library would cost more than the whole feature, and inline SVG inherits the design
 * tokens so the chart is part of the system instead of a bolted-on widget.
 */
export function MonthlyCostChart({ data }: Props) {
  if (!data.length) return null
  const max = Math.max(...data.map((b) => b.total), 1)
  const slot = VB_W / data.length
  const barW = Math.min(slot * 0.62, 34)
  const plotH = VB_H - PAD_B

  return (
    <figure className="chart">
      <figcaption className="chart__caption">Chi phí theo tháng</figcaption>

      <svg className="chart__svg" viewBox={`0 0 ${VB_W} ${VB_H}`} role="img"
        aria-label="Biểu đồ cột chi phí theo tháng, chi tiết ở bảng bên dưới">
        <line x1="0" y1={plotH} x2={VB_W} y2={plotH} className="chart__axis" />
        {data.map((b, i) => {
          const x = i * slot + (slot - barW) / 2
          let y = plotH
          return (
            <g key={b.month}>
              <title>{`${b.month}: ${money(b.total)}`}</title>
              {SERIES.map((s) => {
                const v = b[s.key]
                if (v <= 0) return null
                const h = (v / max) * (plotH - 4)
                y -= h
                return <rect key={s.key} x={x} y={y} width={barW} height={h} fill={s.fill} rx="2" />
              })}
              {/* Only every other label on a crowded axis, so they never collide. */}
              {(data.length <= 6 || i % 2 === 0) && (
                <text x={x + barW / 2} y={VB_H - 5} className="chart__xlabel">
                  {Number(b.month.slice(5))}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      <ul className="chart__legend">
        {SERIES.map((s) => (
          <li key={s.key}>
            <span className="chart__swatch" style={{ background: s.fill }} aria-hidden="true" />
            {s.label}
          </li>
        ))}
      </ul>

      {/* The numbers a screen reader needs; the chart above is decoration over this. */}
      <table className="visually-hidden">
        <caption>Chi phí theo tháng</caption>
        <thead>
          <tr><th>Tháng</th><th>Nhiên liệu</th><th>Bảo dưỡng</th><th>Khác</th><th>Tổng</th></tr>
        </thead>
        <tbody>
          {data.map((b) => (
            <tr key={b.month}>
              <th scope="row">{b.month}</th>
              <td>{money(b.fuel)}</td>
              <td>{money(b.service)}</td>
              <td>{money(b.expense)}</td>
              <td>{money(b.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
