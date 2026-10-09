import { useMemo, useState } from 'react'
import type { RecordKind, TimelineItem, Vehicle } from '../../domain/types'
import { dateShort, dec2, km, money, monthHeading, monthKey } from '../../lib/format'
import { EmptyState } from '../../components/EmptyState'
import { FuelSummary } from './FuelSummary'
import './history.css'

interface Props {
  items: TimelineItem[] | undefined
  vehicle: Vehicle
  onOpen: (item: TimelineItem) => void
}

type Filter = 'all' | RecordKind

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Tất cả' },
  { id: 'fuel', label: 'Đổ xăng' },
  { id: 'service', label: 'Bảo dưỡng' },
  { id: 'expense', label: 'Chi phí' },
]

interface MonthBlock {
  key: string
  heading: string
  items: TimelineItem[]
}

function groupByMonth(items: TimelineItem[]): MonthBlock[] {
  const blocks: MonthBlock[] = []
  for (const it of items) {
    const key = monthKey(it.date)
    const last = blocks[blocks.length - 1]
    if (last && last.key === key) last.items.push(it)
    else blocks.push({ key, heading: monthHeading(it.date), items: [it] })
  }
  return blocks
}

const EMPTY: Record<Filter, { title: string; body: string }> = {
  all: {
    title: 'Chưa có bản ghi nào',
    body: 'Bấm nút + để thêm lần đổ xăng, bảo dưỡng hoặc chi phí đầu tiên.',
  },
  fuel: { title: 'Chưa có lần đổ nào', body: 'Các lần đổ xăng hoặc sạc điện sẽ hiện ở đây.' },
  service: {
    title: 'Chưa có bản ghi bảo dưỡng',
    body: 'Thay dầu, thay lốp, đăng kiểm… ghi lại để theo dõi chi phí và lên lịch nhắc.',
  },
  expense: { title: 'Chưa có chi phí khác', body: 'Gửi xe, cầu đường, bảo hiểm, rửa xe…' },
}

export function HistoryScreen({ items, vehicle, onOpen }: Props) {
  const [filter, setFilter] = useState<Filter>('all')

  const shown = useMemo(
    () => (items ?? []).filter((it) => filter === 'all' || it.kind === filter),
    [items, filter],
  )
  const blocks = useMemo(() => groupByMonth(shown), [shown])
  /** Index across the whole filtered list, so the entrance cascade is continuous
   *  across month headings rather than restarting inside every group. */
  const order = useMemo(() => new Map(shown.map((it, i) => [it, i])), [shown])

  // Counts come from the unfiltered list so the tabs stay stable while filtering.
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, fuel: 0, service: 0, expense: 0 }
    for (const it of items ?? []) {
      c.all++
      c[it.kind]++
    }
    return c
  }, [items])

  if (items === undefined) return <p className="history__loading">Đang tải…</p>

  const bar =
    counts.all > 0 ? (
      <div className="hfilter" role="tablist" aria-label="Lọc theo loại bản ghi">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            className={`hfilter__tab${filter === f.id ? ' is-active' : ''}`}
            data-kind={f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
            <span className="hfilter__count num">{counts[f.id]}</span>
          </button>
        ))}
      </div>
    ) : null

  const summary = filter === 'all' || filter === 'fuel' ? <FuelSummary vehicle={vehicle} /> : null

  if (!shown.length) {
    const e = EMPTY[filter]
    return (
      <div className="history">
        {bar}
        {summary}
        <EmptyState
          kind={filter === 'all' ? 'fuel' : filter}
          title={e.title}
          body={e.body}
          {...(filter === 'all'
            ? { hint: 'Đã có dữ liệu cũ? Vào Cài đặt → Nhập dữ liệu.' }
            : {})}
        />
      </div>
    )
  }

  return (
    <div className="history">
      {bar}
      {summary}
      {blocks.map((b) => (
        <section className="history__month" key={b.key} aria-labelledby={`m-${b.key}`}>
          <h2 className="history__heading" id={`m-${b.key}`}>
            {b.heading}
          </h2>
          <ul className="history__list">
            {b.items.map((it) => (
              <li
                key={`${it.kind}-${it.id}`}
                className="animate-rise"
                style={{ '--i': Math.min(order.get(it) ?? 0, 10) } as React.CSSProperties}
              >
                <Row item={it} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

interface Fact {
  k: string
  v: string
  /** Carried onto the value so the consumption cell keeps its exact/suspect styling. */
  cls?: string
  exact?: boolean
  suspect?: boolean
  title?: string
}

/**
 * The facts a row is worth showing, in reading order.
 *
 * Built as data rather than markup so the empty ones simply never appear: a service record
 * has no litres, and a fill with no odometer has no distance. Printing "—" for each of
 * those would fill the timeline with absences instead of information.
 */
function factsOf(item: TimelineItem): Fact[] {
  const f: Fact[] = []
  if (item.odometer_km != null) f.push({ k: 'ODO', v: km(item.odometer_km) })
  if (item.delta_km != null && item.delta_km > 0) f.push({ k: 'Đi được', v: km(item.delta_km) })
  if (item.liters != null)
    f.push({ k: 'Số lượng', v: `${dec2(item.liters)} ${item.unit ?? ''}`.trim() })
  if (item.unit_price != null)
    f.push({ k: 'Đơn giá', v: `${money(item.unit_price)}/${item.unit ?? 'L'}` })
  if (item.consumption) {
    const c = item.consumption
    f.push({
      k: 'Tiêu thụ',
      v: `${c.exact ? '' : '~'}${dec2(c.l100)} ${item.unit ?? 'L'}/100km`,
      cls: 'row__cons',
      exact: c.exact,
      suspect: c.outOfBand,
      title: c.outOfBand
        ? 'Ngoài dải hợp lý của loại xe này — nhiều khả năng thiếu số lít hoặc sai số km'
        : c.exact
          ? 'Đo giữa hai lần đổ đầy bình'
          : 'Ước tính từ quãng đường kể từ lần đổ trước',
    })
  }
  return f
}

function Row({ item, onOpen }: { item: TimelineItem; onOpen: (i: TimelineItem) => void }) {
  const facts = factsOf(item)

  return (
    <button type="button" className="row" data-kind={item.kind} onClick={() => onOpen(item)}>
      <span className="row__dot" aria-hidden="true" />
      <span className="row__main">
        <span className="row__top">
          <span className="row__titlewrap">
            <span className="row__title">{item.title}</span>
            {item.badge ? <span className="row__badge">{item.badge}</span> : null}
          </span>
          <span className="row__amount num">{money(item.total_amount)}</span>
        </span>

        {facts.length > 0 && (
          <span className="row__facts">
            {facts.map((f) => (
              <span className="fact" key={f.k}>
                <span className="fact__k">{f.k}</span>
                <span
                  className={`fact__v num${f.cls ? ` ${f.cls}` : ''}`}
                  data-exact={f.exact === undefined ? undefined : String(f.exact)}
                  data-suspect={f.suspect ? '' : undefined}
                  title={f.title}
                >
                  {f.v}
                </span>
              </span>
            ))}
          </span>
        )}

        <span className="row__bottom">
          {/* Tags — full/partial tank, missed fill, station, or the service items. Long
              ones truncate here rather than pushing the facts around. */}
          <span className="row__meta">{item.subtitle}</span>
          <span className="row__date num">
            {dateShort(item.date)}
            {item.time ? ` · ${item.time}` : ''}
          </span>
        </span>
      </span>
    </button>
  )
}
