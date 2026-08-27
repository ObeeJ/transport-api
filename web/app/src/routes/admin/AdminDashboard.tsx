import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { motion } from 'motion/react'
import { api } from '@/lib/api'
import { fadeUp, stagger, transition } from '@/lib/motion'

type Metrics = {
  activeUsers: number
  pendingDrivers: number
  pendingReports: number
  pendingPayouts: number
  poolBalanceKobo: number
  totalWingsIssued: number
  openEscrowKobo: number
  trustEscalations: number
}

function naira(kobo: number) {
  return '₦' + Math.round(kobo / 100).toLocaleString('en-NG')
}

export function AdminDashboard() {
  const { data, isLoading } = useQuery<Metrics>({
    queryKey: ['admin', 'metrics'],
    queryFn: () => api.get('/admin/metrics'),
    refetchInterval: 30_000,
  })

  const tiles = data
    ? [
        { label: 'Active users', value: data.activeUsers.toLocaleString(), accent: 'var(--color-indigo)' },
        { label: 'Pending drivers', value: String(data.pendingDrivers), accent: 'var(--color-clay)', href: '/admin/drivers' },
        { label: 'Open reports', value: String(data.pendingReports), accent: 'var(--color-coral)', href: '/admin/reports' },
        { label: 'Pending payouts', value: String(data.pendingPayouts), accent: 'var(--color-moss)', href: '/admin/payouts' },
        { label: 'Pool balance', value: naira(data.poolBalanceKobo), accent: 'var(--color-indigo)' },
        { label: 'Wings issued', value: data.totalWingsIssued.toLocaleString() + 'W', accent: 'var(--color-clay)' },
        { label: 'Open escrow', value: naira(data.openEscrowKobo), accent: 'var(--color-stone)' },
        { label: 'Trust escalations', value: String(data.trustEscalations), accent: 'var(--color-coral)', href: '/admin/trust' },
      ]
    : []

  return (
    <motion.div
      variants={stagger(0.06, 0.02)}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      <motion.div variants={fadeUp} transition={transition.default}>
        <h1 className="text-[28px] font-medium tracking-tight text-[var(--color-indigo)] leading-tight">
          Admin
        </h1>
        <p className="mt-1 text-[12px] text-[var(--color-stone)]">Platform overview. Real-time.</p>
      </motion.div>

      {/* Metric tiles */}
      <motion.div variants={fadeUp} transition={transition.default} className="grid grid-cols-2 gap-3">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="card-base p-4 h-[80px] animate-pulse bg-[var(--color-cream)]" />
            ))
          : tiles.map((t) => {
              const inner = (
                <div className="card-base p-4 hover:shadow-sm transition-shadow">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--color-stone)]">{t.label}</div>
                  <div className="mt-1 text-[22px] font-medium tracking-tight leading-none" style={{ color: t.accent }}>
                    {t.value}
                  </div>
                </div>
              )
              return t.href ? (
                <Link key={t.label} to={t.href}>{inner}</Link>
              ) : (
                <div key={t.label}>{inner}</div>
              )
            })}
      </motion.div>

      {/* Quick nav */}
      <motion.div variants={fadeUp} transition={transition.default} className="card-base divide-y divide-[var(--color-hairline)]">
        {[
          { label: 'Driver queue', sub: 'Review evidence + approve', href: '/admin/drivers' },
          { label: 'Report queue', sub: 'Pending user reports', href: '/admin/reports' },
          { label: 'Pricing settings', sub: 'Fuel price, margins, surge', href: '/admin/pricing' },
        ].map((item) => (
          <Link
            key={item.href}
            to={item.href}
            className="flex items-center justify-between px-5 py-4 hover:bg-[var(--color-cream)] transition-colors"
          >
            <div>
              <div className="text-[13px] font-medium text-[var(--color-ink)]">{item.label}</div>
              <div className="text-[11px] text-[var(--color-stone)] mt-0.5">{item.sub}</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[var(--color-stone-soft)]">
              <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        ))}
      </motion.div>
    </motion.div>
  )
}
