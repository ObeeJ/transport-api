import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { StewardSubnav } from '@/components/StewardSubnav'
import { api, ApiError } from '@/lib/api'
import { fadeUp, stagger, transition } from '@/lib/motion'

type UploadResult = {
  rows: number
  imported: number
  skipped: number
  unknownEmails: string[]
  badRows: string[]
}

const UNSUPPORTED = new Set(['.pdf', '.doc', '.docx', '.xlsx', '.xls'])
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

export function StewardAttendance() {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [manualPseudo, setManualPseudo] = useState('')
  const [manualDate, setManualDate] = useState('')
  const [manualAttended, setManualAttended] = useState(true)
  const [manualReason, setManualReason] = useState('')
  const [manualSubmitting, setManualSubmitting] = useState(false)
  const [manualError, setManualError] = useState<string | null>(null)
  const [manualSuccess, setManualSuccess] = useState<string | null>(null)

  function pickFile(file: File) {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (UNSUPPORTED.has(ext)) {
      setError(`We only accept CSV. Open your ${ext.slice(1).toUpperCase()} in Google Sheets → File → Download → CSV.`)
      setFileName(null)
      return
    }
    setError(null)
    setFileName(file.name)
    // Assign to the hidden input so onSubmit can read it
    const dt = new DataTransfer()
    dt.items.add(file)
    if (fileRef.current) fileRef.current.files = dt.files
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) pickFile(file)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setResult(null)
    const f = fileRef.current?.files?.[0]
    if (!f) { setError('Pick a CSV file first.'); return }
    const fd = new FormData()
    fd.append('file', f)
    setSubmitting(true)
    try {
      const res = await fetch(`${API}/steward/attendance`, { method: 'POST', body: fd, credentials: 'include' })
      const data = await res.json()
      if (!res.ok) { setError(data.detail ?? data.error ?? 'Upload failed.'); return }
      setResult(data as UploadResult)
      setFileName(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  async function onManualSubmit(e: React.FormEvent) {
    e.preventDefault()
    setManualError(null)
    setManualSuccess(null)
    if (!manualPseudo.trim() || !manualDate || !manualReason.trim()) {
      setManualError('All fields are required.')
      return
    }
    setManualSubmitting(true)
    try {
      const res = await api.post<{ weekStart: string }>('/steward/attendance/manual', {
        pseudonymousId: manualPseudo.trim(),
        weekDate: manualDate,
        attended: manualAttended,
        reason: manualReason.trim(),
      })
      setManualSuccess(`Marked ${manualAttended ? 'attended' : 'absent'} for week of ${res.weekStart}.`)
      setManualPseudo(''); setManualDate(''); setManualReason('')
    } catch (err) {
      setManualError(
        err instanceof ApiError && err.code === 'recipient_not_found'
          ? 'No recipient found with that ID.'
          : err instanceof ApiError ? err.message : 'Override failed.'
      )
    } finally {
      setManualSubmitting(false)
    }
  }

  return (
    <motion.div variants={stagger(0.07, 0.03)} initial="hidden" animate="show" className="space-y-5">
      <StewardSubnav />

      {/* Header */}
      <motion.div variants={fadeUp} transition={transition.default}>
        <h1 className="text-[28px] font-medium tracking-tight text-[var(--color-indigo)]">Attendance</h1>
        <p className="mt-1 text-[12px] text-[var(--color-stone)]">
          Recipients are only eligible for payout if they attended class the previous full week.
        </p>
      </motion.div>

      {/* Upload section */}
      <motion.div variants={fadeUp} transition={transition.default} className="card-base overflow-hidden">
        {/* Section header */}
        <div className="px-5 pt-5 pb-4 border-b border-[var(--color-hairline)] flex items-center justify-between">
          <div>
            <div className="label-cap">CSV upload</div>
            <p className="mt-0.5 text-[12px] text-[var(--color-stone)]">From the school's official attendance register</p>
          </div>
          <span className="text-[10px] font-mono bg-[var(--color-cream-2)] text-[var(--color-stone)] px-2 py-1 rounded-full">
            .csv only
          </span>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={`relative flex flex-col items-center justify-center gap-2 rounded-[14px] border-2 border-dashed cursor-pointer transition-all duration-200 py-8 ${
              dragging
                ? 'border-[var(--color-indigo)] bg-[rgba(27,42,78,0.04)]'
                : fileName
                  ? 'border-[var(--color-moss)] bg-[rgba(94,114,89,0.04)]'
                  : 'border-[var(--color-hairline)] hover:border-[var(--color-stone-soft)] hover:bg-[var(--color-cream-2)]/30'
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f) }}
            />
            <AnimatePresence mode="wait">
              {fileName ? (
                <motion.div
                  key="file"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-1"
                >
                  <div className="size-10 rounded-full bg-[rgba(94,114,89,0.12)] flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M9 12l2 2 4-4" stroke="var(--color-moss)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M12 22C17.5 22 22 17.5 22 12S17.5 2 12 2 2 6.5 2 12s4.5 10 10 10z" stroke="var(--color-moss)" strokeWidth="1.8"/>
                    </svg>
                  </div>
                  <span className="text-[13px] font-medium text-[var(--color-moss)]">{fileName}</span>
                  <span className="text-[11px] text-[var(--color-stone)]">Click to change</span>
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-1.5"
                >
                  <div className="size-10 rounded-full bg-[var(--color-cream-2)] flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="var(--color-stone)" strokeWidth="1.8" strokeLinecap="round"/>
                      <path d="M17 8l-5-5-5 5M12 3v12" stroke="var(--color-stone)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <span className="text-[13px] font-medium text-[var(--color-ink)]">Drop CSV here or click to browse</span>
                  <span className="text-[11px] text-[var(--color-stone)]">PDF, DOCX, XLSX not supported</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-start gap-2.5 rounded-[12px] bg-[rgba(200,75,58,0.08)] border border-[rgba(200,75,58,0.2)] px-4 py-3"
              >
                <span className="text-[var(--color-coral)] text-[13px] shrink-0 mt-0.5">✕</span>
                <p className="text-[12px] text-[var(--color-coral)] leading-relaxed">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center justify-between">
            <button
              type="submit"
              disabled={submitting || !fileName}
              className="btn-primary h-10 px-5 text-sm disabled:opacity-40"
            >
              {submitting ? 'Uploading…' : 'Upload attendance'}
            </button>

            {/* CSV format hint */}
            <details className="text-right">
              <summary className="cursor-pointer text-[11px] text-[var(--color-stone)] hover:text-[var(--color-ink)] list-none select-none">
                View CSV format ↓
              </summary>
              <div className="mt-2 text-left rounded-[12px] bg-[var(--color-cream)] border border-[var(--color-hairline)] p-3 font-mono text-[11px] text-[var(--color-ink)]">
                email,date,attended<br />
                ayo@school.edu.ng,2026-05-19,1<br />
                ngozi@school.edu.ng,2026-05-19,0<br />
                femi@school.edu.ng,2026-05-19,yes
              </div>
              <p className="mt-1.5 text-[10px] text-[var(--color-stone)] text-left">
                Any day of the week — normalised to Monday. Truthy: <span className="font-mono">1, true, yes, y, attended, present</span>
              </p>
            </details>
          </div>
        </form>

        {/* Upload result */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
              className="overflow-hidden border-t border-[var(--color-hairline)]"
            >
              <div className="p-5">
                <div className="label-cap mb-3">Upload result</div>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: 'Rows', n: result.rows, color: 'var(--color-indigo)' },
                    { label: 'Imported', n: result.imported, color: 'var(--color-moss)' },
                    { label: 'Skipped', n: result.skipped, color: 'var(--color-stone)' },
                    { label: 'Unknown', n: result.unknownEmails.length, color: result.unknownEmails.length ? 'var(--color-coral)' : 'var(--color-stone)' },
                  ].map(({ label, n, color }) => (
                    <motion.div
                      key={label}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={transition.default}
                      className="card-base p-3 text-center"
                    >
                      <div className="text-[26px] font-semibold tracking-tight" style={{ color }}>{n}</div>
                      <div className="label-cap mt-0.5">{label}</div>
                    </motion.div>
                  ))}
                </div>

                {result.unknownEmails.length > 0 && (
                  <div className="mt-4">
                    <div className="label-cap mb-2">Unknown emails — skipped</div>
                    <div className="rounded-[12px] bg-[var(--color-cream)] border border-[var(--color-hairline)] p-3 font-mono text-[11px] max-h-36 overflow-y-auto space-y-0.5">
                      {result.unknownEmails.map(e => <div key={e} className="text-[var(--color-coral)]">{e}</div>)}
                    </div>
                  </div>
                )}

                {result.badRows.length > 0 && (
                  <div className="mt-3">
                    <div className="label-cap mb-2 text-[var(--color-coral)]">Bad rows</div>
                    <div className="rounded-[12px] bg-[var(--color-cream)] border border-[var(--color-hairline)] p-3 font-mono text-[11px] max-h-36 overflow-y-auto space-y-0.5">
                      {result.badRows.map((r, i) => <div key={i} className="text-[var(--color-stone)]">{r}</div>)}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Manual override */}
      <motion.div variants={fadeUp} transition={transition.default} className="card-base overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-[var(--color-hairline)]">
          <div className="label-cap">Manual override</div>
          <p className="mt-0.5 text-[12px] text-[var(--color-stone)]">
            For paper registers or rural submissions — uses the pseudonymous ID, never the real name.
          </p>
        </div>

        <form onSubmit={onManualSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="label-cap block">Recipient ID</label>
              <input
                value={manualPseudo}
                onChange={e => setManualPseudo(e.target.value)}
                placeholder="R-7421"
                className="w-full h-10 px-3 rounded-[10px] border border-[var(--color-hairline)] bg-[var(--color-paper)] text-sm font-mono outline-none focus:border-[var(--color-indigo)] transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="label-cap block">Any date in that week</label>
              <input
                type="date"
                value={manualDate}
                onChange={e => setManualDate(e.target.value)}
                className="w-full h-10 px-3 rounded-[10px] border border-[var(--color-hairline)] bg-[var(--color-paper)] text-sm outline-none focus:border-[var(--color-indigo)] transition-colors"
              />
            </div>
          </div>

          {/* Attended toggle */}
          <div className="space-y-1.5">
            <label className="label-cap block">Status</label>
            <div className="inline-flex rounded-[12px] border border-[var(--color-hairline)] bg-[var(--color-cream)] p-1 gap-1">
              {([true, false] as const).map(val => (
                <motion.button
                  key={String(val)}
                  type="button"
                  onClick={() => setManualAttended(val)}
                  whileTap={{ scale: 0.97 }}
                  className={`relative px-5 py-2 rounded-[9px] text-xs font-semibold transition-colors duration-150 ${
                    manualAttended === val ? 'text-white' : 'text-[var(--color-stone)] hover:text-[var(--color-ink)]'
                  }`}
                >
                  {manualAttended === val && (
                    <motion.div
                      layoutId="attendance-toggle"
                      className={`absolute inset-0 rounded-[9px] ${val ? 'bg-[var(--color-moss)]' : 'bg-[var(--color-coral)]'}`}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative">{val ? '✓ Attended' : '✕ Absent'}</span>
                </motion.button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="label-cap block">
              Reason <span className="text-[var(--color-coral)] normal-case font-normal">required</span>
            </label>
            <input
              value={manualReason}
              onChange={e => setManualReason(e.target.value)}
              placeholder="Paper register collected in person from coordinator"
              className="w-full h-10 px-3 rounded-[10px] border border-[var(--color-hairline)] bg-[var(--color-paper)] text-sm outline-none focus:border-[var(--color-indigo)] transition-colors"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={manualSubmitting}
              className="btn-primary h-10 px-5 text-sm disabled:opacity-40"
            >
              {manualSubmitting ? 'Saving…' : 'Save override'}
            </button>

            <AnimatePresence mode="wait">
              {manualError && (
                <motion.p
                  key="err"
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={transition.fast}
                  className="text-[12px] text-[var(--color-coral)]"
                  role="alert"
                >
                  {manualError}
                </motion.p>
              )}
              {manualSuccess && (
                <motion.p
                  key="ok"
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={transition.fast}
                  className="text-[12px] text-[var(--color-moss)] font-medium"
                >
                  ✓ {manualSuccess}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}
