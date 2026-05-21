import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import { api } from '@/lib/api'
import { fadeUp, stagger, transition } from '@/lib/motion'

type Notification = {
  id: string
  channel: string
  event: string
  title: string
  body: string
  readAt?: string
  createdAt: string
}

// Tokens hidden behind a friendlier line so they never appear in the UI
// even when the server falls back to in-app delivery.
function sanitiseBody(body: string): string {
  if (/verification token is:/i.test(body)) {
    return 'Check your email for the verification link. If email is not configured, ask your administrator.'
  }
  return body
}

// Event taxonomy — keeps the icon/tone logic in one place and out of the
// render path. Order matters: more specific matches first.
type EventClass = 'sos' | 'payout' | 'approved' | 'declined' | 'email' | 'trip' | 'default'

function classify(event: string): EventClass {
  if (event.includes('sos')) return 'sos'
  if (event.includes('payout')) return 'payout'
  if (event.includes('approved')) return 'approved'
  if (event.includes('declined') || event.includes('rejected')) return 'declined'
  if (event.includes('verify') || event.includes('email')) return 'email'
  if (event.includes('trip') || event.includes('booking') || event.includes('ride')) return 'trip'
  return 'default'
}

const tones: Record<EventClass, { stroke: string; fill: string; chipBg: string }> = {
  sos: { stroke: 'var(--color-coral)', fill: 'var(--color-coral)', chipBg: 'rgba(200,75,58,0.10)' },
  payout: { stroke: 'var(--color-indigo)', fill: 'var(--color-clay)', chipBg: 'rgba(217,119,87,0.10)' },
  approved: { stroke: 'var(--color-moss)', fill: 'var(--color-moss)', chipBg: 'rgba(94,114,89,0.10)' },
  declined: { stroke: 'var(--color-coral)', fill: 'var(--color-coral)', chipBg: 'rgba(200,75,58,0.10)' },
  email: { stroke: 'var(--color-indigo)', fill: 'var(--color-clay)', chipBg: 'rgba(27,42,78,0.06)' },
  trip: { stroke: 'var(--color-indigo)', fill: 'var(--color-moss)', chipBg: 'rgba(94,114,89,0.08)' },
  default: { stroke: 'var(--color-stone)', fill: 'var(--color-stone-soft)', chipBg: 'rgba(0,0,0,0.04)' },
}

// Two-tone icons. Stroke carries the event tone; fill adds a soft accent.
// Same visual grammar as RoleShell so the inbox feels native to the app.
function EventIcon({ kind }: { kind: EventClass }) {
  const t = tones[kind]
  switch (kind) {
    case 'sos':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 3L4 7v6c0 5 3.6 9.1 8 10 4.4-.9 8-5 8-10V7l-8-4z"
            stroke={t.stroke} strokeWidth="1.8" strokeLinejoin="round" fill={t.chipBg}
          />
          <path d="M12 9v4" stroke={t.stroke} strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="16.5" r="1" fill={t.stroke} />
        </svg>
      )
    case 'payout':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="3" y="6" width="18" height="13" rx="2" stroke={t.stroke} strokeWidth="1.8" />
          <path d="M3 10h18" stroke={t.stroke} strokeWidth="1.5" />
          <circle cx="16" cy="14.5" r="1.8" fill={t.fill} />
          <path d="M7 14h4" stroke={t.stroke} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
    case 'approved':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="9" stroke={t.stroke} strokeWidth="1.8" fill={t.chipBg} />
          <path d="M8 12.5l2.5 2.5L16 9.5" stroke={t.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'declined':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="9" stroke={t.stroke} strokeWidth="1.8" fill={t.chipBg} />
          <path d="M9 9l6 6M15 9l-6 6" stroke={t.stroke} strokeWidth="2" strokeLinecap="round" />
        </svg>
      )
    case 'email':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="3" y="5" width="18" height="14" rx="2" stroke={t.stroke} strokeWidth="1.8" />
          <path d="M3 7l9 7 9-7" stroke={t.stroke} strokeWidth="1.6" strokeLinejoin="round" fill={t.chipBg} />
        </svg>
      )
    case 'trip':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M5 16l1.5-5a2 2 0 0 1 2-1.5h7a2 2 0 0 1 2 1.5L19 16" stroke={t.stroke} strokeWidth="1.8" strokeLinejoin="round" />
          <rect x="3" y="16" width="18" height="4" rx="1.5" stroke={t.stroke} strokeWidth="1.8" fill={t.chipBg} />
          <circle cx="7.5" cy="18" r="1.2" fill={t.stroke} />
          <circle cx="16.5" cy="18" r="1.2" fill={t.stroke} />
        </svg>
      )
    default:
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2H4.5L6 16z" stroke={t.stroke} strokeWidth="1.8" strokeLinejoin="round" fill={t.chipBg} />
          <path d="M10 20a2 2 0 0 0 4 0" stroke={t.stroke} strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )
  }
}

function eventLabel(kind: EventClass): string {
  switch (kind) {
    case 'sos': return 'Alert'
    case 'payout': return 'Payout'
    case 'approved': return 'Approved'
    case 'declined': return 'Decision'
    case 'email': return 'Email'
    case 'trip': return 'Trip'
    default: return 'Notice'
  }
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  const now = Date.now()
  const diffMin = Math.round((now - d.getTime()) / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffMin < 60 * 24) return `${Math.round(diffMin / 60)}h ago`
  return d.toLocaleString('en-NG', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

export function NotificationsPage() {
  const qc = useQueryClient()
  const q = useQuery<{ items: Notification[]; unreadCount: number }>({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications'),
    refetchInterval: 30_000,
  })

  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const markOne = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  // Which row is currently expanded for reading. One at a time keeps the
  // page calm and predictable.
  const [openId, setOpenId] = useState<string | null>(null)

  const items = q.data?.items ?? []
  const unread = q.data?.unreadCount ?? 0

  function onRowClick(n: Notification) {
    const isOpen = openId === n.id
    setOpenId(isOpen ? null : n.id)
    if (!n.readAt) markOne.mutate(n.id)
  }

  return (
    <motion.div
      variants={stagger(0.06, 0.03)}
      initial="hidden"
      animate="show"
      className="space-y-4"
    >
      <motion.div
        variants={fadeUp}
        transition={transition.default}
        className="flex items-center justify-between"
      >
        <div>
          <h2 className="text-[28px] font-medium tracking-tight text-[var(--color-indigo)] leading-tight">
            Inbox
          </h2>
          <p className="mt-0.5 text-[12px] text-[var(--color-stone)]">
            {unread > 0 ? `${unread} unread` : 'All caught up'}
          </p>
        </div>
        {unread > 0 && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending}
            className="h-8 px-3 rounded-[10px] border border-[var(--color-hairline)] text-xs font-medium text-[var(--color-stone)] hover:text-[var(--color-ink)] hover:bg-[var(--color-cream-2)] transition-colors"
          >
            Mark all read
          </motion.button>
        )}
      </motion.div>

      <motion.div variants={fadeUp} transition={transition.default}>
        {q.isLoading ? (
          <div className="card-base p-8 text-center">
            <p className="text-sm text-[var(--color-stone)]">Loading…</p>
          </div>
        ) : items.length === 0 ? (
          <div className="card-base p-10 text-center">
            <div className="inline-flex items-center justify-center size-10 rounded-full border border-[var(--color-hairline)] bg-[var(--color-cream)] mb-3">
              <EventIcon kind="default" />
            </div>
            <p className="text-sm font-medium text-[var(--color-indigo)]">Nothing here yet</p>
            <p className="mt-1 text-[12px] text-[var(--color-stone)]">
              Notifications about your applications, payouts, and trips will appear here.
            </p>
          </div>
        ) : (
          <div className="card-base overflow-hidden divide-y divide-[var(--color-hairline)]">
            <AnimatePresence initial={false}>
              {items.map((n, i) => {
                const kind = classify(n.event)
                const t = tones[kind]
                const isOpen = openId === n.id
                const isUnread = !n.readAt
                return (
                  <motion.div
                    key={n.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ ...transition.default, delay: i * 0.03 }}
                    className={isUnread ? 'bg-[var(--color-paper)]' : ''}
                  >
                    <button
                      type="button"
                      onClick={() => onRowClick(n)}
                      aria-expanded={isOpen}
                      className="w-full text-left px-4 py-4 flex items-start gap-3 transition-colors hover:bg-[var(--color-cream-2)]/30"
                    >
                      {/* Unread dot — fixed-width slot so titles stay aligned */}
                      <span className="mt-1.5 shrink-0 w-3 flex justify-center">
                        {isUnread && (
                          <span className="size-2 rounded-full bg-[var(--color-clay)]" />
                        )}
                      </span>

                      {/* Tinted icon chip */}
                      <span
                        className="shrink-0 mt-0.5 inline-flex items-center justify-center size-8 rounded-[10px]"
                        style={{ background: t.chipBg }}
                      >
                        <EventIcon kind={kind} />
                      </span>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div
                            className={`text-[13px] leading-snug truncate ${
                              isUnread ? 'font-semibold text-[var(--color-ink)]' : 'font-medium text-[var(--color-ink)]'
                            }`}
                          >
                            {n.title}
                          </div>
                          <span
                            className="shrink-0 font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                            style={{ background: t.chipBg, color: t.stroke }}
                          >
                            {eventLabel(kind)}
                          </span>
                        </div>

                        {/* Preview — collapsed = 1 line; expanded view below has full body */}
                        {!isOpen && (
                          <div className="mt-0.5 text-[12px] text-[var(--color-stone)] leading-relaxed truncate">
                            {sanitiseBody(n.body)}
                          </div>
                        )}

                        <div className="mt-1 font-mono text-[10px] text-[var(--color-stone-soft)] flex items-center gap-1.5">
                          <span>{formatWhen(n.createdAt)}</span>
                          <span aria-hidden>·</span>
                          <span className="lowercase">{isOpen ? 'tap to collapse' : 'tap to read'}</span>
                        </div>
                      </div>
                    </button>

                    {/* Expanded body */}
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          key="body"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 pl-[68px]">
                            <div className="card-base bg-[var(--color-cream)] px-4 py-3 text-[13px] leading-relaxed text-[var(--color-ink)] whitespace-pre-wrap">
                              {sanitiseBody(n.body)}
                            </div>
                            <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-[var(--color-stone)]">
                              <span>
                                {new Date(n.createdAt).toLocaleString('en-NG', {
                                  day: '2-digit', month: 'short', year: 'numeric',
                                  hour: '2-digit', minute: '2-digit',
                                })}
                              </span>
                              <span className="uppercase tracking-wider">{n.channel}</span>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
