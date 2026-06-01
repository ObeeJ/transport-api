import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { motion, AnimatePresence } from 'motion/react'
import { api } from '@/lib/api'
import { StewardSubnav } from '@/components/StewardSubnav'
import { fadeUp, stagger, transition } from '@/lib/motion'
import { useAuth } from '@/lib/auth'

type Recipient = {
  id: string
  pseudonymousId: string
  status: 'pending' | 'approved' | 'declined'
  disbursementMethod: 'wallet' | 'bank'
  intakeWeeklyCostKobo: number
  createdAt: string
}

// Fallback axes used while /steward/workload is loading. The API returns
// the same shape: queue labels × day labels × intensity matrix.
const fallbackWorkloadMatrix: number[][] = []

export function StewardQueue() {
  const { user } = useAuth()
  const [activeCell, setActiveCell] = useState<{ queue: string; day: string; val: number } | null>(null)
  const [selectedCell, setSelectedCell] = useState<{ queue: string; day: string; val: number } | null>(null)
  const active = activeCell || selectedCell

  const q = useQuery<{ items: Recipient[] }>({
    queryKey: ['steward', 'queue'],
    queryFn: () => api.get('/steward/queue'),
    refetchInterval: 10_000,
  })

  const workload = useQuery<{ queues: string[]; days: string[]; matrix: number[][] }>({
    queryKey: ['steward', 'workload'],
    queryFn: () => api.get('/steward/workload'),
    enabled: !!user,
    staleTime: 60 * 1000,
  })
  const queueNames = workload.data?.queues ?? []
  const days = workload.data?.days ?? []
  const workloadMatrix = workload.data?.matrix ?? fallbackWorkloadMatrix

  return (
    <motion.div
      variants={stagger(0.07, 0.02)}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      <StewardSubnav />

      {/* Steward personalized greeting */}
      <motion.p
        variants={fadeUp}
        transition={transition.fast}
        className="text-[13px] text-[var(--color-stone)] bg-white/40 px-4 py-2.5 rounded-xl border border-[var(--color-hairline)]"
      >
        Welcome back, steward{user?.email ? ` ${user.email.split('@')[0]}` : ''}. You are active in <span className="text-[var(--color-coral)] font-semibold uppercase text-xs tracking-wider">Steward Core</span>
      </motion.p>

      {/* Overview header */}
      <motion.div variants={fadeUp} transition={transition.default} className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-medium tracking-tight text-[var(--color-indigo)]">Review queue</h1>
          <p className="mt-1 text-sm text-[var(--color-stone)]">
            Pending applicant verifications. Two distinct steward signatures are required to finalize status.
          </p>
        </div>
        <span className="font-mono text-xs text-[var(--color-coral)] bg-[var(--color-coral)]/10 px-2.5 py-1 rounded-full font-bold">
          {q.data?.items.length ?? 0} active claims
        </span>
      </motion.div>

      {/* Workload Density Map */}
      <motion.section
        variants={fadeUp}
        className="card-base p-5 border border-[var(--color-hairline)] glow-coral"
      >
        <div className="flex items-center justify-between">
          <div>
            <span className="label-cap text-[var(--color-coral)] font-bold">Steward Queue Load & Backlog</span>
            <p className="text-[11px] text-[var(--color-stone)]">Operational density representing wait times across queues</p>
          </div>
          <span className="text-[10px] bg-[var(--color-coral)]/10 text-[var(--color-coral)] px-2 py-0.5 rounded font-mono font-bold tracking-wider">Telemetry</span>
        </div>

        {workload.isLoading ? (
          <div className="mt-4 grid grid-cols-6 gap-1.5">
            {Array.from({ length: 24 }).map((_, i) => (
              <div key={i} className="h-[72px] rounded-lg bg-[var(--color-cream-2)] animate-pulse" />
            ))}
          </div>
        ) : queueNames.length === 0 ? (
          <div className="mt-4 py-6 text-center">
            <p className="text-[13px] font-medium text-[var(--color-indigo)]">No workload data yet</p>
            <p className="mt-1 text-[11px] text-[var(--color-stone)]">This map fills once queue activity is recorded.</p>
          </div>
        ) : (
          <>
            <div className="mt-4 space-y-3">
              {/* X axis (Days) */}
              <div className="grid grid-cols-[100px_1fr] gap-3 text-[9px] font-mono text-[var(--color-stone)] text-center">
                <div className="text-left font-sans font-semibold pl-1.5">Queue Area</div>
                <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
                  {days.map((d, idx) => (
                    <div
                      key={idx}
                      className={`transition-all duration-150 py-0.5 rounded ${
                        active?.day === d ? 'text-[var(--color-coral)] font-bold bg-[var(--color-coral)]/5 scale-105' : ''
                      }`}
                    >
                      {d}
                    </div>
                  ))}
                </div>
              </div>

              {/* Queue Rows */}
              <div className="space-y-2">
                {queueNames.map((qName, qIdx) => (
                  <div key={qIdx} className="grid grid-cols-[100px_1fr] gap-3 items-center">
                    <span
                      className={`text-[10px] font-medium transition-all duration-150 py-1 rounded truncate text-left ${
                        active && active.queue === qName
                          ? 'text-[var(--color-coral)] font-bold bg-[var(--color-coral)]/5 pl-1.5'
                          : 'text-[var(--color-indigo)] pl-1'
                      }`}
                    >
                      {qName}
                    </span>
                    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
                      {workloadMatrix[qIdx].map((val, cellIdx) => {
                        const isHovered = activeCell && activeCell.queue === qName && activeCell.day === days[cellIdx];
                        const isSelected = selectedCell && selectedCell.queue === qName && selectedCell.day === days[cellIdx];
                        const isActive = isHovered || isSelected;
                        return (
                          <motion.div
                            key={cellIdx}
                            whileHover={{ scale: 1.04, translateY: -2 }}
                            onClick={() => {
                              if (isSelected) setSelectedCell(null)
                              else setSelectedCell({ queue: qName, day: days[cellIdx], val })
                            }}
                            onMouseEnter={() => setActiveCell({ queue: qName, day: days[cellIdx], val })}
                            onMouseLeave={() => setActiveCell(null)}
                            className={`h-[72px] flex flex-col justify-between items-center py-2 rounded-lg cursor-pointer border select-none transition-all duration-200 ${
                              isActive
                                ? 'border-[var(--color-coral)] ring-2 ring-[var(--color-coral)] ring-offset-1 bg-white shadow-md z-10'
                                : 'border-[var(--color-hairline)] bg-[var(--color-paper)]/60 hover:bg-white/90 hover:border-[var(--color-stone-soft)] shadow-sm'
                            } ${isSelected ? 'animate-pulse' : ''}`}
                          >
                            <span className="text-[8px] font-mono text-[var(--color-stone-soft)] leading-none">{days[cellIdx]}</span>
                            <div className="w-1.5 h-6 bg-[var(--color-cream-2)]/60 rounded-full overflow-hidden relative">
                              <div
                                className={`absolute bottom-0 left-0 w-full rounded-full transition-all duration-300 heat-steward-${val}`}
                                style={{ height: `${Math.max(val * 25, 8)}%` }}
                              />
                            </div>
                            <span className="text-[9px] font-mono font-bold text-[var(--color-indigo)] leading-none">
                              {val === 0 ? 'Clear' : `+${val * 3}`}
                            </span>
                          </motion.div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="mt-4 flex items-center justify-between text-[9px] text-[var(--color-stone)] font-mono">
              <span>Cleared</span>
              <div className="flex gap-1.5">
                {[0,1,2,3,4].map(v => <span key={v} className={`size-2.5 rounded-[2px] heat-steward-${v} ${v === 0 ? 'border border-[var(--color-hairline)]' : ''}`} />)}
              </div>
              <span>Heavy workload</span>
            </div>

            {/* Dynamic Telemetry Panel */}
            <div className="card-base p-3.5 mt-4 border border-[var(--color-hairline)] bg-[var(--color-paper)]/50 relative overflow-hidden">
              <AnimatePresence mode="wait">
                {active ? (
                  <motion.div
                    key={`${active.queue}-${active.day}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 heat-steward-${active.val} ${active.val === 4 ? 'animate-pulse ring-2 ring-[var(--color-coral)]/30' : ''}`} />
                      <div>
                        <span className="text-xs font-semibold text-[var(--color-indigo)]">{active.queue} on {active.day}</span>
                        <p className="text-[10px] text-[var(--color-stone)]">
                          {active.val === 0 && 'Queue fully cleared. No backlog, average wait time 0 mins.'}
                          {active.val === 1 && 'Light backlog. Minor pending reviews, average wait time < 5 mins.'}
                          {active.val === 2 && 'Moderate workload. Backlog starting to compile, average wait time ~15 mins.'}
                          {active.val === 3 && 'Heavy workload queue. Backlog growing, average wait time ~30 mins.'}
                          {active.val === 4 && 'Critical backlog! Extreme bottleneck detected, average wait time > 1 hr.'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-mono tracking-wider text-[var(--color-stone)] block">Backlog Load</span>
                        <span className="text-xs font-bold text-[var(--color-coral)] font-mono">{active.val === 0 ? 'Clear queue' : `+${active.val * 3} claims`}</span>
                      </div>
                      {selectedCell && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedCell(null) }}
                          className="text-[10px] text-[var(--color-stone)] hover:text-[var(--color-coral)] font-mono px-2 py-1 rounded bg-[var(--color-cream-2)] border border-[var(--color-hairline)] hover:border-[var(--color-stone-soft)] transition-colors cursor-pointer"
                        >
                          clear ×
                        </button>
                      )}
                    </div>
                  </motion.div>
                ) : (
                  <div className="h-10 flex items-center justify-center">
                    <span className="text-[10px] uppercase text-[var(--color-stone)] tracking-wider">Hover or tap pillars to identify operational backlogs</span>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}
      </motion.section>

      {/* Main queue table */}
      <motion.div variants={fadeUp} transition={transition.default} className="card-base overflow-hidden border border-[var(--color-hairline)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-cream)] border-b border-[var(--color-hairline)] text-left text-[10px] uppercase tracking-wider text-[var(--color-stone)]">
            <tr>
              <th className="px-5 py-3.5 font-bold">Pseudonym Code</th>
              <th className="px-5 py-3.5 font-bold">Disbursement</th>
              <th className="px-5 py-3.5 font-bold text-right">Weekly Allocation</th>
              <th className="px-5 py-3.5 font-bold">Submission date</th>
              <th className="px-5 py-3.5 font-bold"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-hairline)]">
            {q.isLoading ? (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-[var(--color-stone)] font-medium">
                  Gathering current queue records…
                </td>
              </tr>
            ) : (q.data?.items ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-14 text-center text-[var(--color-stone)] leading-relaxed">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[var(--color-moss-soft)]">
                      <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span className="font-semibold text-[var(--color-indigo)]">All caught up!</span>
                    <span className="text-xs text-[var(--color-stone)]">No applicant claims are waiting for your review.</span>
                  </div>
                </td>
              </tr>
            ) : (
              q.data?.items.map((r, i) => (
                <motion.tr
                  key={r.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...transition.default, delay: 0.1 + i * 0.05 }}
                  className="hover:bg-[var(--color-cream-2)]/20 transition-colors duration-150"
                >
                  <td className="px-5 py-4 font-mono font-bold text-[var(--color-indigo)] text-[13px]">{r.pseudonymousId}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1.5">
                      <span className={`size-1.5 rounded-full ${r.disbursementMethod === 'wallet' ? 'bg-[var(--color-moss)]' : 'bg-[var(--color-clay)]'}`} />
                      <span className="text-[var(--color-stone)] uppercase text-[10px] font-bold tracking-wider">{r.disbursementMethod}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right font-mono font-bold text-[var(--color-indigo)]">
                    ₦{(r.intakeWeeklyCostKobo / 100).toLocaleString('en-NG')}
                  </td>
                  <td className="px-5 py-4 text-[var(--color-stone)] text-xs font-medium">
                    {new Date(r.createdAt).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      to={`/steward/applications/${r.id}`}
                      className="btn-secondary h-8 px-4 text-xs inline-flex items-center gap-1.5 font-bold text-[var(--color-indigo)] shadow-sm hover:shadow transition-all duration-200"
                    >
                      <span>Review</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M5 12H19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M12 5L19 12L12 19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </Link>
                  </td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </motion.div>
    </motion.div>
  )
}
