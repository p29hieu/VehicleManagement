import { Suspense, lazy, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { EmptyState } from './components/EmptyState'
import { TabBar } from './components/TabBar'
import { HistoryScreen } from './features/history/HistoryScreen'
import { EntrySheet, type EntryTarget } from './features/entry/EntrySheet'
import { VehicleSwitcher } from './features/vehicles/VehicleSwitcher'
import { useActiveVehicle, useLatestOdometer, useTimeline, useVehicles } from './hooks/useAppData'
import './styles/app.css'

/** Settings pulls in zod and the whole import pipeline, none of which the timeline needs.
 *  Loading it on demand keeps the first paint lean. */
const SettingsScreen = lazy(() =>
  import('./features/settings/SettingsScreen').then((m) => ({ default: m.SettingsScreen })),
)

export default function App() {
  const vehicles = useVehicles()
  const active = useActiveVehicle()
  const timeline = useTimeline(active?.id)
  const latestOdo = useLatestOdometer(active?.id)
  const [sheet, setSheet] = useState<{ open: boolean; target: EntryTarget | null }>({
    open: false,
    target: null,
  })
  const navigate = useNavigate()

  const hasVehicle = !!active

  return (
    <>
      <header className="appbar">
        <div className="appbar__brand">
          <span className="appbar__mark" aria-hidden="true" />
          <VehicleSwitcher vehicles={vehicles ?? []} active={active ?? null} />
        </div>
        <NavLink to="/cai-dat" className="appbar__action">
          Cài đặt
        </NavLink>
      </header>

      <main className="content" id="noi-dung">
        <Routes>
          <Route
            path="/"
            element={
              hasVehicle ? (
                <HistoryScreen
                  items={timeline}
                  vehicle={active}
                  onOpen={(it) => setSheet({ open: true, target: { kind: it.kind, id: it.id } })}
                />
              ) : (
                <EmptyState
                  kind="fuel"
                  title="Chưa có phương tiện nào"
                  body="Thêm chiếc xe đầu tiên, hoặc nhập dữ liệu đã có sẵn từ file."
                  action={{ label: 'Mở Cài đặt', onClick: () => void navigate('/cai-dat') }}
                />
              )
            }
          />
          <Route
            path="/bao-cao"
            element={
              <EmptyState
                kind="report"
                title="Chưa đủ dữ liệu"
                body="Cần ít nhất 3 lần đổ nhiên liệu để tính được mức tiêu thụ và chi phí trung bình."
                hint="Giai đoạn P3–P4."
              />
            }
          />
          <Route
            path="/nhac-nho"
            element={
              <EmptyState
                kind="service"
                title="Chưa có nhắc nhở"
                body="Đặt nhắc theo số km, theo thời gian, hoặc cả hai — cái nào tới trước thì báo."
                hint="Giai đoạn P8."
              />
            }
          />
          <Route
            path="/cai-dat"
            element={
              <Suspense fallback={<p className="route-loading">Đang tải…</p>}>
                <SettingsScreen />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <TabBar canAdd={hasVehicle} onAdd={() => setSheet({ open: true, target: null })} />

      {sheet.open && active && (
        <EntrySheet
          vehicle={active}
          latestOdo={latestOdo ?? null}
          target={sheet.target}
          onClose={() => setSheet({ open: false, target: null })}
        />
      )}
    </>
  )
}
