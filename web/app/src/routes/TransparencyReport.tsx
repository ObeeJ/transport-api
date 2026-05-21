import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { api } from '@/lib/api'
import { fadeUp, stagger, transition } from '@/lib/motion'

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
  uniqueCommuters: number
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

export function TransparencyReport() {
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const q = useQuery<Report>({
    queryKey: ['reports', 'monthly', month],
    queryFn: () => api.get<Report>(`/reports/monthly?month=${month}`),
    staleTime: 5 * 60 * 1000,
  })

  const r = q.data
  const monthName = r
    ? new Date(r.periodStart).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })
    : '…'

  return (
    <motion.div
      variants={stagger(0.07, 0.04)}
      initial="hidden"
      animate="show"
      className="space-y-4 max-w-lg"
    >
      {/* Header */}
      <motion.div variants={fadeUp} transition={transition.default}>
        <div className="label-cap mb-4">{monthName.toUpperCase()}</div>
        <h1 className="text-[36px] leading-[1] font-medium tracking-tight text-[var(--color-indigo)]">
          Open<br />books.
        </h1>
        <p className="mt-3 text-[12px] text-[var(--color-stone)] leading-relaxed">
          Every number here is a group total — no individual is identifiable. Groups smaller than 10 people are hidden to protect privacy.
        </p>
      </motion.div>

      {q.isLoading ? (
        <motion.p variants={fadeUp} className="text-sm text-[var(--color-stone)]">Loading report…</motion.p>
      ) : !r ? (
        <motion.p variants={fadeUp} className="text-sm text-[var(--color-coral)]">Could not load report.</motion.p>
      ) : (
        <>
          {/* Money */}
          <motion.div variants={fadeUp} transition={transition.default} className="card-base overflow-hidden">
            <div className="px-5 pt-4 pb-1">
              <div className="label-cap mb-4">Pool · this month</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[11px] text-[var(--color-stone)] uppercase tracking-wider">Raised</p>
                  <p className="mt-1 text-[28px] font-medium tracking-tight text-[var(--color-indigo)]">
                    {naira(r.totalRaisedKobo)}
                  </p>
                  <p className="text-[11px] text-[var(--color-stone)] mt-0.5">from {r.totalGivers} givers</p>
                </div>
                <div>
                  <p className="text-[11px] text-[var(--color-stone)] uppercase tracking-wider">Disbursed</p>
                  <p className="mt-1 text-[28px] font-medium tracking-tight text-[var(--color-moss)]">
                    {naira(r.totalDisbursedKobo)}
                  </p>
                  <p className="text-[11px] text-[var(--color-stone)] mt-0.5">to {r.activeRecipients} recipients</p>
                </div>
              </div>
            </div>
            <div className="mx-5 my-4 h-px bg-[var(--color-hairline)]" />
            {/* Progress bar */}
            <div className="px-5 pb-4">
              <div className="flex justify-between text-[10px] text-[var(--color-stone)] mb-1.5">
                <span>Disbursed</span>
                <span>
                  {r.totalRaisedKobo > 0
                    ? `${Math.round((r.totalDisbursedKobo / r.totalRaisedKobo) * 100)}%`
                    : '0%'}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-[var(--color-cream-2)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--color-moss)] transition-all duration-700"
                  style={{
                    width: r.totalRaisedKobo > 0
                      ? `${Math.min((r.totalDisbursedKobo / r.totalRaisedKobo) * 100, 100)}%`
                      : '0%',
                  }}
                />
              </div>
            </div>
          </motion.div>

          {/* Attendance */}
          <motion.div variants={fadeUp} transition={transition.default} className="card-base p-5">
            <div className="label-cap mb-2">Class attendance</div>
            {r.bucketSuppressed ? (
              <div className="flex items-start gap-3">
                <span className="text-[20px] shrink-0">🔒</span>
                <div>
                  <p className="text-[13px] font-medium text-[var(--color-indigo)]">Data hidden this period</p>
                  <p className="mt-1 text-[12px] text-[var(--color-stone)] leading-relaxed">
                    Fewer than 10 recipients were active this month. Showing attendance figures would make individuals identifiable, so this section is suppressed by design.
                  </p>
                </div>
              </div>
            ) : r.attendanceRate != null ? (
              <div className="flex items-baseline gap-3">
                <span className="text-[36px] font-medium tracking-tight text-[var(--color-moss)]">
                  {r.attendanceRate.toFixed(0)}%
                </span>
                <span className="text-[12px] text-[var(--color-stone)]">of recipients attended class this period</span>
              </div>
            ) : (
              <p className="text-[12px] text-[var(--color-stone)]">No attendance data for this period.</p>
            )}
          </motion.div>

          {/* Ride network */}
          <motion.div variants={fadeUp} transition={transition.default} className="card-base overflow-hidden">
            <div className="px-5 pt-4 pb-1">
              <div className="label-cap mb-4">Ride network</div>
              <div className="grid grid-cols-2 gap-4">
                <Stat label="Trips completed" value={String(r.tripsCompleted)} />
                <Stat label="Seats donated" value={String(r.seatsDonated)} />
                <Stat label="Drivers" value={String(r.uniqueDrivers)} tone="stone" />
                <Stat label="Commuters" value={String(r.uniqueCommuters)} tone="stone" />
              </div>
            </div>
            <div className="h-4" />
          </motion.div>

          {/* Footer */}
          <motion.p
            variants={fadeUp}
            transition={transition.slow}
            className="text-[11px] text-[var(--color-stone)] leading-relaxed pb-4"
          >
            Auto-generated from the platform's audit log on {new Date(r.generatedAt).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}. All figures are aggregated — no individual is identifiable.
          </motion.p>
        </>
      )}
    </motion.div>
  )
}

function Stat({ label, value, tone = 'indigo' }: { label: string; value: string; tone?: 'indigo' | 'moss' | 'stone' }) {
  const color = tone === 'moss' ? 'var(--color-moss)' : tone === 'stone' ? 'var(--color-stone)' : 'var(--color-indigo)'
  return (
    <div>
      <p className="text-[11px] text-[var(--color-stone)] uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-[24px] font-medium tracking-tight" style={{ color }}>{value}</p>
    </div>
  )
}
