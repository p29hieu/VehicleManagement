import { useEffect, useState } from 'react'
import { CONSUMPTION_BAND, FUEL_TYPES, VEHICLE_KINDS, type FuelType, type Vehicle, type VehicleKind } from '../../domain/types'
import { FUEL_TYPE_LABEL, VEHICLE_KIND_LABEL } from '../../domain/labels'
import { deleteVehicle, saveVehicle } from '../../db/repo'
import { Field } from '../../components/Field'
import { NumberInput } from '../../components/NumberInput'

interface Props {
  vehicle: Vehicle | null
  onClose: () => void
}

export function VehicleSheet({ vehicle, onClose }: Props) {
  const [name, setName] = useState(vehicle?.name ?? '')
  const [kind, setKind] = useState<VehicleKind>(vehicle?.kind ?? 'motorcycle')
  const [fuelType, setFuelType] = useState<FuelType>(vehicle?.fuel_type ?? 'ron95')
  const [plate, setPlate] = useState(vehicle?.plate ?? '')
  const [make, setMake] = useState(vehicle?.make ?? '')
  const [model, setModel] = useState(vehicle?.model ?? '')
  const [tank, setTank] = useState<number | null>(vehicle?.tank_capacity_l ?? null)
  const [odo, setOdo] = useState<number | null>(vehicle?.initial_odometer_km ?? null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Nhập tên xe.')
    // Band follows the vehicle class: a motorcycle at 2.3 L/100km is normal but would be
    // rejected by a car-shaped band (docs §3.4).
    const [lo, hi] = CONSUMPTION_BAND[kind]
    await saveVehicle({
      ...(vehicle ? { id: vehicle.id } : {}),
      name: name.trim(),
      kind,
      fuel_type: fuelType,
      make: make.trim() || null,
      model: model.trim() || null,
      plate: plate.trim() || null,
      year: vehicle?.year ?? null,
      tank_capacity_l: tank,
      battery_kwh: vehicle?.battery_kwh ?? null,
      initial_odometer_km: odo ?? 0,
      odometer_offset_km: vehicle?.odometer_offset_km ?? 0,
      consumption_min: lo,
      consumption_max: hi,
      is_active: vehicle?.is_active ?? true,
      note: vehicle?.note ?? null,
    })
    onClose()
  }

  async function remove() {
    if (!vehicle) return
    if (!confirm(`Xoá "${vehicle.name}" và TẤT CẢ bản ghi của xe này? Không hoàn tác được.`)) return
    await deleteVehicle(vehicle.id)
    onClose()
  }

  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="v-title">
        <header className="sheet__head">
          <h2 className="sheet__title" id="v-title">
            {vehicle ? 'Sửa phương tiện' : 'Thêm phương tiện'}
          </h2>
          <button type="button" className="sheet__close" onClick={onClose} aria-label="Đóng">✕</button>
        </header>

        <div className="sheet__body">
          <Field label="Tên xe" htmlFor="v-name">
            <input id="v-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Loại xe" htmlFor="v-kind">
            <select id="v-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as VehicleKind)}>
              {VEHICLE_KINDS.map((k) => <option key={k} value={k}>{VEHICLE_KIND_LABEL[k]}</option>)}
            </select>
          </Field>
          <Field label="Nhiên liệu" htmlFor="v-fuel">
            <select id="v-fuel" className="input" value={fuelType} onChange={(e) => setFuelType(e.target.value as FuelType)}>
              {FUEL_TYPES.map((f) => <option key={f} value={f}>{FUEL_TYPE_LABEL[f]}</option>)}
            </select>
          </Field>
          <Field label="Biển số" htmlFor="v-plate">
            <input id="v-plate" className="input" value={plate} onChange={(e) => setPlate(e.target.value)} />
          </Field>
          <Field label="Hãng" htmlFor="v-make">
            <input id="v-make" className="input" value={make} onChange={(e) => setMake(e.target.value)} />
          </Field>
          <Field label="Dòng xe" htmlFor="v-model">
            <input id="v-model" className="input" value={model} onChange={(e) => setModel(e.target.value)} />
          </Field>
          <Field label="Dung tích bình" htmlFor="v-tank" hint="Dùng để chặn số lít vô lý khi nhập">
            <NumberInput id="v-tank" value={tank} onChange={setTank} suffix="lít" />
          </Field>
          <Field label="ODO ban đầu" htmlFor="v-odo">
            <NumberInput id="v-odo" value={odo} onChange={setOdo} suffix="km" />
          </Field>
          {error && <p className="sheet__error" role="alert">{error}</p>}
        </div>

        <footer className="sheet__foot">
          {vehicle && <button type="button" className="btn btn--danger" onClick={remove}>Xoá xe</button>}
          <button type="submit" className="btn btn--primary">Lưu</button>
        </footer>
      </form>
    </div>
  )
}
