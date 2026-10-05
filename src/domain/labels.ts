import type { FuelType, VehicleKind } from './types'

export const VEHICLE_KIND_LABEL: Record<VehicleKind, string> = {
  car: 'Ô tô',
  motorcycle: 'Xe máy',
  ev_car: 'Ô tô điện',
  ev_motorcycle: 'Xe máy điện',
  truck: 'Xe tải',
}

export const FUEL_TYPE_LABEL: Record<FuelType, string> = {
  ron95: 'Xăng RON 95',
  e5ron92: 'Xăng E5 RON 92',
  diesel: 'Dầu Diesel',
  electric: 'Điện',
  hybrid: 'Hybrid xăng-điện',
}

/** Compact form for the timeline badge, where the full name would not fit. */
export const FUEL_TYPE_SHORT: Record<FuelType, string> = {
  ron95: 'RON 95',
  e5ron92: 'E5',
  diesel: 'Diesel',
  electric: 'Điện',
  hybrid: 'Hybrid',
}

export const isElectric = (f: FuelType) => f === 'electric'

/** "Đổ xăng" vs "Sạc điện" — the wording follows the vehicle, per docs/02-UIUX.md §8.
 *  A single hard-coded "Nạp nhiên liệu" for every case reads like machine translation. */
export const fuelVerb = (f: FuelType) => (isElectric(f) ? 'Sạc điện' : 'Đổ xăng')
export const quantityUnit = (f: FuelType) => (isElectric(f) ? 'kWh' : 'lít')
export const priceUnit = (f: FuelType) => (isElectric(f) ? 'đ/kWh' : 'đ/lít')

export const SERVICE_ITEMS = [
  'Thay dầu máy',
  'Thay lọc dầu',
  'Thay lọc gió động cơ',
  'Thay lọc gió điều hoà',
  'Thay lọc xăng',
  'Thay bugi',
  'Thay gạt mưa',
  'Thay nước làm mát',
  'Thay dầu hộp số',
  'Thay dầu phanh',
  'Thay má phanh',
  'Thay lốp',
  'Đảo lốp / cân bằng động',
  'Thay ắc quy',
  'Thay nhông sên dĩa',
  'Thay dây curoa',
  'Vệ sinh kim phun / buồng đốt',
  'Bảo dưỡng định kỳ',
  'Kiểm tra pin / BMS (xe điện)',
  'Đăng kiểm',
  'Khác',
] as const

export const EXPENSE_CATEGORIES = [
  'Gửi xe',
  'Phí cầu đường / BOT',
  'Rửa xe',
  'Bảo hiểm TNDS',
  'Bảo hiểm vật chất',
  'Phí đăng kiểm',
  'Phí đường bộ',
  'Phạt nguội / vi phạm',
  'Phụ kiện',
  'Sửa chữa đột xuất',
  'Thuê bãi',
  'Khác',
] as const
