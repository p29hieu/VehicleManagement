import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { EmptyState } from './components/EmptyState'
import { TabBar } from './components/TabBar'
import './styles/app.css'

/**
 * P0 shell. Every tab is an honest empty state — nothing here claims to work yet.
 * Its job is to prove routing, the base path and the deploy pipeline, so that
 * `/VehicleManagement/bao-cao` resolves on a cold load in a fresh incognito window.
 */
export default function App() {
  return (
    <>
      <header className="appbar">
        <div className="appbar__brand">
          <span className="appbar__mark" aria-hidden="true" />
          <span className="appbar__title">Quản lý xe</span>
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
              <EmptyState
                kind="fuel"
                title="Chưa có bản ghi nào"
                body="Lịch sử đổ xăng, bảo dưỡng và chi phí của bạn sẽ hiện ở đây."
                hint="Giai đoạn P1 sẽ bật phần nhập liệu."
              />
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
              <EmptyState
                kind="expense"
                title="Cài đặt"
                body="Phương tiện, đơn giá nhiên liệu, đồng bộ Google Drive, xuất Excel."
                hint="Giai đoạn P6–P7."
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <TabBar />
    </>
  )
}
