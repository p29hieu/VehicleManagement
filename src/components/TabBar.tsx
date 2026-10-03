import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

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
  const navRef = useRef<HTMLElement>(null)
  const [ind, setInd] = useState<{ x: number; w: number } | null>(null)
  const { pathname } = useLocation()

  /** Measure the active link so a single indicator can slide between tabs, instead of a
   *  border blinking on and off in four separate places. */
  const measure = useCallback(() => {
    const nav = navRef.current
    const active = nav?.querySelector<HTMLElement>('.tabbar__tab.is-active')
    if (!nav || !active) return
    const navBox = nav.getBoundingClientRect()
    const tabBox = active.getBoundingClientRect()
    setInd({ x: tabBox.left - navBox.left, w: tabBox.width })
  }, [])

  // Layout effect, so the first paint already has the indicator in the right place.
  useLayoutEffect(measure, [measure, pathname])

  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    // Rotation, a soft keyboard, or a late font swap all change tab geometry.
    const ro = new ResizeObserver(measure)
    ro.observe(nav)
    document.fonts?.ready.then(measure).catch(() => {})
    return () => ro.disconnect()
  }, [measure])

  const indStyle = ind
    ? ({ '--ind-x': `${ind.x}px`, '--ind-w': `${ind.w}px` } as React.CSSProperties)
    : undefined

  return (
    <nav className="tabbar" aria-label="Điều hướng chính" ref={navRef}>
      <span
        className="tabbar__indicator"
        aria-hidden="true"
        data-ready={ind ? 'true' : 'false'}
        {...(indStyle ? { style: indStyle } : {})}
      />

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
