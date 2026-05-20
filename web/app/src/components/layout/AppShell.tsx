import { Outlet, NavLink, Link } from 'react-router'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'

const nav = [
  { to: '/give', label: 'Give' },
  { to: '/ride', label: 'Ride' },
  { to: '/drive', label: 'Drive' },
  { to: '/wallet', label: 'Wallet' },
  { to: '/transparency', label: 'Open' },
]

export function AppShell() {
  const { user } = useAuth()
  const isSteward = user?.role === 'steward' || user?.role === 'admin'
  return (
    <div className="mx-auto min-h-dvh w-full max-w-[420px] flex flex-col">
      <header className="px-5 pt-4 pb-2 flex items-center justify-between">
        <NavLink to="/give" className="text-[22px] font-medium tracking-tight text-[var(--color-indigo)]">
          akin<span className="text-[var(--color-clay)]">.</span>
        </NavLink>
        <div className="flex items-center gap-4">
          {isSteward ? (
            <NavLink
              to="/steward"
              className="label-cap text-[var(--color-clay)] hover:text-[var(--color-ink)] transition-colors"
            >
              Steward
            </NavLink>
          ) : null}
          <NavLink
            to="/notifications"
            className={({ isActive }) =>
              cn(
                'label-cap transition-colors',
                isActive ? 'text-[var(--color-ink)]' : 'text-[var(--color-stone)] hover:text-[var(--color-ink)]',
              )
            }
          >
            Inbox
          </NavLink>
          <NavLink
            to="/support"
            className={({ isActive }) =>
              cn(
                'label-cap transition-colors',
                isActive ? 'text-[var(--color-ink)]' : 'text-[var(--color-stone)] hover:text-[var(--color-ink)]',
              )
            }
          >
            Support
          </NavLink>
        </div>
      </header>

      <main className="flex-1 px-5 pb-24">
        {user && !user.emailVerifiedAt && (
          <div className="mt-3 mb-1 rounded-[12px] px-4 py-2.5 flex items-center justify-between" style={{ background: 'rgba(217,119,87,0.10)', border: '1px solid rgba(217,119,87,0.25)' }}>
            <p className="text-[11px] text-[var(--color-clay)]">Email not verified</p>
            <Link to="/account/verify-email" className="text-[11px] font-medium text-[var(--color-clay)] underline underline-offset-[3px]">Verify →</Link>
          </div>
        )}
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[420px] border-t border-[var(--color-hairline)] bg-[var(--color-paper)]/95 backdrop-blur">
        <div className="grid grid-cols-5">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'relative py-3 text-center text-[11px] font-medium tracking-wide uppercase transition-colors',
                  isActive
                    ? 'text-[var(--color-indigo)]'
                    : 'text-[var(--color-stone)] hover:text-[var(--color-ink)]',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {item.label}
                  {isActive ? (
                    <motion.span
                      layoutId="nav-indicator"
                      className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-[2px] rounded-full bg-[var(--color-indigo)]"
                      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                    />
                  ) : null}
                </>
              )}
            </NavLink>
          ))}
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>
    </div>
  )
}
