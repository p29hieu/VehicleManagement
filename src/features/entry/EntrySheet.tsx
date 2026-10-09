import { useEffect, useState } from 'react'
import type { FuelType, RecordKind, ServiceItem, Vehicle } from '../../domain/types'
import { EXPENSE_CATEGORIES } from '../../domain/labels'
import { pickerOptions, resolveFuelType, verbForUnit } from '../../domain/fuelTypes'
import { nowHHMM, todayISO } from '../../lib/format'
import { useFuelTypes } from '../../hooks/useAppData'
import {
  deleteExpense, deleteFuelEntry, deleteService,
  getExpense, getFuelEntry, getService,
  saveExpense, saveFuelEntry, saveFuelType, saveService,
} from '../../db/repo'
import { Field } from '../../components/Field'
import { MoneyInput } from '../../components/MoneyInput'
import { fillMissing, reconcile, type FuelSide } from '../../domain/fuelMath'
import { NumberInput } from '../../components/NumberInput'
import { FuelFields } from './FuelFields'
import { ServiceFields, itemsSum } from './ServiceFields'
import './entry.css'

export interface EntryTarget {
  kind: RecordKind
  id: string
}

interface Props {
  vehicle: Vehicle
  latestOdo: number | null
  target: EntryTarget | null
  onClose: () => void
}

interface FormState {
  date: string
  /** `HH:MM`, or '' for "not recorded". An <input type="time"> reports an empty string
   *  when cleared, so '' is the shape the control already speaks. */
  time: string
  odometer_km: number | null
  total_amount: number | null
  /** Set once the user edits the total, after which it stops mirroring the item sum. */
  total_touched: boolean
  /** Same idea for the unit price: until the user types one, it mirrors the remembered
   *  price for the selected grade, which may only arrive after the first render. */
  price_touched: boolean
  fuel_type: FuelType
  quantity: number | null
  unit_price: number | null
  /** Which of money/litres the user actually entered. The other one is computed from it,
   *  and never the reverse — see domain/fuelMath.ts. */
  typed_side: FuelSide | null
  is_full_tank: boolean
  missed_fill: boolean
  station: string
  items: ServiceItem[]
  workshop: string
  category: string
  note: string
}

const blank = (fuel: FuelType): FormState => ({
  date: todayISO(),
  time: nowHHMM(),
  odometer_km: null,
  total_amount: null,
  total_touched: false,
  price_touched: false,
  fuel_type: fuel,
  quantity: null,
  unit_price: null,
  typed_side: null,
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
  const fuelTypes = useFuelTypes()
  const [kind, setKind] = useState<RecordKind>(target?.kind ?? 'fuel')
  const [form, setForm] = useState<FormState>(() => blank(vehicle.fuel_type))

  const [error, setError] = useState<string | null>(null)
  const [more, setMore] = useState(false)

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const allTypes = fuelTypes ?? []
  // Archived types stay out of the way, except the one this record already uses.
  const types = pickerOptions(allTypes, form.fuel_type)
  const rememberedPrice = (id: FuelType) => types.find((t) => t.id === id)?.price ?? null

  /**
   * The price actually used. Until the user types one it mirrors the price stored on the
   * selected type, so it still appears when the table resolves after the first render.
   */
  const priceOf = (f: FormState) =>
    f.price_touched || editing ? f.unit_price : (rememberedPrice(f.fuel_type) ?? f.unit_price)

  const effectivePrice = priceOf(form)

  /** Switching type swaps in that type's remembered price. When a type has none, the
   *  current figure is kept rather than wiped — losing what the user just typed is worse
   *  than offering a stale starting point they can edit. */
  const changeFuelType = (f: FuelType) =>
    setForm((prev) => {
      const unit_price = rememberedPrice(f) ?? priceOf(prev)
      return {
        ...prev,
        fuel_type: f,
        unit_price,
        price_touched: true,
        // A different grade means a different price, so the computed side follows.
        ...(() => {
          const pair = reconcile({ amount: prev.total_amount, quantity: prev.quantity, price: unit_price, typed: prev.typed_side })
          return { total_amount: pair.amount, quantity: pair.quantity }
        })(),
      }
    })

  useEffect(() => {
    if (!target) return
    void (async () => {
      if (target.kind === 'fuel') {
        const r = await getFuelEntry(target.id)
        if (!r) return
        setForm((f) => ({
          ...f, date: r.date, time: r.time ?? '', odometer_km: r.odometer_km, total_amount: r.total_amount,
          total_touched: true, price_touched: true, fuel_type: r.fuel_type ?? vehicle.fuel_type,
          quantity: r.quantity, unit_price: r.unit_price, is_full_tank: r.is_full_tank,
          typed_side: r.quantity != null ? 'quantity' : 'amount',
          missed_fill: r.missed_fill, station: r.station ?? '', note: r.note ?? '',
        }))
        if (r.quantity != null || r.station) setMore(true)
      } else if (target.kind === 'service') {
        const r = await getService(target.id)
        if (!r) return
        setForm((f) => ({
          ...f, date: r.date, time: r.time ?? '', odometer_km: r.odometer_km, total_amount: r.total_amount,
          total_touched: true, price_touched: true, items: r.items, workshop: r.workshop ?? '', note: r.note ?? '',
        }))
      } else {
        const r = await getExpense(target.id)
        if (!r) return
        setForm((f) => ({
          ...f, date: r.date, time: r.time ?? '', odometer_km: r.odometer_km, total_amount: r.total_amount,
          total_touched: true, price_touched: true, category: r.category, note: r.note ?? '',
        }))
      }
    })()
  }, [target, vehicle.fuel_type])

  /**
   * The remembered unit price resolves from Dexie after the first render, so the user can
   * easily have typed an amount while there was no price to convert it with. This fills
   * the empty side once a price exists — and only the empty one, so reopening a record
   * never rewrites figures it already holds.
   */
  useEffect(() => {
    if (kind !== 'fuel') return
    setForm((f) => {
      const filled = fillMissing({
        amount: f.total_amount,
        quantity: f.quantity,
        price: priceOf(f),
        typed: f.typed_side,
      })
      // Returning the same object matters: a new one every run would loop forever.
      return filled.amount === f.total_amount && filled.quantity === f.quantity
        ? f
        : { ...f, total_amount: filled.amount, quantity: filled.quantity }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePrice, kind])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Until the user touches the total, it tracks the sum of any priced service items.
  const setItems = (items: ServiceItem[]) =>
    setForm((f) => {
      const sum = itemsSum(items)
      return { ...f, items, ...(f.total_touched || sum == null ? {} : { total_amount: sum }) }
    })

  const setTotal = (v: number | null) =>
    setForm((f) => {
      const next = { ...f, total_amount: v, total_touched: true, typed_side: 'amount' as FuelSide }
      if (kind !== 'fuel') return { ...f, total_amount: v, total_touched: true }
      const pair = reconcile({ amount: v, quantity: f.quantity, price: priceOf(next), typed: 'amount' })
      return { ...next, total_amount: pair.amount, quantity: pair.quantity }
    })

  /** Typing litres fills in the money, which is the direction the form could not do before. */
  const setQuantity = (v: number | null) =>
    setForm((f) => {
      const next = { ...f, quantity: v, typed_side: 'quantity' as FuelSide, total_touched: true }
      const pair = reconcile({ amount: f.total_amount, quantity: v, price: priceOf(next), typed: 'quantity' })
      return { ...next, total_amount: pair.amount, quantity: pair.quantity }
    })

  const setUnitPrice = (v: number | null) =>
    setForm((f) => {
      const next = { ...f, unit_price: v, price_touched: true }
      if (kind !== 'fuel') return next
      const pair = reconcile({ amount: f.total_amount, quantity: f.quantity, price: v, typed: f.typed_side })
      return { ...next, total_amount: pair.amount, quantity: pair.quantity }
    })

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
    if (kind === 'fuel' && !form.fuel_type)
      return setError('Chọn loại nhiên liệu.')

    const base = {
      vehicle_id: vehicle.id,
      date: form.date,
      time: form.time || null,
      odometer_km: form.odometer_km,
      total_amount: form.total_amount,
      note: form.note.trim() || null,
      ...(editing ? { id: target.id } : {}),
    }

    if (kind === 'fuel') {
      // Both sides are normally filled as the user types; this covers a save that beats
      // the price arriving. It only fills what is missing, so nothing typed is rewritten.
      const pair = fillMissing({
        amount: form.total_amount,
        quantity: form.quantity,
        price: effectivePrice,
        typed: form.typed_side,
      })

      await saveFuelEntry({
        ...base,
        total_amount: pair.amount,
        fuel_type: form.fuel_type,
        quantity: pair.quantity,
        unit_price: effectivePrice,
        is_full_tank: form.is_full_tank,
        missed_fill: form.missed_fill,
        station: form.station.trim() || null,
        payment_method: null,
      })

      // Remember the price on the fuel type itself, so the next fill of it starts there.
      const row = allTypes.find((t) => t.id === form.fuel_type)
      if (row && effectivePrice != null && effectivePrice > 0 && row.price !== effectivePrice) {
        await saveFuelType({ ...row, price: effectivePrice })
      }
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
    fuel: verbForUnit(resolveFuelType(form.fuel_type, allTypes).unit),
    service: 'Bảo dưỡng',
    expense: 'Chi phí khác',
  }

  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <header className="sheet__head">
          <h2 className="sheet__title" id="sheet-title">
            {TITLE[kind]} — {vehicle.name}
          </h2>
          <button type="button" className="sheet__close" onClick={onClose} aria-label="Đóng">✕</button>
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
          <Field
            label="Số tiền"
            htmlFor="f-amount"
            {...(kind === 'fuel' && form.typed_side === 'quantity' && form.total_amount != null
              ? { hint: 'Tự tính từ số lượng × đơn giá' }
              : {})}
          >
            <MoneyInput id="f-amount" big value={form.total_amount} onChange={setTotal} />
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
            <FuelFields
              fuelTypes={types}
              fuelType={form.fuel_type}
              unitPrice={effectivePrice}
              quantity={form.quantity}
              totalAmount={form.total_amount}
              isFullTank={form.is_full_tank}
              missedFill={form.missed_fill}
              station={form.station}
              onFuelType={changeFuelType}
              onUnitPrice={setUnitPrice}
              onQuantity={setQuantity}
              typedSide={form.typed_side}
              onFullTank={(v) => set('is_full_tank', v)}
              onMissedFill={(v) => set('missed_fill', v)}
              onStation={(v) => set('station', v)}
              more={more}
              onMore={setMore}
            />
          )}

          {kind === 'service' && (
            <ServiceFields
              items={form.items}
              workshop={form.workshop}
              totalAmount={form.total_amount}
              totalTouched={form.total_touched}
              onItems={setItems}
              onWorkshop={(v) => set('workshop', v)}
              onTotal={setTotal}
            />
          )}

          {kind === 'expense' && (
            <Field label="Nhóm chi phí" htmlFor="f-cat">
              <select
                id="f-cat"
                className="input"
                value={form.category}
                onChange={(e) => set('category', e.target.value)}
              >
                {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          )}

          <div className="when">
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
            {/* Optional on purpose: clearing it stores null rather than blocking the save. */}
            <Field label="Giờ" htmlFor="f-time">
              <input
                id="f-time"
                className="input"
                type="time"
                value={form.time}
                onChange={(e) => set('time', e.target.value)}
              />
            </Field>
          </div>

          <Field label="Ghi chú" htmlFor="f-note">
            <input
              id="f-note"
              className="input"
              type="text"
              value={form.note}
              onChange={(e) => set('note', e.target.value)}
            />
          </Field>

          {error && <p className="sheet__error" role="alert">{error}</p>}
        </div>

        <footer className="sheet__foot">
          {editing && <button type="button" className="btn btn--danger" onClick={remove}>Xoá</button>}
          <button type="submit" className="btn btn--primary">Lưu</button>
        </footer>
      </form>
    </div>
  )
}
