import { useMemo } from 'react'
import type { TimelineItem } from '../../domain/types'
import { dateShort, km, money, monthHeading, monthKey } from '../../lib/format'
import { EmptyState } from '../../components/EmptyState'
import './history.css'

interface Props {
  items: TimelineItem[] | undefined
  onOpen: (item: TimelineItem) => void
}

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

export function HistoryScreen({ items, onOpen }: Props) {
  const blocks = useMemo(() => groupByMonth(items ?? []), [items])

  if (items === undefined) return <p className="history__loading">Đang tải…</p>
  if (!items.length)
    return (
      <EmptyState
        kind="fuel"
        title="Chưa có bản ghi nào"
        body="Bấm nút + để thêm lần đổ xăng, bảo dưỡng hoặc chi phí đầu tiên."
        hint="Đã có dữ liệu cũ? Vào Cài đặt → Nhập dữ liệu."
      />
    )

  return (
    <div className="history">
      {blocks.map((b) => (
        <section className="history__month" key={b.key} aria-labelledby={`m-${b.key}`}>
          <h2 className="history__heading" id={`m-${b.key}`}>
            {b.heading}
          </h2>
          <ul className="history__list">
            {b.items.map((it) => (
              <li key={`${it.kind}-${it.id}`}>
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
          <span className="row__title">{item.title}</span>
          <span className="row__date num">{dateShort(item.date)}</span>
        </span>
        <span className="row__bottom">
          <span className="row__meta num">{meta.join(' · ')}</span>
          <span className="row__amount num">{money(item.total_amount)}</span>
        </span>
      </span>
    </button>
  )
}
