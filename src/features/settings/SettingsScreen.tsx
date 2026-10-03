import { useState } from 'react'
import { DB_NAME, clearAllData, patchSettings } from '../../db'
import { FUEL_TYPES, type FuelType, type Vehicle } from '../../domain/types'
import { FUEL_TYPE_LABEL, VEHICLE_KIND_LABEL, priceUnit } from '../../domain/labels'
import { useCounts, useSettings, useVehicles } from '../../hooks/useAppData'
import { MoneyInput } from '../../components/MoneyInput'
import { Field } from '../../components/Field'
import { VehicleSheet } from '../vehicles/VehicleSheet'
import { ImportPanel } from './ImportPanel'
import './settings.css'

export function SettingsScreen() {
  const vehicles = useVehicles()
  const settings = useSettings()
  const counts = useCounts()
  const [editing, setEditing] = useState<Vehicle | null | undefined>(undefined)

  async function wipe() {
    if (!confirm('Xoá TOÀN BỘ dữ liệu trên thiết bị này? Không hoàn tác được.')) return
    if (!confirm('Chắc chắn chứ? Mọi phương tiện và bản ghi sẽ biến mất.')) return
    await clearAllData()
  }

  const setPrice = (f: FuelType, v: number | null) =>
    void patchSettings({ fuel_prices: { ...settings.fuel_prices, [f]: v } })

  return (
    <div className="settings">
      <section className="panel">
        <h2 className="panel__title">Phương tiện</h2>
        <ul className="vlist">
          {(vehicles ?? []).map((v) => (
            <li key={v.id}>
              <button type="button" className="vlist__row" onClick={() => setEditing(v)}>
                <span className="vlist__name">{v.name}</span>
                <span className="vlist__meta">
                  {VEHICLE_KIND_LABEL[v.kind]} · {FUEL_TYPE_LABEL[v.fuel_type]}
                  {v.plate ? ` · ${v.plate}` : ''}
                </span>
              </button>
            </li>
          ))}
          {vehicles?.length === 0 && <li className="vlist__empty">Chưa có phương tiện nào.</li>}
        </ul>
        <button type="button" className="btn btn--ghost" onClick={() => setEditing(null)}>
          + Thêm phương tiện
        </button>
      </section>

      <section className="panel">
        <h2 className="panel__title">Đơn giá nhiên liệu</h2>
        <p className="panel__hint">
          Điền đơn giá để app suy ra số lít từ số tiền. Thiếu nó thì chỉ số tiêu thụ
          (lít/100km) không tính được.
        </p>
        <div className="prices">
          {FUEL_TYPES.filter((f) => f !== 'hybrid').map((f) => (
            <Field key={f} label={FUEL_TYPE_LABEL[f]} htmlFor={`p-${f}`}>
              <MoneyInput
                id={`p-${f}`}
                value={settings.fuel_prices[f] ?? null}
                onChange={(v) => setPrice(f, v)}
                suffix={priceUnit(f)}
              />
            </Field>
          ))}
        </div>
      </section>

      <ImportPanel />

      <section className="panel">
        <h2 className="panel__title">Dữ liệu của bạn</h2>
        <p className="panel__hint">
          Mọi thứ nằm trong IndexedDB <code>{DB_NAME}</code> ngay trên thiết bị này.
          Không có máy chủ nào giữ bản sao. Đồng bộ Google Drive sẽ thêm ở giai đoạn sau,
          và vẫn là tuỳ chọn.
        </p>
        {counts && (
          <ul className="stats">
            <li><strong className="num">{counts.vehicles}</strong> phương tiện</li>
            <li><strong className="num">{counts.fuel}</strong> bản ghi nhiên liệu</li>
            <li><strong className="num">{counts.services}</strong> bản ghi bảo dưỡng</li>
            <li><strong className="num">{counts.expenses}</strong> chi phí khác</li>
          </ul>
        )}
      </section>

      <section className="panel panel--danger">
        <h2 className="panel__title">Vùng nguy hiểm</h2>
        <button type="button" className="btn btn--danger" onClick={() => void wipe()}>
          Xoá toàn bộ dữ liệu
        </button>
      </section>

      {editing !== undefined && (
        <VehicleSheet vehicle={editing} onClose={() => setEditing(undefined)} />
      )}
    </div>
  )
}
