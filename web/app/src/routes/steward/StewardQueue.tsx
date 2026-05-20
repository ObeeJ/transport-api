import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { motion } from 'motion/react'
import { api } from '@/lib/api'
import { StewardSubnav } from '@/components/StewardSubnav'
import { fadeUp, stagger, transition } from '@/lib/motion'

type Recipient = {
  id: string
  pseudonymousId: string
  status: 'pending' | 'approved' | 'declined'
  disbursementMethod: 'wallet' | 'bank'
  intakeWeeklyCostKobo: number
  createdAt: string
}

export function StewardQueue() {
  const q = useQuery<{ items: Recipient[] }>({
    queryKey: ['steward', 'queue'],
    queryFn: () => api.get('/steward/queue'),
    refetchInterval: 10_000,
  })

  return (
    <motion.div
      variants={stagger(0.07, 0.02)}
      initial="hidden"
      animate="show"
    >
      <StewardSubnav />
      <motion.div variants={fadeUp} transition={transition.default} className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-medium tracking-tight text-[var(--color-indigo)]">Queue</h1>
          <p className="mt-1 text-sm text-[var(--color-stone)]">
            Pending applications, oldest first. Two distinct stewards must sign off before status changes.
          </p>
        </div>
        <span className="font-mono text-xs text-[var(--color-stone)]">
          {q.data?.items.length ?? 0} pending
        </span>
      </motion.div>

      <motion.div variants={fadeUp} transition={transition.default} className="mt-6 card-base overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-cream)] text-left text-[10px] uppercase tracking-wider text-[var(--color-stone)]">
            <tr>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Method</th>
              <th className="px-4 py-3 font-medium text-right">Weekly cost</th>
              <th className="px-4 py-3 font-medium">Submitted</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[var(--color-stone)]">Loading…</td>
              </tr>
            ) : (q.data?.items ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-[var(--color-stone)]">
                  Queue is empty. Nothing waiting on you right now.
                </td>
              </tr>
            ) : (
              q.data?.items.map((r, i) => (
                <motion.tr
                  key={r.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...transition.default, delay: 0.1 + i * 0.05 }}
                  className="border-t border-[var(--color-hairline)] hover:bg-[var(--color-cream)]/50"
                >
                  <td className="px-4 py-3 font-mono text-[var(--color-indigo)]">{r.pseudonymousId}</td>
                  <td className="px-4 py-3 text-[var(--color-stone)] uppercase text-[11px] tracking-wider">{r.disbursementMethod}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    ₦{(r.intakeWeeklyCostKobo / 100).toLocaleString('en-NG')}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-stone)] text-xs">
                    {new Date(r.createdAt).toLocaleDateString('en-NG', { day: '2-digit', month: 'short' })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/steward/applications/${r.id}`}
                      className="text-xs font-medium text-[var(--color-indigo)] underline underline-offset-[3px]"
                    >
                      Review →
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
