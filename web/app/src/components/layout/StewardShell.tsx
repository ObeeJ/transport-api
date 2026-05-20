import { NavLink, Outlet, Link, useLocation } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { useBreakpoint } from '@/lib/useBreakpoint'

const nav = [
  { to: '/steward', label: 'Queue', icon: '◎', end: true },
  { to: '/steward/payouts', label: 'Payouts', icon: '◇' },
  { to: '/steward/drivers', label: 'Drivers', icon: '◈' },
  { to: '/steward/sos', label: 'SOS', icon: '◉' },
  { to: '/steward/appeals', label: 'Appeals', icon: '◎' },
  { to: '/steward/attendance', label: 'Attendance', icon: '◈' },
  { to: '/steward/audit', label: 'Audit', icon: '◇' },
]

export function StewardShell() {
  const { user, logout } = useAuth()
  const bp = useBreakpoint()
  const location = useLocation()
  const isMobile = bp === 'mobile'

  return (
    <div className={cn('min-h-dvh flex', isMobile ? 'flex-col' : 'flex-row')}>
      {/* Side nav — tablet/desktop */}
      {!isMobile && (
        <aside className={cn(
          'shrink-0 flex flex-col border-r border-[var(--color-hairline)] bg-[var(--color-paper)]',
          bp === 'desktop' ? 'w-[220px]' : 'w-[64px]',
        )}>
          <div className={cn('pt-5 pb-4', bp === 'desktop' ? 'px-5' : 'flex justify-center px-2')}>
            <Link to="/steward" className="text-[20px] font-medium tracking-tight text-[var(--color-indigo)]">
              {bp === 'desktop'
                ? <>akin<span className="text-[var(--color-clay)]">.</span> <span className="text-sm font-normal text-[var(--color-stone)]">stewards</span></>
                : <span className="text-[var(--color-clay)]">·</span>
              }
            </Link>
          </div>

          <nav className={cn('flex-1 px-2', bp === 'desktop' ? 'px-3' : '')}>
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-[10px] transition-colors mb-0.5',
                    bp === 'desktop' ? 'px-3 py-2.5 text-sm' : 'justify-center p-3',
                    isActive
                      ? 'bg-[var(--color-cream-2)] text-[var(--color-indigo)] font-medium'
                      : 'text-[var(--color-stone)] hover:bg-[var(--color-cream-2)] hover:text-[var(--color-ink)]',
                  )
                }
              >
                <span className="text-base leading-none">{item.icon}</span>
                {bp === 'desktop' && <span>{item.label}</span>}
              </NavLink>
            ))}
          </nav>

          {bp === 'desktop' && (
            <div className="px-3 py-4 border-t border-[var(--color-hairline)] space-y-2">
              <div className="text-[11px] text-[var(--color-stone)] truncate">{user?.email}</div>
              <div className="flex items-center gap-3">
                <Link to="/give" className="text-[10px] text-[var(--color-stone)] underline underline-offset-[3px] hover:text-[var(--color-ink)]">
                  Member view
                </Link>
                <button onClick={() => logout()} className="text-[10px] text-[var(--color-stone)] underline underline-offset-[3px] hover:text-[var(--color-coral)]">
                  Sign out
                </button>
              </div>
            </div>
          )}
        </aside>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        {isMobile && (
          <header className="border-b border-[var(--color-hairline)] bg-[var(--color-paper)] px-5 py-3 flex items-center justify-between shrink-0">
            <Link to="/steward" className="text-[18px] font-medium tracking-tight text-[var(--color-indigo)]">
              akin<span className="text-[var(--color-clay)]">.</span>
              <span className="text-[var(--color-stone)] font-normal ml-1.5 text-sm">stewards</span>
            </Link>
            <div className="flex items-center gap-3 text-xs text-[var(--color-stone)]">
              <Link to="/give" className="underline underline-offset-[3px]">Member</Link>
              <button onClick={() => logout()} className="underline underline-offset-[3px] hover:text-[var(--color-coral)]">Out</button>
            </div>
          </header>
        )}

        {/* Mobile subnav */}
        {isMobile && (
          <nav className="border-b border-[var(--color-hairline)] bg-[var(--color-paper)] px-4 py-2 flex gap-1 overflow-x-auto">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'shrink-0 px-3 py-1.5 rounded-md text-[11px] font-medium uppercase tracking-wide transition-colors',
                    isActive
                      ? 'bg-[var(--color-indigo)] text-[var(--color-paper)]'
                      : 'text-[var(--color-stone)] hover:text-[var(--color-ink)] hover:bg-[var(--color-cream-2)]',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}

        <main className={cn(
          'flex-1',
          isMobile ? 'px-5 py-6' : bp === 'tablet' ? 'px-6 py-6' : 'px-8 py-8 max-w-[1000px]',
        )}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: [0.25, 0.1, 0.25, 1] }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
