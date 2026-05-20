import { NavLink } from 'react-router'
import { cn } from '@/lib/utils'

const items = [
  { to: '/steward', label: 'Queue', end: true },
  { to: '/steward/payouts', label: 'Payouts' },
  { to: '/steward/drivers', label: 'Drivers' },
  { to: '/steward/sos', label: 'SOS' },
  { to: '/steward/appeals', label: 'Appeals' },
  { to: '/steward/attendance', label: 'Attendance' },
  { to: '/steward/roster', label: 'Roster' },
  { to: '/steward/audit', label: 'Audit' },
]

export function StewardSubnav() {
  return (
    <nav className="flex gap-1 mb-6">
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.end}
          className={({ isActive }) =>
            cn(
              'px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide rounded-md transition-colors',
              isActive
                ? 'bg-[var(--color-indigo)] text-[var(--color-paper)]'
                : 'text-[var(--color-stone)] hover:text-[var(--color-ink)] hover:bg-[var(--color-cream-2)]',
            )
          }
        >
          {it.label}
        </NavLink>
      ))}
    </nav>
  )
}
