import type { VehicleKind } from './types'

export const VEHICLE_KIND_LABEL: Record<VehicleKind, string> = {
  car: 'Ô tô',
  motorcycle: 'Xe máy',
  ev_car: 'Ô tô điện',
  ev_motorcycle: 'Xe máy điện',
  truck: 'Xe tải',
}

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
