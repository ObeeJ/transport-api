import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import { api } from '@/lib/api'
import { StewardSubnav } from '@/components/StewardSubnav'
import { fadeUp, stagger, transition } from '@/lib/motion'

type AuditEntry = {
  id: string
  actor: string
  action: string
  subject: string
  metadata?: string | Record<string, unknown> | null
  createdAt: string
}

type AuditPage = { items: AuditEntry[]; nextCursor: string }

const PAGE_SIZE = 20

type ActionCategory = 'auth' | 'success' | 'financial' | 'failure' | 'manual' | 'default'

function categorise(action: string): ActionCategory {
  if (/login|logout|signup|password|email_verify/.test(action)) return 'auth'
  if (/approved|verified|settled|completed|boarded/.test(action)) return 'success'
  if (/failed|declined|cancelled|error|flag/.test(action)) return 'failure'
  if (/payout|deposit|transfer|wallet|bank/.test(action)) return 'financial'
  if (/manual|override|steward|decision/.test(action)) return 'manual'
  return 'default'
}

const CATEGORY_STYLES: Record<ActionCategory, { pill: string; dot: string; icon: string }> = {
  auth:      { pill: 'bg-[rgba(27,42,78,0.08)] text-[var(--color-indigo)]',    dot: 'bg-[var(--color-indigo)]',    icon: '🔐' },
  success:   { pill: 'bg-[rgba(94,114,89,0.12)] text-[var(--color-moss)]',     dot: 'bg-[var(--color-moss)]',      icon: '✓'  },
  failure:   { pill: 'bg-[rgba(200,75,58,0.10)] text-[var(--color-coral)]',    dot: 'bg-[var(--color-coral)]',     icon: '✕'  },
  financial: { pill: 'bg-[rgba(217,119,87,0.12)] text-[var(--color-clay)]',    dot: 'bg-[var(--color-clay)]',      icon: '₦'  },
  manual:    { pill: 'bg-[rgba(200,75,58,0.08)] text-[var(--color-coral)]',    dot: 'bg-[var(--color-coral)]',     icon: '✎'  },
  default:   { pill: 'bg-[rgba(139,134,128,0.08)] text-[var(--color-stone)]',  dot: 'bg-[var(--color-stone-soft)]', icon: '·' },
}

export function StewardAudit() {
  const [cursors, setCursors] = useState<string[]>([''])
  const [page, setPage] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)

  const q = useQuery<AuditPage>({
    queryKey: ['steward', 'audit', cursors[page]],
    queryFn: () => {
      const c = cursors[page]
      return api.get(`/steward/audit?limit=${PAGE_SIZE}${c ? `&cursor=${encodeURIComponent(c)}` : ''}`)
    },
    staleTime: 30_000,
  })

  const metrics = useMemo(() => {
    const items = q.data?.items ?? []
    const byCategory: Record<ActionCategory, number> = { auth: 0, success: 0, failure: 0, financial: 0, manual: 0, default: 0 }
    items.forEach(e => { byCategory[categorise(e.action)]++ })
    const uniqueActors = new Set(items.filter(e => e.actor !== 'system').map(e => e.actor)).size
    return { total: items.length, uniqueActors, byCategory }
  }, [q.data])

  function goNext() {
    const next = q.data?.nextCursor
    if (!next) return
    setCursors(prev => { const u = [...prev]; u[page + 1] = next; return u })
    setPage(p => p + 1)
    setExpanded(null)
  }

  function goPrev() {
    if (page === 0) return
    setPage(p => p - 1)
    setExpanded(null)
  }

  return (
    <motion.div variants={stagger(0.06, 0.02)} initial="hidden" animate="show" className="space-y-5">
      <StewardSubnav />

      {/* Header */}
      <motion.div variants={fadeUp} transition={transition.default}>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[28px] font-medium tracking-tight text-[var(--color-indigo)]">Audit log</h1>
            <p className="mt-1 text-[12px] text-[var(--color-stone)] leading-relaxed max-w-lg">
              Append-only. Database hooks block UPDATE and DELETE — even by an admin.
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-2 mt-1">
            <span className="text-[10px] font-mono text-[var(--color-stone)] bg-[var(--color-cream-2)] px-2 py-1 rounded-full">
              Page {page + 1}
            </span>
            {q.isFetching && (
              <span className="size-1.5 rounded-full bg-[var(--color-moss)] animate-pulse" />
            )}
          </div>
        </div>
      </motion.div>

      {/* Metrics strip */}
      <motion.div variants={fadeUp} transition={transition.default} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Total entries',
            value: metrics.total,
            sub: `${metrics.uniqueActors} unique actors`,
            color: 'var(--color-indigo)',
            bg: 'rgba(27,42,78,0.05)',
          },
          {
            label: 'Successful',
            value: metrics.byCategory.success,
            sub: 'approvals · completions',
            color: 'var(--color-moss)',
            bg: 'rgba(94,114,89,0.06)',
          },
          {
            label: 'Failures',
            value: metrics.byCategory.failure,
            sub: 'errors · declines',
            color: metrics.byCategory.failure > 0 ? 'var(--color-coral)' : 'var(--color-stone)',
            bg: metrics.byCategory.failure > 0 ? 'rgba(200,75,58,0.06)' : 'rgba(139,134,128,0.05)',
          },
          {
            label: 'Financial',
            value: metrics.byCategory.financial,
            sub: 'payouts · deposits',
            color: 'var(--color-clay)',
            bg: 'rgba(217,119,87,0.06)',
          },
        ].map(({ label, value, sub, color, bg }) => (
          <motion.div
            key={label}
            variants={fadeUp}
            transition={transition.default}
            className="card-base p-4 flex flex-col gap-1"
            style={{ background: bg }}
          >
            <span className="label-cap">{label}</span>
            <span className="text-[32px] font-semibold tracking-tight leading-none" style={{ color }}>
              {q.isLoading ? <span className="inline-block w-8 h-7 rounded bg-[var(--color-cream-2)] animate-pulse" /> : value}
            </span>
            <span className="text-[10px] text-[var(--color-stone)] truncate">{sub}</span>
          </motion.div>
        ))}
      </motion.div>

      {/* Feed */}
      <motion.div variants={fadeUp} transition={transition.default} className="space-y-2">
        {q.isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card-base p-4 flex items-center gap-4 animate-pulse">
                <div className="size-8 rounded-full bg-[var(--color-cream-2)] shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/3 rounded bg-[var(--color-cream-2)]" />
                  <div className="h-2.5 w-1/2 rounded bg-[var(--color-cream-2)]" />
                </div>
                <div className="h-3 w-16 rounded bg-[var(--color-cream-2)]" />
              </div>
            ))
          : q.data?.items.map((e, i) => {
              const cat = categorise(e.action)
              const style = CATEGORY_STYLES[cat]
              const meta = parseMeta(e.metadata)
              const hasMeta = meta !== null
              const isExpanded = expanded === e.id

              return (
                <motion.div
                  key={e.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...transition.fast, delay: i * 0.015 }}
                  className="card-base overflow-hidden"
                >
                  {/* Main row */}
                  <div
                    className={`flex items-center gap-3 px-4 py-3 ${hasMeta ? 'cursor-pointer' : ''}`}
                    onClick={() => hasMeta && setExpanded(isExpanded ? null : e.id)}
                  >
                    {/* Category dot */}
                    <div className={`size-2 rounded-full shrink-0 ${style.dot}`} />

                    {/* Action pill */}
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold font-mono shrink-0 ${style.pill}`}>
                      {e.action.replace(/_/g, ' ')}
                    </span>

                    {/* Actor + subject */}
                    <div className="flex-1 min-w-0 flex items-center gap-1.5 text-[11px] font-mono text-[var(--color-stone)]">
                      <span className={`truncate ${e.actor === 'system' ? 'italic' : ''}`}>
                        {e.actor === 'system' ? 'system' : shortenId(e.actor)}
                      </span>
                      {e.subject && e.subject !== e.actor && (
                        <>
                          <span className="text-[var(--color-stone-soft)]">→</span>
                          <span className="truncate text-[var(--color-ink)]">{shortenId(e.subject)}</span>
                        </>
                      )}
                    </div>

                    {/* Timestamp */}
                    <span className="shrink-0 text-[10px] font-mono text-[var(--color-stone-soft)]">
                      {new Date(e.createdAt).toLocaleString('en-NG', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>

                    {/* Expand chevron */}
                    {hasMeta && (
                      <motion.svg
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                        width="12" height="12" viewBox="0 0 12 12" fill="none"
                        className="shrink-0 text-[var(--color-stone-soft)]"
                      >
                        <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </motion.svg>
                    )}
                  </div>

                  {/* Expanded metadata */}
                  <AnimatePresence>
                    {isExpanded && hasMeta && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="mx-4 mb-3 rounded-[12px] bg-[var(--color-cream)] border border-[var(--color-hairline)] p-3">
                          <div className="label-cap mb-2">Metadata</div>
                          <pre className="font-mono text-[11px] text-[var(--color-ink)] whitespace-pre-wrap break-all leading-relaxed">
                            {JSON.stringify(meta, null, 2)}
                          </pre>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })}
      </motion.div>

      {/* Pagination */}
      {!q.isLoading && (
        <motion.div
          variants={fadeUp}
          transition={transition.default}
          className="flex items-center justify-between pt-1"
        >
          <span className="text-[11px] text-[var(--color-stone)] font-mono">
            {q.data?.items.length ?? 0} entries · page {page + 1}
          </span>
          <div className="flex gap-2">
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={goPrev}
              disabled={page === 0}
              className="btn-secondary h-9 px-4 text-xs disabled:opacity-30"
            >
              ← Previous
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={goNext}
              disabled={!q.data?.nextCursor}
              className="btn-secondary h-9 px-4 text-xs disabled:opacity-30"
            >
              Next →
            </motion.button>
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}

function shortenId(s: string): string {
  if (s === 'system') return s
  if (s.length > 13) return s.slice(0, 8) + '…' + s.slice(-4)
  return s
}

function parseMeta(meta: AuditEntry['metadata']): Record<string, unknown> | null {
  if (meta == null || meta === '') return null
  if (typeof meta === 'object') return meta as Record<string, unknown>
  try { return JSON.parse(meta) } catch { return null }
}
