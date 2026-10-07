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
/** How often a long-lived tab asks whether a newer build exists. Someone who leaves the
 *  app open for days should not be the last to receive a fix. */
const UPDATE_CHECK_MS = 60 * 60 * 1000

export function PwaStatus() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      setInterval(() => void registration.update(), UPDATE_CHECK_MS)
    },
  })

  /**
   * Apply the update instead of offering it.
   *
   * `autoUpdate` already makes the new worker skipWaiting, so this is belt and braces —
   * but the belt is exactly what was missing. Under the previous prompt-only strategy a
   * fix sat behind a bar the user never tapped, and three releases running never arrived.
   */
  useEffect(() => {
    if (needRefresh) void updateServiceWorker(true)
  }, [needRefresh, updateServiceWorker])

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

  // No "an update is waiting" bar any more: the effect above applies it. A bar the user
  // has to notice and tap is precisely what stopped three fixes from landing.

  if (offlineReady) {
    return (
      <div className="pwabar pwabar--ready" role="status">
        <span>Đã sẵn sàng dùng offline</span>
      </div>
    )
  }

  return null
}
