import { useState } from 'react'
import { DB_NAME, clearAllData } from '../../db'
import type { Vehicle } from '../../domain/types'
import { VEHICLE_KIND_LABEL } from '../../domain/labels'
import { priceUnitLabel, resolveFuelType, unitLabel, type FuelTypeRow } from '../../domain/fuelTypes'
import { FuelTypeSheet } from './FuelTypeSheet'
import { useCounts, useFuelTypes, useVehicles } from '../../hooks/useAppData'
import { VehicleSheet } from '../vehicles/VehicleSheet'
import { ImportPanel } from './ImportPanel'
import { SyncPanel } from './SyncPanel'
import './settings.css'

export function SettingsScreen() {
  const vehicles = useVehicles()
  const fuelTypes = useFuelTypes()
  const counts = useCounts()
  const [editing, setEditing] = useState<Vehicle | null | undefined>(undefined)
  const [editingFuel, setEditingFuel] = useState<FuelTypeRow | null | undefined>(undefined)

  async function wipe() {
    if (!confirm('Xoá TOÀN BỘ dữ liệu trên thiết bị này? Không hoàn tác được.')) return
    if (!confirm('Chắc chắn chứ? Mọi phương tiện và bản ghi sẽ biến mất.')) return
    await clearAllData()
  }

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
                  {VEHICLE_KIND_LABEL[v.kind]} · {resolveFuelType(v.fuel_type, fuelTypes ?? []).name}
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
        <h2 className="panel__title">Loại nhiên liệu</h2>
        <p className="panel__hint">
          Thêm, sửa hoặc xoá cho hợp với xe bạn đang dùng. Đơn giá ở đây là giá mặc định cho
          lần đổ tới; mỗi lần đổ bạn vẫn sửa được, và giá mới sẽ được nhớ lại.
        </p>
        <ul className="ftlist">
          {(fuelTypes ?? []).map((f) => (
            <li key={f.id}>
              <button
                type="button"
                className="ftlist__row"
                data-archived={f.archived ? '' : undefined}
                onClick={() => setEditingFuel(f)}
              >
                <span className="ftlist__main">
                  <span className="ftlist__name">{f.name}</span>
                  <span className="ftlist__meta">
                    {f.short} · {unitLabel(f.unit)}
                    {f.archived ? ' · đang ẩn' : ''}
                  </span>
                </span>
                <span className="ftlist__price num">
                  {f.price != null ? `${f.price.toLocaleString('vi-VN')} ${priceUnitLabel(f.unit)}` : '—'}
                </span>
              </button>
            </li>
          ))}
          {fuelTypes?.length === 0 && <li className="vlist__empty">Chưa có loại nhiên liệu nào.</li>}
        </ul>
        <button type="button" className="btn btn--ghost" onClick={() => setEditingFuel(null)}>
          + Thêm loại nhiên liệu
        </button>
      </section>

      <ImportPanel />

      <SyncPanel />

      <section className="panel">
        <h2 className="panel__title">Dữ liệu của bạn</h2>
        <p className="panel__hint">
          Mọi thứ nằm trong IndexedDB <code>{DB_NAME}</code> ngay trên thiết bị này.
          Không có máy chủ nào của tôi giữ bản sao. Nếu bạn bật đồng bộ ở trên, một bản sao
          nữa nằm trong Drive của chính bạn — vẫn là tuỳ chọn, và tắt lúc nào cũng được.
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
        <p className="panel__hint">
          Xoá cả trên Drive nếu đang bật đồng bộ: thao tác này ghi lại dấu xoá cho từng bản
          ghi, nên lần đồng bộ sau sẽ xoá chúng trên mọi thiết bị khác luôn.
        </p>
        <button type="button" className="btn btn--danger" onClick={() => void wipe()}>
          Xoá toàn bộ dữ liệu
        </button>
      </section>

      {editing !== undefined && (
        <VehicleSheet vehicle={editing} onClose={() => setEditing(undefined)} />
      )}
      {editingFuel !== undefined && (
        <FuelTypeSheet
          row={editingFuel}
          existing={fuelTypes ?? []}
          onClose={() => setEditingFuel(undefined)}
        />
      )}
    </div>
  )
}
