import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import './pwa-status.css'

/**
 * Two things the user cannot otherwise see: that the app is ready to work without a
 * network, and that a new version is waiting.
 *
 * The update is offered rather than applied. A silent swap is fine when every asset is
 * served with a long immutable cache, but GitHub Pages sends max-age=600 on everything,
 * so the document and its chunks can briefly disagree. A reload the user triggers makes
 * them agree.
 */
export function PwaStatus() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  // "Ready offline" is worth saying once; it should not linger.
  useEffect(() => {
    if (!offlineReady) return
    const t = setTimeout(() => setOfflineReady(false), 4000)
    return () => clearTimeout(t)
  }, [offlineReady, setOfflineReady])

  if (!online) {
    return (
      <div className="pwabar pwabar--offline" role="status">
        <span className="pwabar__dot" aria-hidden="true" />
        <span>Đang offline — vẫn ghi được, dữ liệu nằm trên máy bạn</span>
      </div>
    )
  }

  if (needRefresh) {
    return (
      <div className="pwabar pwabar--update" role="status">
        <span>Đã có bản mới</span>
        <button type="button" className="pwabar__btn" onClick={() => void updateServiceWorker(true)}>
          Tải lại
        </button>
        <button
          type="button"
          className="pwabar__close"
          aria-label="Để sau"
          onClick={() => setNeedRefresh(false)}
        >
          ✕
        </button>
      </div>
    )
  }

  if (offlineReady) {
    return (
      <div className="pwabar pwabar--ready" role="status">
        <span>Đã sẵn sàng dùng offline</span>
      </div>
    )
  }

  return null
}
