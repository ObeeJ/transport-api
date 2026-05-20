import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { StewardSubnav } from '@/components/StewardSubnav'

type ImportResult = {
  rows: number
  verified: number
  skipped: number
  duplicates: number
  unknownEmails: string[]
  badRows: string[]
}

type Stats = { totalVerified: number }

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

export function StewardRoster() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const stats = useQuery<Stats>({
    queryKey: ['steward', 'roster', 'stats'],
    queryFn: () => api.get('/steward/roster/stats'),
  })

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setResult(null)
    const f = fileRef.current?.files?.[0]
    if (!f) {
      setError('Pick a CSV file first.')
      return
    }
    const fd = new FormData()
    fd.append('file', f)
    setSubmitting(true)
    try {
      const res = await fetch(`${API}/steward/roster/import`, {
        method: 'POST',
        body: fd,
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Upload failed.')
        return
      }
      setResult(data as ImportResult)
      qc.invalidateQueries({ queryKey: ['steward', 'roster', 'stats'] })
      if (fileRef.current) fileRef.current.value = ''
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <StewardSubnav />

      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-medium tracking-tight text-[var(--color-indigo)]">Roster</h1>
          <p className="mt-1 text-sm text-[var(--color-stone)]">
            Bulk pre-verify users by uploading the class roster. The student ID is hashed before storage — the raw number is never persisted.
          </p>
        </div>
        <div className="font-mono text-xs text-[var(--color-stone)]">
          {stats.data?.totalVerified ?? 0} verified
        </div>
      </div>

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
            {submitting ? 'Uploading…' : 'Import'}
          </button>
        </form>

        {error ? <p className="mt-3 text-[12px] text-[var(--color-coral)]" role="alert">{error}</p> : null}

        <details className="mt-4">
          <summary className="cursor-pointer text-[12px] text-[var(--color-stone)] hover:text-[var(--color-ink)]">
            CSV format
          </summary>
          <div className="mt-2 card-base p-3 font-mono text-[11px] bg-[var(--color-cream)] text-[var(--color-ink)]">
            email,studentId
            <br />
            ayo@school.edu.ng,20189345
            <br />
            ngozi@school.edu.ng,20191102
          </div>
          <p className="mt-2 text-[11px] text-[var(--color-stone)]">
            One row per student. The user must already have signed up with the matching email.
            Re-importing the same email is a no-op (idempotent). Hash collisions on a different
            user are reported as duplicates and skipped.
          </p>
        </details>
      </section>

      {result ? (
        <section className="mt-6 card-base p-5">
          <div className="label-cap">Last import</div>
          <div className="mt-3 grid grid-cols-4 gap-3 text-center">
            <Stat label="rows" n={result.rows} />
            <Stat label="verified" n={result.verified} tone="moss" />
            <Stat label="duplicates" n={result.duplicates} tone={result.duplicates ? 'clay' : 'stone'} />
            <Stat label="unknown" n={result.unknownEmails.length} tone={result.unknownEmails.length ? 'coral' : 'stone'} />
          </div>

          {result.unknownEmails.length > 0 ? (
            <div className="mt-4">
              <div className="label-cap mb-2">Unknown emails — these users haven't signed up yet</div>
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

function Stat({ label, n, tone = 'indigo' }: { label: string; n: number; tone?: 'indigo' | 'moss' | 'coral' | 'stone' | 'clay' }) {
  const c =
    tone === 'moss'
      ? 'text-[var(--color-moss)]'
      : tone === 'coral'
        ? 'text-[var(--color-coral)]'
        : tone === 'clay'
          ? 'text-[var(--color-clay)]'
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
