import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { DriveBackend } from '../../sync/backends/drive'
import { syncOnce } from '../../sync/engine'
import { getSyncState } from '../../sync/snapshot'
import { SyncAuthError, SyncConflictError, type SyncBackend } from '../../sync/types'
import type { MergeStats } from '../../sync/merge'
import './sync.css'

type Phase = 'idle' | 'connecting' | 'syncing'

interface Result {
  kind: 'ok' | 'error'
  text: string
  detail?: string | undefined
}

/** "3 nhận về · 1 gửi đi · 2 đã xoá", leaving out whatever was zero. */
function describe(stats: MergeStats): string {
  const parts: string[] = []
  if (stats.total.pulled) parts.push(`${stats.total.pulled} nhận về`)
  if (stats.total.pushed) parts.push(`${stats.total.pushed} gửi đi`)
  if (stats.total.deleted) parts.push(`${stats.total.deleted} đã xoá`)
  return parts.length ? parts.join(' · ') : 'Không có thay đổi nào'
}

const when = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—'

export function SyncPanel() {
  // One instance for the life of the panel: it caches the Drive file id, and rebuilding it
  // every render would throw that away and re-search on each sync.
  const backend = useMemo<SyncBackend>(() => new DriveBackend(), [])
  const state = useLiveQuery(() => getSyncState(), [])
  const account = useLiveQuery(() => backend.currentAccount(), [backend])

  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState<Result | null>(null)

  const configured = backend.isConfigured()
  const busy = phase !== 'idle'

  async function run(next: Phase, fn: () => Promise<void>) {
    setPhase(next)
    setResult(null)
    try {
      await fn()
    } catch (err: unknown) {
      setResult({ kind: 'error', ...explain(err) })
    } finally {
      setPhase('idle')
    }
  }

  const connect = () =>
    run('connecting', async () => {
      await backend.connect()
      setResult({ kind: 'ok', text: 'Đã kết nối. Bấm "Đồng bộ ngay" để tải dữ liệu lên.' })
    })

  const sync = () =>
    run('syncing', async () => {
      const outcome = await syncOnce(backend)
      setResult({
        kind: 'ok',
        text: outcome.status === 'up-to-date' ? 'Đã là bản mới nhất' : 'Đồng bộ xong',
        detail: describe(outcome.stats),
      })
    })

  const disconnect = () =>
    run('connecting', async () => {
      await backend.disconnect()
      setResult({ kind: 'ok', text: 'Đã ngắt kết nối. Dữ liệu trên Drive vẫn còn nguyên.' })
    })

  if (!configured) {
    return (
      <section className="panel">
        <h2 className="panel__title">Đồng bộ Google Drive</h2>
        <p className="panel__hint">
          Chưa bật. Bản dựng này không có <code>VITE_GOOGLE_CLIENT_ID</code> nên app không
          biết phải xin quyền qua OAuth client nào. Xem <code>docs/05-SYNC.md</code> để tạo
          client ID rồi dựng lại.
        </p>
      </section>
    )
  }

  return (
    <section className="panel">
      <h2 className="panel__title">Đồng bộ Google Drive</h2>

      <p className="panel__hint">
        Dữ liệu nằm trong thư mục ẩn riêng của app, trong Drive của chính bạn. Nó không
        hiện trong danh sách file và không chiếm dung lượng đáng kể.
      </p>

      {account ? (
        <>
          <dl className="sync__state">
            <div>
              <dt>Trạng thái</dt>
              <dd className="sync__ok">Đã kết nối</dd>
            </div>
            <div>
              <dt>Lần cuối</dt>
              <dd className="num">{when(state?.last_synced_at ?? null)}</dd>
            </div>
          </dl>

          <div className="sync__actions">
            <button type="button" className="btn btn--primary" onClick={sync} disabled={busy}>
              {phase === 'syncing' ? 'Đang đồng bộ…' : 'Đồng bộ ngay'}
            </button>
            <button type="button" className="btn" onClick={disconnect} disabled={busy}>
              Ngắt kết nối
            </button>
          </div>
        </>
      ) : (
        <div className="sync__actions">
          <button type="button" className="btn btn--primary" onClick={connect} disabled={busy}>
            {phase === 'connecting' ? 'Đang mở Google…' : 'Kết nối Google Drive'}
          </button>
        </div>
      )}

      {result && (
        <p className={`sync__result sync__result--${result.kind}`} role="status">
          <strong>{result.text}</strong>
          {result.detail ? <span className="sync__detail">{result.detail}</span> : null}
        </p>
      )}

      <p className="panel__hint sync__caveat">
        Đồng bộ chạy khi bạn bấm, không chạy nền: Google chỉ cấp token một giờ và không cấp
        refresh token cho app chạy hoàn toàn trong trình duyệt.
      </p>
    </section>
  )
}

/** Turns an exception into something a person can act on. */
function explain(err: unknown): { text: string; detail?: string | undefined } {
  if (err instanceof SyncAuthError) {
    return {
      text: 'Cần đăng nhập lại',
      detail: 'Phiên Google đã hết hạn hoặc bị thu hồi. Bấm "Kết nối Google Drive" lần nữa.',
    }
  }
  if (err instanceof SyncConflictError) {
    return {
      text: 'Thiết bị khác đang ghi cùng lúc',
      detail: 'Không mất gì cả — chờ vài giây rồi bấm đồng bộ lại.',
    }
  }
  if (!navigator.onLine) {
    return { text: 'Đang offline', detail: 'Dữ liệu vẫn nằm trên máy. Đồng bộ lại khi có mạng.' }
  }
  return { text: 'Đồng bộ thất bại', detail: err instanceof Error ? err.message : String(err) }
}
