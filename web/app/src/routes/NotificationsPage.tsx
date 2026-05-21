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

function sanitiseBody(body: string): string {
  // Never show raw tokens in the UI — if email is unconfigured the server
  // falls back to sending the token as a notification body.
  if (/verification token is:/i.test(body)) {
    return 'Check your email for the verification link. If email is not configured, ask your administrator.'
  }
  return body
}

function eventIcon(event: string): string {
  if (event.includes('sos')) return '🚨'
  if (event.includes('payout')) return '💸'
  if (event.includes('approved')) return '✅'
  if (event.includes('declined')) return '❌'
  if (event.includes('verify') || event.includes('email')) return '✉️'
  if (event.includes('trip')) return '🚗'
  return '🔔'
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

  const items = q.data?.items ?? []
  const unread = q.data?.unreadCount ?? 0

  return (
    <motion.div
      variants={stagger(0.06, 0.03)}
      initial="hidden"
      animate="show"
      className="space-y-4 max-w-lg"
    >
      {/* Header */}
      <motion.div variants={fadeUp} transition={transition.default} className="flex items-center justify-between">
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

      {/* List */}
      <motion.div variants={fadeUp} transition={transition.default}>
        {q.isLoading ? (
          <div className="card-base p-8 text-center">
            <p className="text-sm text-[var(--color-stone)]">Loading…</p>
          </div>
        ) : items.length === 0 ? (
          <div className="card-base p-10 text-center">
            <p className="text-[32px] mb-3">🔔</p>
            <p className="text-sm font-medium text-[var(--color-indigo)]">Nothing here yet</p>
            <p className="mt-1 text-[12px] text-[var(--color-stone)]">
              Notifications about your applications, payouts, and trips will appear here.
            </p>
          </div>
        ) : (
          <div className="card-base overflow-hidden divide-y divide-[var(--color-hairline)]">
            <AnimatePresence>
              {items.map((n, i) => (
                <motion.button
                  key={n.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...transition.default, delay: i * 0.03 }}
                  onClick={() => !n.readAt && markOne.mutate(n.id)}
                  className={`w-full text-left px-4 py-4 flex items-start gap-3 transition-colors ${
                    !n.readAt ? 'bg-[var(--color-paper)] hover:bg-[var(--color-cream-2)]/30' : 'hover:bg-[var(--color-cream-2)]/20'
                  }`}
                >
                  {/* Unread dot */}
                  <span className="mt-1 shrink-0 w-5 flex justify-center">
                    {!n.readAt && (
                      <span className="size-2 rounded-full bg-[var(--color-clay)]" />
                    )}
                  </span>

                  {/* Icon */}
                  <span className="text-[18px] leading-none shrink-0 mt-0.5">
                    {eventIcon(n.event)}
                  </span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className={`text-[13px] leading-snug ${!n.readAt ? 'font-semibold text-[var(--color-ink)]' : 'font-medium text-[var(--color-ink)]'}`}>
                      {n.title}
                    </div>
                    <div className="mt-0.5 text-[12px] text-[var(--color-stone)] leading-relaxed">
                      {sanitiseBody(n.body)}
                    </div>
                    <div className="mt-1.5 font-mono text-[10px] text-[var(--color-stone-soft)]">
                      {new Date(n.createdAt).toLocaleString('en-NG', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </div>
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
