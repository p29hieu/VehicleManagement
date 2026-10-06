import { useEffect, useState } from 'react'
import {
  makeFuelTypeId,
  priceUnitLabel,
  type FuelTypeRow,
  type FuelUnit,
} from '../../domain/fuelTypes'
import { deleteFuelType, saveFuelType, setFuelTypeArchived } from '../../db/repo'
import { Field } from '../../components/Field'
import { MoneyInput } from '../../components/MoneyInput'

interface Props {
  /** null = creating a new type. */
  row: FuelTypeRow | null
  existing: readonly FuelTypeRow[]
  onClose: () => void
}

export function FuelTypeSheet({ row, existing, onClose }: Props) {
  const editing = row !== null
  const [name, setName] = useState(row?.name ?? '')
  const [short, setShort] = useState(row?.short ?? '')
  const [unit, setUnit] = useState<FuelUnit>(row?.unit ?? 'liter')
  const [price, setPrice] = useState<number | null>(row?.price ?? null)
  const [error, setError] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<{ vehicles: number; entries: number } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return setError('Nhập tên loại nhiên liệu.')
    const clash = existing.some(
      (f) => f.id !== row?.id && f.name.trim().toLowerCase() === trimmed.toLowerCase(),
    )
    if (clash) return setError('Đã có loại trùng tên.')

    const id = row?.id ?? makeFuelTypeId(trimmed, existing.map((f) => f.id))
    await saveFuelType({
      id,
      name: trimmed,
      // A short tag is what fits on a timeline badge; fall back to a clipped name.
      short: short.trim() || trimmed.slice(0, 8),
      unit,
      price,
      sort: row?.sort ?? (existing.reduce((m, f) => Math.max(m, f.sort), 0) + 10),
      archived: row?.archived ?? false,
      builtin: row?.builtin ?? false,
    })
    onClose()
  }

  async function remove() {
    if (!row) return
    const res = await deleteFuelType(row.id)
    // Deleting a type that records point at would orphan them, so that path archives
    // instead — and says so rather than failing quietly.
    if (!res.ok) return setBlocked(res.usage)
    onClose()
  }

  async function archive() {
    if (!row) return
    await setFuelTypeArchived(row.id, true)
    onClose()
  }

  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="ft-title">
        <header className="sheet__head">
          <h2 className="sheet__title" id="ft-title">
            {editing ? 'Sửa loại nhiên liệu' : 'Thêm loại nhiên liệu'}
          </h2>
          <button type="button" className="sheet__close" onClick={onClose} aria-label="Đóng">✕</button>
        </header>

        <div className="sheet__body">
          <Field label="Tên" htmlFor="ft-name" hint="Ví dụ: Xăng RON 98, Dầu Diesel cao cấp…">
            <input id="ft-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>

          <Field label="Tên rút gọn" htmlFor="ft-short" hint="Hiện trên dòng lịch sử. Bỏ trống thì tự cắt từ tên.">
            <input id="ft-short" className="input" value={short} onChange={(e) => setShort(e.target.value)} maxLength={10} />
          </Field>

          <Field label="Đơn vị">
            <div className="segmented" role="radiogroup" aria-label="Đơn vị">
              {([['liter', 'Lít'], ['kwh', 'kWh']] as const).map(([u, label]) => (
                <button
                  key={u}
                  type="button"
                  role="radio"
                  aria-checked={unit === u}
                  className={`segmented__opt${unit === u ? ' is-active' : ''}`}
                  onClick={() => setUnit(u)}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>

          <Field label={`Đơn giá (${priceUnitLabel(unit)})`} htmlFor="ft-price" hint="Dùng làm giá mặc định cho lần đổ tới.">
            <MoneyInput id="ft-price" value={price} onChange={setPrice} suffix={priceUnitLabel(unit)} />
          </Field>

          {blocked && (
            <div className="issues issues--warn">
              <p className="issues__title">Không xoá được — đang có dữ liệu dùng loại này</p>
              <ul>
                {blocked.vehicles > 0 && <li>{blocked.vehicles} phương tiện</li>}
                {blocked.entries > 0 && <li>{blocked.entries} bản ghi đổ nhiên liệu</li>}
              </ul>
              <p style={{ marginBlockStart: 8 }}>
                Có thể <strong>ẩn</strong> loại này: nó biến mất khỏi danh sách chọn, nhưng các
                bản ghi cũ vẫn hiển thị đúng.
              </p>
              <button type="button" className="btn btn--ghost" style={{ marginBlockStart: 8 }} onClick={() => void archive()}>
                Ẩn loại này
              </button>
            </div>
          )}

          {row?.archived && (
            <div className="issues issues--warn">
              <p className="issues__title">Loại này đang bị ẩn</p>
              <button
                type="button"
                className="btn btn--ghost"
                style={{ marginBlockStart: 8 }}
                onClick={() => void setFuelTypeArchived(row.id, false).then(onClose)}
              >
                Hiện lại
              </button>
            </div>
          )}

          {error && <p className="sheet__error" role="alert">{error}</p>}
        </div>

        <footer className="sheet__foot">
          {editing && !row.archived && (
            <button type="button" className="btn btn--danger" onClick={() => void remove()}>Xoá</button>
          )}
          <button type="submit" className="btn btn--primary">Lưu</button>
        </footer>
      </form>
    </div>
  )
}
