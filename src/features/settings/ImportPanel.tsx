import { useRef, useState } from 'react'
import { runImport, validateImport, type ImportIssue, type ImportReport } from '../../import/importFile'

type Stage =
  | { step: 'idle' }
  | { step: 'checked'; raw: unknown; fileName: string; issues: ImportIssue[]; counts: Record<string, number> }
  | { step: 'done'; report: ImportReport }

export function ImportPanel() {
  const [stage, setStage] = useState<Stage>({ step: 'idle' })
  const [mode, setMode] = useState<'replace' | 'merge'>('replace')
  const [withSuggestions, setWithSuggestions] = useState(true)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    let raw: unknown
    try {
      raw = JSON.parse(await file.text())
    } catch {
      setStage({
        step: 'checked',
        raw: null,
        fileName: file.name,
        issues: [{ severity: 'error', ref: file.name, message: 'File không phải JSON hợp lệ.' }],
        counts: {},
      })
      return
    }
    const { file: parsed, issues } = validateImport(raw)
    setStage({
      step: 'checked',
      raw,
      fileName: file.name,
      issues,
      counts: parsed
        ? {
            'phương tiện': parsed.vehicles.length,
            'nhiên liệu': parsed.fuel_entries.length,
            'bảo dưỡng': parsed.services.length,
            'chi phí khác': parsed.expenses.length,
            'nhắc nhở đề xuất': parsed.suggested_reminders.length,
          }
        : {},
    })
  }

  async function confirm() {
    if (stage.step !== 'checked') return
    setBusy(true)
    try {
      const report = await runImport(stage.raw, { mode, includeSuggestions: withSuggestions })
      setStage({ step: 'done', report })
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const errors = stage.step === 'checked' ? stage.issues.filter((i) => i.severity === 'error') : []
  const warnings = stage.step === 'checked' ? stage.issues.filter((i) => i.severity === 'warning') : []

  return (
    <div className="panel">
      <h2 className="panel__title">Nhập dữ liệu</h2>
      <p className="panel__hint">
        Chọn file <code>.json</code> định dạng <code>vehicle-management/import</code>.
        File sẽ được kiểm tra trước, bạn xem kết quả rồi mới xác nhận.
      </p>

      <input
        ref={fileRef}
        className="input"
        type="file"
        accept="application/json,.json"
        onChange={(e) => void pick(e)}
      />

      {stage.step === 'checked' && (
        <div className="report">
          <p className="report__file num">{stage.fileName}</p>

          {Object.keys(stage.counts).length > 0 && (
            <ul className="report__counts">
              {Object.entries(stage.counts).map(([k, v]) => (
                <li key={k}>
                  <strong className="num">{v}</strong> {k}
                </li>
              ))}
            </ul>
          )}

          {errors.length > 0 && (
            <IssueList title={`${errors.length} lỗi — không nhập được`} issues={errors} tone="error" />
          )}
          {warnings.length > 0 && (
            <IssueList title={`${warnings.length} cảnh báo — vẫn nhập được`} issues={warnings} tone="warn" />
          )}
          {errors.length === 0 && warnings.length === 0 && (
            <p className="report__ok">Kiểm tra xong, không có vấn đề nào.</p>
          )}

          {errors.length === 0 && (
            <>
              <fieldset className="report__opts">
                <legend className="field__label">Cách nhập</legend>
                <label className="check">
                  <input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} />
                  <span>Thay thế — xoá sạch dữ liệu hiện có rồi nhập</span>
                </label>
                <label className="check">
                  <input type="radio" checked={mode === 'merge'} onChange={() => setMode('merge')} />
                  <span>Gộp — giữ dữ liệu cũ, ghi đè bản ghi trùng id</span>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={withSuggestions}
                    onChange={(e) => setWithSuggestions(e.target.checked)}
                  />
                  <span>Nhận cả nhắc nhở đề xuất (không phải dữ liệu gốc của bạn)</span>
                </label>
              </fieldset>
              <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void confirm()}>
                {busy ? 'Đang nhập…' : 'Nhập dữ liệu'}
              </button>
            </>
          )}
        </div>
      )}

      {stage.step === 'done' && <Result report={stage.report} onReset={() => setStage({ step: 'idle' })} />}
    </div>
  )
}

function IssueList({ title, issues, tone }: { title: string; issues: ImportIssue[]; tone: 'error' | 'warn' }) {
  return (
    <div className={`issues issues--${tone}`}>
      <p className="issues__title">{title}</p>
      <ul>
        {issues.slice(0, 20).map((i, n) => (
          <li key={n}>
            <code>{i.ref}</code> — {i.message}
          </li>
        ))}
      </ul>
      {issues.length > 20 && <p className="issues__more">…và {issues.length - 20} mục nữa</p>}
    </div>
  )
}

function Result({ report, onReset }: { report: ImportReport; onReset: () => void }) {
  return (
    <div className="report">
      <p className="report__ok">
        Đã nhập {report.counts.vehicles} phương tiện, {report.counts.fuel} bản ghi nhiên liệu,{' '}
        {report.counts.services} bản ghi bảo dưỡng.
      </p>
      {report.dataQuality.length > 0 && (
        <div className="issues issues--warn">
          <p className="issues__title">
            {report.dataQuality.length} ghi chú chất lượng dữ liệu kèm theo file
          </p>
          <ul>
            {report.dataQuality.map((q, n) => (
              <li key={n}>
                <strong>{String(q.severity ?? '').toUpperCase()}</strong> — {String(q.issue ?? '')}
                {q.action ? <> · <em>{String(q.action)}</em></> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      <button type="button" className="btn btn--ghost" onClick={onReset}>
        Xong
      </button>
    </div>
  )
}
