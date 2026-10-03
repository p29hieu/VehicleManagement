import type { Vehicle } from '../../domain/types'
import { patchSettings } from '../../db'
import './vehicles.css'

interface Props {
  vehicles: Vehicle[]
  active: Vehicle | null
}

/** A native select is one tap on mobile, keyboard-navigable for free, and needs no
 *  focus-trap of its own — worth more here than a bespoke dropdown. */
export function VehicleSwitcher({ vehicles, active }: Props) {
  if (!vehicles.length) return <span className="vswitch vswitch--empty">Chưa có xe</span>
  if (vehicles.length === 1) return <span className="vswitch__single">{active?.name}</span>

  return (
    <div className="vswitch">
      <select
        className="vswitch__select"
        aria-label="Chọn phương tiện"
        value={active?.id ?? ''}
        onChange={(e) => void patchSettings({ active_vehicle_id: e.target.value })}
      >
        {vehicles.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>
      <span className="vswitch__caret" aria-hidden="true">▾</span>
    </div>
  )
}
