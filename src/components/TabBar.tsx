import { NavLink } from 'react-router-dom'

const TABS = [
  { to: '/', label: 'Lịch sử', end: true },
  { to: '/bao-cao', label: 'Báo cáo', end: false },
  { to: '/nhac-nho', label: 'Nhắc nhở', end: false },
  { to: '/cai-dat', label: 'Cài đặt', end: false },
] as const

interface Props {
  canAdd: boolean
  onAdd: () => void
}

export function TabBar({ canAdd, onAdd }: Props) {
  return (
    <nav className="tabbar" aria-label="Điều hướng chính">
      {TABS.slice(0, 2).map((t) => (
        <Tab key={t.to} {...t} />
      ))}

      <button
        type="button"
        className="tabbar__fab"
        onClick={onAdd}
        disabled={!canAdd}
        aria-label={canAdd ? 'Thêm bản ghi' : 'Thêm bản ghi (cần có phương tiện trước)'}
      >
        <span aria-hidden="true">+</span>
      </button>

      {TABS.slice(2).map((t) => (
        <Tab key={t.to} {...t} />
      ))}
    </nav>
  )
}

function Tab({ to, label, end }: { to: string; label: string; end: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `tabbar__tab${isActive ? ' is-active' : ''}`}>
      {label}
    </NavLink>
  )
}
