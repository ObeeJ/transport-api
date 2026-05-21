import { useRef, useState } from 'react'
import { StewardSubnav } from '@/components/StewardSubnav'
import { api, ApiError } from '@/lib/api'

type UploadResult = {
  rows: number
  imported: number
  skipped: number
  unknownEmails: string[]
  badRows: string[]
}

const UNSUPPORTED_FORMATS = new Set(['.pdf', '.doc', '.docx', '.xlsx', '.xls'])

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

export function StewardAttendance() {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Manual override state
  const [manualPseudo, setManualPseudo] = useState('')
  const [manualDate, setManualDate] = useState('')
  const [manualAttended, setManualAttended] = useState(true)
  const [manualReason, setManualReason] = useState('')
  const [manualSubmitting, setManualSubmitting] = useState(false)
  const [manualError, setManualError] = useState<string | null>(null)
  const [manualSuccess, setManualSuccess] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setResult(null)
    const f = fileRef.current?.files?.[0]
    if (!f) { setError('Pick a CSV file first.'); return }

    const ext = '.' + f.name.split('.').pop()?.toLowerCase()
    if (UNSUPPORTED_FORMATS.has(ext)) {
      setError(`We only accept CSV files. Open your ${ext.slice(1).toUpperCase()} file in Google Sheets or Excel, then File → Download → CSV and re-upload.`)
      return
    }

    const fd = new FormData()
    fd.append('file', f)
    setSubmitting(true)
    try {
      const res = await fetch(`${API}/steward/attendance`, { method: 'POST', body: fd, credentials: 'include' })
      const data = await res.json()
      if (!res.ok) { setError(data.detail ?? data.error ?? 'Upload failed.'); return }
      setResult(data as UploadResult)
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
      if (err instanceof ApiError && err.code === 'recipient_not_found') {
        setManualError('No recipient found with that ID.')
      } else {
        setManualError(err instanceof ApiError ? err.message : 'Override failed.')
      }
    } finally {
      setManualSubmitting(false)
    }
  }

  return (
    <div>
      <StewardSubnav />

      <h1 className="text-3xl font-medium tracking-tight text-[var(--color-indigo)]">Attendance</h1>
      <p className="mt-1 text-sm text-[var(--color-stone)]">
        Upload a weekly roster. Recipients can only be paid out if they attended the previous full week.
      </p>

      <section className="mt-6 card-base p-5">
        <div className="label-cap">Upload CSV</div>
        <form onSubmit={onSubmit} className="mt-3 space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="block w-full text-sm file:mr-3 file:px-3 file:py-2 file:rounded-md file:border-0 file:bg-[var(--color-cream-2)] file:text-[var(--color-ink)] file:cursor-pointer cursor-pointer"
          />
          <button
            type="submit"
            disabled={submitting}
            className="h-11 px-4 rounded-[12px] bg-[var(--color-indigo)] text-[var(--color-paper)] text-sm font-medium"
          >
            {submitting ? 'Uploading…' : 'Upload'}
          </button>
        </form>

        {error ? <p className="mt-3 text-[12px] text-[var(--color-coral)]" role="alert">{error}</p> : null}

        <details className="mt-4">
          <summary className="cursor-pointer text-[12px] text-[var(--color-stone)] hover:text-[var(--color-ink)]">
            CSV format
          </summary>
          <div className="mt-2 card-base p-3 font-mono text-[11px] bg-[var(--color-cream)] text-[var(--color-ink)]">
            email,date,attended
            <br />
            ayo@school.edu.ng,2026-05-19,1
            <br />
            ngozi@school.edu.ng,2026-05-19,0
            <br />
            femi@school.edu.ng,2026-05-19,yes
          </div>
          <p className="mt-2 text-[11px] text-[var(--color-stone)]">
            Any day of the week works — we normalize to the Monday. Accepted truthy values:{' '}
            <span className="font-mono">1, true, yes, y, attended, present</span>. Re-uploading the same week overwrites prior rows.
          </p>
        </details>
      </section>

      {/* Manual override */}
      <section className="mt-6 card-base p-5">
        <div className="label-cap">Manual override</div>
        <p className="mt-1 text-[11px] text-[var(--color-stone)]">For paper registers or rural submissions. Uses the recipient's pseudonymous ID — not their name or email.</p>
        <form onSubmit={onManualSubmit} className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-cap mb-1 block">Recipient ID</label>
              <input
                value={manualPseudo}
                onChange={e => setManualPseudo(e.target.value)}
                placeholder="R-7421"
                className="w-full h-10 px-3 rounded-[10px] border border-[var(--color-hairline)] bg-[var(--color-paper)] text-sm outline-none focus:border-[var(--color-indigo)]"
              />
            </div>
            <div>
              <label className="label-cap mb-1 block">Any date in that week</label>
              <input
                type="date"
                value={manualDate}
                onChange={e => setManualDate(e.target.value)}
                className="w-full h-10 px-3 rounded-[10px] border border-[var(--color-hairline)] bg-[var(--color-paper)] text-sm outline-none focus:border-[var(--color-indigo)]"
              />
            </div>
          </div>
          <div className="card-base p-1 flex w-fit">
            {([true, false] as const).map(val => (
              <button
                key={String(val)}
                type="button"
                onClick={() => setManualAttended(val)}
                className={`px-4 py-1.5 rounded-[8px] text-xs font-medium transition-colors ${
                  manualAttended === val
                    ? val ? 'bg-[var(--color-moss)] text-white' : 'bg-[var(--color-coral)] text-white'
                    : 'text-[var(--color-stone)]'
                }`}
              >
                {val ? 'Attended' : 'Absent'}
              </button>
            ))}
          </div>
          <div>
            <label className="label-cap mb-1 block">Reason <span className="text-[var(--color-coral)]">(required)</span></label>
            <input
              value={manualReason}
              onChange={e => setManualReason(e.target.value)}
              placeholder="Paper register collected in person from coordinator"
              className="w-full h-10 px-3 rounded-[10px] border border-[var(--color-hairline)] bg-[var(--color-paper)] text-sm outline-none focus:border-[var(--color-indigo)]"
            />
          </div>
          <button
            type="submit"
            disabled={manualSubmitting}
            className="h-10 px-4 rounded-[12px] bg-[var(--color-indigo)] text-[var(--color-paper)] text-sm font-medium disabled:opacity-50"
          >
            {manualSubmitting ? 'Saving…' : 'Save override'}
          </button>
        </form>
        {manualError && <p className="mt-2 text-[12px] text-[var(--color-coral)]" role="alert">{manualError}</p>}
        {manualSuccess && <p className="mt-2 text-[12px] text-[var(--color-moss)]">{manualSuccess}</p>}
      </section>

      {result ? (
        <section className="mt-6 card-base p-5">
          <div className="label-cap">Last upload</div>
          <div className="mt-3 grid grid-cols-4 gap-3 text-center">
            <Stat label="rows" n={result.rows} />
            <Stat label="imported" n={result.imported} tone="moss" />
            <Stat label="skipped" n={result.skipped} tone="stone" />
            <Stat label="unknown" n={result.unknownEmails.length} tone={result.unknownEmails.length ? 'coral' : 'stone'} />
          </div>

          {result.unknownEmails.length > 0 ? (
            <div className="mt-4">
              <div className="label-cap mb-2">Unknown emails (skipped)</div>
              <div className="card-base p-3 bg-[var(--color-cream)] font-mono text-[11px] max-h-40 overflow-y-auto">
                {result.unknownEmails.map((e) => (
                  <div key={e}>{e}</div>
                ))}
              </div>
            </div>
          ) : null}

          {result.badRows.length > 0 ? (
            <div className="mt-4">
              <div className="label-cap mb-2 text-[var(--color-coral)]">Bad rows</div>
              <div className="card-base p-3 bg-[var(--color-cream)] font-mono text-[11px] max-h-40 overflow-y-auto">
                {result.badRows.map((r, i) => (
                  <div key={i}>{r}</div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}

function Stat({ label, n, tone = 'indigo' }: { label: string; n: number; tone?: 'indigo' | 'moss' | 'coral' | 'stone' }) {
  const c =
    tone === 'moss'
      ? 'text-[var(--color-moss)]'
      : tone === 'coral'
        ? 'text-[var(--color-coral)]'
        : tone === 'stone'
          ? 'text-[var(--color-stone)]'
          : 'text-[var(--color-indigo)]'
  return (
    <div>
      <div className={`text-2xl font-medium tracking-tight ${c}`}>{n}</div>
      <div className="text-[10px] text-[var(--color-stone)] uppercase tracking-wider">{label}</div>
    </div>
  )
}
