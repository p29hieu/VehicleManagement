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

function Row({ item, onOpen }: { item: TimelineItem; onOpen: (i: TimelineItem) => void }) {
  // Distance since the previous record is the number users actually scan for, so it sits
  // on the row rather than being hidden behind a tap.
  const meta = [
    item.odometer_km != null ? km(item.odometer_km) : null,
    item.delta_km != null && item.delta_km > 0 ? `${km(item.delta_km)} trước đó` : null,
    item.subtitle,
  ].filter(Boolean) as string[]

  return (
    <button type="button" className="row" data-kind={item.kind} onClick={() => onOpen(item)}>
      <span className="row__dot" aria-hidden="true" />
      <span className="row__main">
        <span className="row__top">
          <span className="row__titlewrap">
            <span className="row__title">{item.title}</span>
            {item.badge ? <span className="row__badge">{item.badge}</span> : null}
          </span>
          <span className="row__date num">{dateShort(item.date)}</span>
        </span>
        <span className="row__bottom">
          <span className="row__meta num">{meta.join(' · ')}</span>
          {item.consumption ? (
            <span
              className="row__cons num"
              data-exact={String(item.consumption.exact)}
              data-suspect={item.consumption.outOfBand ? '' : undefined}
              title={
                item.consumption.outOfBand
                  ? 'Ngoài dải hợp lý của loại xe này — nhiều khả năng thiếu số lít hoặc sai số km'
                  : item.consumption.exact
                    ? 'Đo giữa hai lần đổ đầy bình'
                    : 'Ước tính — chưa có lần đổ nào được đánh dấu đổ đầy bình'
              }
            >
              {item.consumption.exact ? '' : '~'}
              {dec2(item.consumption.l100)}
            </span>
          ) : null}
          <span className="row__amount num">{money(item.total_amount)}</span>
        </span>
      </span>
    </button>
  )
}
