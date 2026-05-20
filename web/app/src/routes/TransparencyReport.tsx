import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

type Report = {
  periodStart: string
  periodEnd: string
  generatedAt: string
  totalRaisedKobo: number
  totalGivers: number
  totalDisbursedKobo: number
  activeRecipients: number
  tripsCompleted: number
  seatsDonated: number
  uniqueDrivers: number
  uniqueRiders: number
  attendanceRate?: number
  retentionNote?: string
  bucketSuppressed: boolean
}

function naira(kobo: number): string {
  const n = Math.round(kobo / 100)
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(2)}m`
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(0)}k`
  return `₦${n.toLocaleString('en-NG')}`
}

function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })
}

export function TransparencyReport() {
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const q = useQuery<Report>({
    queryKey: ['reports', 'monthly', month],
    queryFn: () => api.get<Report>(`/reports/monthly?month=${month}`),
    staleTime: 5 * 60 * 1000,
  })

  const r = q.data

  return (
    <div className="pt-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-[var(--color-stone)]">
          REPORT · {r ? monthLabel(r.periodStart).toUpperCase() : '…'}
        </span>
        {r && (
          <span className="font-mono text-[10px] text-[var(--color-stone)]">
            {new Date(r.generatedAt).toLocaleDateString('en-NG', { day: '2-digit', month: 'short' })}
          </span>
        )}
      </div>

      <h1 className="mt-6 text-[40px] leading-[0.95] font-medium tracking-tight text-[var(--color-indigo)]">
        {r ? new Date(r.periodStart).toLocaleDateString('en-NG', { month: 'long' }) : '…'},
        <br />
        in the open.
      </h1>
      <p className="mt-3 text-[12px] text-[var(--color-stone)]">
        Every figure below is aggregate. Buckets smaller than ten people are omitted by design.
      </p>

      {q.isLoading ? (
        <p className="mt-8 text-sm text-[var(--color-stone)]">Loading report…</p>
      ) : !r ? (
        <p className="mt-8 text-sm text-[var(--color-coral)]">Could not load report.</p>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-3 gap-2">
            <Big label="In" value={naira(r.totalRaisedKobo)} />
            <Big label="Out" value={naira(r.totalDisbursedKobo)} tone="moss" />
            <Big label="Givers" value={String(r.totalGivers)} tone="stone" />
          </div>

          {/* Attendance / retention */}
          {r.bucketSuppressed ? (
            <div className="mt-3 card-base p-4">
              <div className="label-cap">Attendance</div>
              <p className="mt-2 text-[12px] text-[var(--color-stone)]">{r.retentionNote}</p>
            </div>
          ) : r.attendanceRate != null ? (
            <section
              className="mt-3 card-base p-4 bg-gradient-to-b from-[var(--color-paper)] to-[#EEF3EC]"
              style={{ borderColor: 'var(--color-moss-soft)' }}
            >
              <div className="label-cap" style={{ color: 'var(--color-moss)' }}>
                Recipient cohort attendance
              </div>
              <div className="mt-1.5 flex items-baseline gap-3">
                <span className="text-[32px] font-medium tracking-tight text-[var(--color-moss)]">
                  {r.attendanceRate.toFixed(0)}%
                </span>
                <span className="text-[11px] text-[var(--color-stone)]">this period</span>
              </div>
            </section>
          ) : null}

          {/* Ride rail */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Big label="Trips" value={String(r.tripsCompleted)} />
            <Big label="Seats donated" value={String(r.seatsDonated)} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Big label="Drivers" value={String(r.uniqueDrivers)} tone="stone" />
            <Big label="Riders" value={String(r.uniqueRiders)} tone="stone" />
          </div>

          {/* Recipients */}
          <div className="mt-3">
            <div className="label-cap mb-2">Active recipients this period</div>
            <div className="card-base p-4">
              <span className="text-[32px] font-medium tracking-tight text-[var(--color-indigo)]">
                {r.activeRecipients}
              </span>
            </div>
          </div>

          <div className="my-4 h-px bg-[var(--color-hairline)]" />
          <p className="text-[11px] text-[var(--color-stone)] leading-relaxed">
            This report is auto-generated from the platform's audit log. All figures are aggregated — no individual is identifiable.
          </p>
        </>
      )}
    </div>
  )
}

function Big({ label, value, tone = 'indigo' }: { label: string; value: string; tone?: 'indigo' | 'moss' | 'stone' }) {
  const c =
    tone === 'moss'
      ? 'text-[var(--color-moss)]'
      : tone === 'stone'
        ? 'text-[var(--color-stone)]'
        : 'text-[var(--color-indigo)]'
  return (
    <div className="card-base p-3">
      <div className="label-cap mb-1">{label}</div>
      <div className={`text-[22px] font-medium tracking-tight ${c}`}>{value}</div>
    </div>
  )
}
