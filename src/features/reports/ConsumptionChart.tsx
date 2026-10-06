import type { ConsumptionPoint } from '../../domain/consumption'
import { dateShort, dec2 } from '../../lib/format'

interface Props {
  points: readonly ConsumptionPoint[]
  unit: string
}

const VB_W = 320
const VB_H = 130
const PAD_B = 18
const PAD_T = 8

export function ConsumptionChart({ points, unit }: Props) {
  if (points.length < 2) return null

  const values = points.map((p) => p.l100)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  // A flat series would collapse to a single row of pixels; give it breathing room.
  const span = hi - lo < 0.01 ? 1 : hi - lo
  const plotH = VB_H - PAD_B - PAD_T

  const xy = (p: ConsumptionPoint, i: number) => {
    const x = points.length === 1 ? VB_W / 2 : (i / (points.length - 1)) * (VB_W - 16) + 8
    const y = PAD_T + plotH - ((p.l100 - lo) / span) * plotH
    return [x, y] as const
  }
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xy(p, i).join(' ')}`).join(' ')
  const estimated = points.some((p) => !p.exact)

  return (
    <figure className="chart">
      <figcaption className="chart__caption">
        Mức tiêu thụ theo thời gian
        {estimated && <span className="chart__tag">ước tính luỹ kế</span>}
      </figcaption>

      <svg className="chart__svg" viewBox={`0 0 ${VB_W} ${VB_H}`} role="img"
        aria-label={`Biểu đồ đường mức tiêu thụ ${unit}, chi tiết ở bảng bên dưới`}>
        <line x1="0" y1={VB_H - PAD_B} x2={VB_W} y2={VB_H - PAD_B} className="chart__axis" />
        <path d={path} className={`chart__line${estimated ? ' is-estimate' : ''}`} />
        {points.map((p, i) => {
          const [x, y] = xy(p, i)
          return (
            <g key={`${p.date}-${p.odometerKm}`}>
              <title>{`${dateShort(p.date)}: ${dec2(p.l100)} ${unit}`}</title>
              <circle cx={x} cy={y} r="3" className="chart__dot" />
            </g>
          )
        })}
        <text x="2" y={PAD_T + 4} className="chart__ylabel">{dec2(hi)}</text>
        <text x="2" y={VB_H - PAD_B - 2} className="chart__ylabel">{dec2(lo)}</text>
      </svg>

      <table className="visually-hidden">
        <caption>Mức tiêu thụ theo thời gian ({unit})</caption>
        <thead><tr><th>Ngày</th><th>Số km</th><th>{unit}</th></tr></thead>
        <tbody>
          {points.map((p) => (
            <tr key={`${p.date}-${p.odometerKm}`}>
              <th scope="row">{p.date}</th>
              <td>{p.odometerKm}</td>
              <td>{dec2(p.l100)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
