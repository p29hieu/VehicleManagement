import { useEffect, useRef, useState } from 'react'
import type { RecordKind, Vehicle } from '../../domain/types'
import { EXPENSE_CATEGORIES, SERVICE_ITEMS, fuelVerb, priceUnit, quantityUnit } from '../../domain/labels'
import { todayISO } from '../../lib/format'
import {
  deleteExpense,
  deleteFuelEntry,
  deleteService,
  getExpense,
  getFuelEntry,
  getService,
  saveExpense,
  saveFuelEntry,
  saveService,
} from '../../db/repo'
import { Field } from '../../components/Field'
import { MoneyInput } from '../../components/MoneyInput'
import { NumberInput } from '../../components/NumberInput'
import './entry.css'

export interface EntryTarget {
  kind: RecordKind
  id: string
}

interface Props {
  vehicle: Vehicle
  /** Latest known odometer, used to offer a starting point for a new record. */
  latestOdo: number | null
  target: EntryTarget | null
  onClose: () => void
}

interface FormState {
  date: string
  odometer_km: number | null
  total_amount: number | null
  // fuel
  quantity: number | null
  unit_price: number | null
  is_full_tank: boolean
  missed_fill: boolean
  station: string
  // service
  items: string[]
  workshop: string
  // expense
  category: string
  note: string
}

const blank = (): FormState => ({
  date: todayISO(),
  odometer_km: null,
  total_amount: null,
  quantity: null,
  unit_price: null,
  is_full_tank: false,
  missed_fill: false,
  station: '',
  items: [],
  workshop: '',
  category: EXPENSE_CATEGORIES[0],
  note: '',
})

export function EntrySheet({ vehicle, latestOdo, target, onClose }: Props) {
  const editing = target !== null
  const [kind, setKind] = useState<RecordKind>(target?.kind ?? 'fuel')
  const [form, setForm] = useState<FormState>(blank)
  const [error, setError] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  const firstRef = useRef<HTMLInputElement>(null)

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    if (!target) return
    void (async () => {
      if (target.kind === 'fuel') {
        const r = await getFuelEntry(target.id)
        if (!r) return
        setForm((f) => ({
          ...f,
          date: r.date,
          odometer_km: r.odometer_km,
          total_amount: r.total_amount,
          quantity: r.quantity,
          unit_price: r.unit_price,
          is_full_tank: r.is_full_tank,
          missed_fill: r.missed_fill,
          station: r.station ?? '',
          note: r.note ?? '',
        }))
        if (r.quantity != null || r.unit_price != null || r.station) setMore(true)
      } else if (target.kind === 'service') {
        const r = await getService(target.id)
        if (!r) return
        setForm((f) => ({
          ...f,
          date: r.date,
          odometer_km: r.odometer_km,
          total_amount: r.total_amount,
          items: r.items,
          workshop: r.workshop ?? '',
          note: r.note ?? '',
        }))
      } else {
        const r = await getExpense(target.id)
        if (!r) return
        setForm((f) => ({
          ...f,
          date: r.date,
          odometer_km: r.odometer_km,
          total_amount: r.total_amount,
          category: r.category,
          note: r.note ?? '',
        }))
      }
    })()
  }, [target])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    firstRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (form.total_amount == null && form.quantity == null)
      return setError('Cần ít nhất số tiền hoặc số lượng.')
    if (form.odometer_km != null && latestOdo != null && form.odometer_km < latestOdo && !editing)
      return setError(
        `Số km (${form.odometer_km.toLocaleString('vi-VN')}) nhỏ hơn bản ghi gần nhất ` +
          `(${latestOdo.toLocaleString('vi-VN')}). Bạn vừa thay đồng hồ?`,
      )
    if (kind === 'service' && form.items.length === 0)
      return setError('Chọn ít nhất một hạng mục bảo dưỡng.')

    const base = {
      vehicle_id: vehicle.id,
      date: form.date,
      odometer_km: form.odometer_km,
      total_amount: form.total_amount,
      note: form.note.trim() || null,
      ...(editing ? { id: target.id } : {}),
    }

    if (kind === 'fuel') {
      await saveFuelEntry({
        ...base,
        quantity: form.quantity,
        unit_price: form.unit_price,
        is_full_tank: form.is_full_tank,
        missed_fill: form.missed_fill,
        station: form.station.trim() || null,
        payment_method: null,
      })
    } else if (kind === 'service') {
      await saveService({ ...base, items: form.items, workshop: form.workshop.trim() || null })
    } else {
      await saveExpense({ ...base, category: form.category })
    }
    onClose()
  }

  async function remove() {
    if (!target) return
    if (!confirm('Xoá bản ghi này? Không hoàn tác được.')) return
    if (target.kind === 'fuel') await deleteFuelEntry(target.id)
    else if (target.kind === 'service') await deleteService(target.id)
    else await deleteExpense(target.id)
    onClose()
  }

  const TITLE: Record<RecordKind, string> = {
    fuel: fuelVerb(vehicle.fuel_type),
    service: 'Bảo dưỡng',
    expense: 'Chi phí khác',
  }

  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="sheet"
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
      >
        <header className="sheet__head">
          <h2 className="sheet__title" id="sheet-title">
            {TITLE[kind]} — {vehicle.name}
          </h2>
          <button type="button" className="sheet__close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </header>

        {!editing && (
          <div className="kindtabs" role="tablist" aria-label="Loại bản ghi">
            {(['fuel', 'service', 'expense'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={kind === k}
                className={`kindtabs__tab${kind === k ? ' is-active' : ''}`}
                data-kind={k}
                onClick={() => setKind(k)}
              >
                {TITLE[k]}
              </button>
            ))}
          </div>
        )}

        <div className="sheet__body">
          <Field label="Số tiền" htmlFor="f-amount">
            <MoneyInput
              id="f-amount"
              big
              value={form.total_amount}
              onChange={(v) => set('total_amount', v)}
            />
          </Field>

          <Field
            label="Số km (ODO)"
            htmlFor="f-odo"
            hint={latestOdo != null ? `Gần nhất: ${latestOdo.toLocaleString('vi-VN')} km` : undefined}
          >
            <NumberInput
              id="f-odo"
              value={form.odometer_km}
              onChange={(v) => set('odometer_km', v)}
              suffix="km"
              suggestion={
                !editing && latestOdo != null
                  ? { value: latestOdo, label: `Dùng ${latestOdo.toLocaleString('vi-VN')} km` }
                  : undefined
              }
            />
          </Field>

          {kind === 'fuel' && (
            <FuelExtras form={form} set={set} vehicle={vehicle} more={more} setMore={setMore} />
          )}
          {kind === 'service' && <ServiceExtras form={form} set={set} />}
          {kind === 'expense' && <ExpenseExtras form={form} set={set} />}

          <Field label="Ngày" htmlFor="f-date">
            <input
              id="f-date"
              className="input"
              type="date"
              value={form.date}
              max={todayISO()}
              onChange={(e) => set('date', e.target.value)}
            />
          </Field>

          <Field label="Ghi chú" htmlFor="f-note">
            <input
              id="f-note"
              className="input"
              type="text"
              value={form.note}
              onChange={(e) => set('note', e.target.value)}
            />
          </Field>

          {error && (
            <p className="sheet__error" role="alert">
              {error}
            </p>
          )}
        </div>

        <footer className="sheet__foot">
          {editing && (
            <button type="button" className="btn btn--danger" onClick={remove}>
              Xoá
            </button>
          )}
          <button type="submit" className="btn btn--primary">
            Lưu
          </button>
        </footer>
      </form>
    </div>
  )
}

type SetFn = <K extends keyof FormState>(k: K, v: FormState[K]) => void

function FuelExtras({
  form,
  set,
  vehicle,
  more,
  setMore,
}: {
  form: FormState
  set: SetFn
  vehicle: Vehicle
  more: boolean
  setMore: (v: boolean) => void
}) {
  return (
    <>
      {/* This flag decides whether L/100km can ever be computed exactly (docs §3.1),
          so it is a pair of real buttons, not a checkbox hidden in an "advanced" section. */}
      <Field label="Mức đổ">
        <div className="segmented" role="radiogroup" aria-label="Mức đổ">
          <button
            type="button"
            role="radio"
            aria-checked={form.is_full_tank}
            className={`segmented__opt${form.is_full_tank ? ' is-active' : ''}`}
            onClick={() => set('is_full_tank', true)}
          >
            Đổ đầy bình
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={!form.is_full_tank}
            className={`segmented__opt${!form.is_full_tank ? ' is-active' : ''}`}
            onClick={() => set('is_full_tank', false)}
          >
            Đổ một phần
          </button>
        </div>
      </Field>

      <button type="button" className="disclose" aria-expanded={more} onClick={() => setMore(!more)}>
        {more ? '▾' : '▸'} Thêm chi tiết
      </button>

      {more && (
        <>
          <Field label={`Số lượng (${quantityUnit(vehicle.fuel_type)})`} htmlFor="f-qty">
            <NumberInput
              id="f-qty"
              value={form.quantity}
              onChange={(v) => set('quantity', v)}
              suffix={quantityUnit(vehicle.fuel_type)}
            />
          </Field>
          <Field label={`Đơn giá (${priceUnit(vehicle.fuel_type)})`} htmlFor="f-price">
            <MoneyInput
              id="f-price"
              value={form.unit_price}
              onChange={(v) => set('unit_price', v)}
              suffix={priceUnit(vehicle.fuel_type)}
            />
          </Field>
          <Field label="Trạm" htmlFor="f-station">
            <input
              id="f-station"
              className="input"
              type="text"
              value={form.station}
              onChange={(e) => set('station', e.target.value)}
            />
          </Field>
          <label className="check">
            <input
              type="checkbox"
              checked={form.missed_fill}
              onChange={(e) => set('missed_fill', e.target.checked)}
            />
            <span>Có lần đổ trước đó tôi quên ghi</span>
          </label>
        </>
      )}
    </>
  )
}

function ServiceExtras({ form, set }: { form: FormState; set: SetFn }) {
  const toggle = (item: string) =>
    set('items', form.items.includes(item) ? form.items.filter((i) => i !== item) : [...form.items, item])

  return (
    <>
      <Field label="Hạng mục" hint="Chọn một hoặc nhiều">
        <div className="chips">
          {SERVICE_ITEMS.map((it) => (
            <button
              key={it}
              type="button"
              aria-pressed={form.items.includes(it)}
              className={`chip${form.items.includes(it) ? ' is-active' : ''}`}
              onClick={() => toggle(it)}
            >
              {it}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Gara" htmlFor="f-shop">
        <input
          id="f-shop"
          className="input"
          type="text"
          value={form.workshop}
          onChange={(e) => set('workshop', e.target.value)}
        />
      </Field>
    </>
  )
}

function ExpenseExtras({ form, set }: { form: FormState; set: SetFn }) {
  return (
    <Field label="Nhóm chi phí" htmlFor="f-cat">
      <select
        id="f-cat"
        className="input"
        value={form.category}
        onChange={(e) => set('category', e.target.value)}
      >
        {EXPENSE_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </Field>
  )
}
