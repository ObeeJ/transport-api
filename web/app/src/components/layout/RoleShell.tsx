import { Outlet, NavLink, Link, useLocation } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { useBreakpoint } from '@/lib/useBreakpoint'
import { useRoles, roleLabels, roleRoutes, type Role } from '@/lib/useRoles'

// ─── Per-role nav items ───────────────────────────────────────────────────────

const giverNav = [
  { to: '/give', label: 'Pool', icon: '◎' },
  { to: '/notes', label: 'Notes', icon: '✦' },
  { to: '/transparency', label: 'Open', icon: '◈' },
]

const riderNav = [
  { to: '/ride', label: 'Find a ride', icon: '◎' },
  { to: '/support', label: 'Support', icon: '◈' },
  { to: '/wallet', label: 'Wallet', icon: '◇' },
]

const driverNav = [
  { to: '/drive', label: 'My trips', icon: '◎' },
  { to: '/drive/apply', label: 'Verification', icon: '◈' },
]

const sharedNav = [
  { to: '/notifications', label: 'Inbox', icon: '◉' },
  { to: '/account', label: 'Account', icon: '○' },
]

function navForRole(role: Role) {
  switch (role) {
    case 'giver': return giverNav
    case 'rider': return riderNav
    case 'driver': return driverNav
    default: return giverNav
  }
}

// ─── Shell ────────────────────────────────────────────────────────────────────

interface ShellProps {
  role: Role
}

export function RoleShell({ role }: ShellProps) {
  const { user } = useAuth()
  const bp = useBreakpoint()
  const roles = useRoles()
  const location = useLocation()
  const isSteward = user?.role === 'steward' || user?.role === 'admin'
  const primaryNav = navForRole(role)
  const allNav = [...primaryNav, ...sharedNav]

  const isMobile = bp === 'mobile'
  const isSide = bp === 'tablet' || bp === 'desktop'

  return (
    <div
      className={cn(
        'min-h-dvh flex',
        isSide ? 'flex-row' : 'flex-col',
      )}
    >
      {/* ── Side nav (tablet / desktop) ── */}
      {isSide && (
        <aside
          className={cn(
            'shrink-0 flex flex-col border-r border-[var(--color-hairline)] bg-[var(--color-paper)]',
            bp === 'desktop' ? 'w-[220px]' : 'w-[64px]',
          )}
        >
          {/* Logo */}
          <div className={cn('px-4 pt-5 pb-4', bp === 'desktop' ? 'px-5' : 'flex justify-center')}>
            <Link to="/give" className="text-[20px] font-medium tracking-tight text-[var(--color-indigo)]">
              {bp === 'desktop'
                ? <>akin<span className="text-[var(--color-clay)]">.</span></>
                : <span className="text-[var(--color-clay)]">·</span>
              }
            </Link>
          </div>

          {/* Role switcher */}
          {roles.length > 1 && (
            <div className={cn('px-2 mb-3', bp === 'desktop' ? 'px-3' : '')}>
              {roles.filter(r => r !== 'steward').map((r) => (
                <Link
                  key={r}
                  to={roleRoutes[r]}
                  className={cn(
                    'flex items-center gap-2 rounded-[10px] transition-colors mb-0.5',
                    bp === 'desktop' ? 'px-3 py-2 text-xs' : 'justify-center p-2',
                    r === role
                      ? 'bg-[var(--color-indigo)] text-[var(--color-paper)]'
                      : 'text-[var(--color-stone)] hover:bg-[var(--color-cream-2)] hover:text-[var(--color-ink)]',
                  )}
                >
                  <span className="text-[10px] font-mono uppercase tracking-widest">
                    {bp === 'desktop' ? roleLabels[r] : roleLabels[r].slice(0, 1)}
                  </span>
                </Link>
              ))}
              {isSteward && (
                <Link
                  to="/steward"
                  className={cn(
                    'flex items-center gap-2 rounded-[10px] transition-colors mb-0.5 text-[var(--color-clay)] hover:bg-[var(--color-cream-2)]',
                    bp === 'desktop' ? 'px-3 py-2 text-xs' : 'justify-center p-2',
                  )}
                >
                  <span className="text-[10px] font-mono uppercase tracking-widest">
                    {bp === 'desktop' ? 'Steward ↗' : 'S'}
                  </span>
                </Link>
              )}
              <div className="my-2 h-px bg-[var(--color-hairline)]" />
            </div>
          )}

          {/* Primary nav */}
          <nav className={cn('flex-1 px-2', bp === 'desktop' ? 'px-3' : '')}>
            {allNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/give' || item.to === '/ride' || item.to === '/drive'}
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

          {/* User footer */}
          {bp === 'desktop' && (
            <div className="px-3 py-4 border-t border-[var(--color-hairline)]">
              <div className="text-[11px] text-[var(--color-stone)] truncate">{user?.email}</div>
              <div className="mt-0.5 font-mono text-[10px] text-[var(--color-stone-soft)] uppercase tracking-wider">{user?.role}</div>
            </div>
          )}
        </aside>
      )}

      {/* ── Main content ── */}
      <div className={cn('flex-1 flex flex-col min-w-0', isMobile && 'max-w-[420px] mx-auto w-full')}>
        {/* Mobile header */}
        {isMobile && (
          <header className="px-5 pt-4 pb-2 flex items-center justify-between shrink-0">
            <Link to="/give" className="text-[22px] font-medium tracking-tight text-[var(--color-indigo)]">
              akin<span className="text-[var(--color-clay)]">.</span>
            </Link>
            <div className="flex items-center gap-3">
              {roles.length > 1 && (
                <RoleSwitcher roles={roles} current={role} />
              )}
              {isSteward && (
                <Link to="/steward" className="label-cap text-[var(--color-clay)]">Steward</Link>
              )}
              <NavLink
                to="/notifications"
                className={({ isActive }) =>
                  cn('label-cap transition-colors', isActive ? 'text-[var(--color-ink)]' : 'text-[var(--color-stone)]')
                }
              >
                Inbox
              </NavLink>
            </div>
          </header>
        )}

        {/* Tablet header */}
        {bp === 'tablet' && (
          <header className="px-6 py-3 border-b border-[var(--color-hairline)] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium text-[var(--color-indigo)] capitalize">{roleLabels[role]}</span>
            </div>
            <div className="flex items-center gap-4">
              {roles.length > 1 && <RoleSwitcher roles={roles} current={role} />}
              {isSteward && <Link to="/steward" className="label-cap text-[var(--color-clay)]">Steward</Link>}
              <NavLink to="/notifications" className="label-cap text-[var(--color-stone)] hover:text-[var(--color-ink)]">Inbox</NavLink>
            </div>
          </header>
        )}

        {/* Email verify banner */}
        {user && !user.emailVerifiedAt && (
          <div className={cn(
            'flex items-center justify-between',
            isMobile ? 'mx-5 mt-3 mb-1 rounded-[12px] px-4 py-2.5' : 'mx-6 mt-3 mb-1 rounded-[12px] px-4 py-2',
          )} style={{ background: 'rgba(217,119,87,0.10)', border: '1px solid rgba(217,119,87,0.25)' }}>
            <p className="text-[11px] text-[var(--color-clay)]">Email not verified</p>
            <Link to="/account/verify-email" className="text-[11px] font-medium text-[var(--color-clay)] underline underline-offset-[3px]">Verify →</Link>
          </div>
        )}

        {/* Page content with motion transitions */}
        <main className={cn(
          'flex-1',
          isMobile ? 'px-5 pb-24' : bp === 'tablet' ? 'px-6 py-6 pb-8' : 'px-8 py-8 max-w-[860px]',
        )}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Mobile bottom nav */}
        {isMobile && (
          <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[420px] border-t border-[var(--color-hairline)] bg-[var(--color-paper)]/95 backdrop-blur z-50">
            <div className={cn('grid', `grid-cols-${allNav.length}`)}>
              {allNav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/give' || item.to === '/ride' || item.to === '/drive'}
                  className={({ isActive }) =>
                    cn(
                      'py-3 flex flex-col items-center gap-0.5 transition-colors',
                      isActive ? 'text-[var(--color-indigo)]' : 'text-[var(--color-stone)]',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className={cn('text-base leading-none', isActive && 'scale-110 transition-transform')}>{item.icon}</span>
                      <span className="text-[9px] font-medium tracking-wide uppercase">{item.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
            <div className="h-[env(safe-area-inset-bottom)]" />
          </nav>
        )}
      </div>
    </div>
  )
}

// ─── Role switcher pill ───────────────────────────────────────────────────────

function RoleSwitcher({ roles, current }: { roles: Role[]; current: Role }) {
  const visible = roles.filter(r => r !== 'steward')
  if (visible.length <= 1) return null
  return (
    <div className="flex items-center gap-1 rounded-full border border-[var(--color-hairline)] bg-[var(--color-cream)] px-1 py-0.5">
      {visible.map((r) => (
        <Link
          key={r}
          to={roleRoutes[r]}
          className={cn(
            'px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide transition-colors',
            r === current
              ? 'bg-[var(--color-indigo)] text-[var(--color-paper)]'
              : 'text-[var(--color-stone)] hover:text-[var(--color-ink)]',
          )}
        >
          {roleLabels[r]}
        </Link>
      ))}
    </div>
  )
}
