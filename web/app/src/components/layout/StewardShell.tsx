import { NavLink, Outlet, Link, useLocation } from 'react-router'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { useBreakpoint } from '@/lib/useBreakpoint'
import { useSidebarCollapsed } from '@/lib/useSidebarCollapsed'

const nav = [
  { to: '/steward', label: 'Queue', end: true },
  { to: '/steward/payouts', label: 'Payouts' },
  { to: '/steward/drivers', label: 'Drivers' },
  { to: '/steward/sos', label: 'SOS' },
  { to: '/steward/appeals', label: 'Appeals' },
  { to: '/steward/attendance', label: 'Attendance' },
  { to: '/steward/audit', label: 'Audit' },
]

function renderStewardIcon(label: string, isActive: boolean) {
  const primaryColor = isActive ? 'var(--color-indigo)' : 'var(--color-stone)'
  const coralColor = isActive ? 'var(--color-coral)' : 'var(--color-stone-soft)'
  const clayColor = isActive ? 'var(--color-clay)' : 'var(--color-stone-soft)'

  switch (label) {
    case 'Queue': return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke={primaryColor} strokeWidth="2" />
        <path d="M12 7v5l3 2" stroke={coralColor} strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
    case 'Payouts': return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="5" width="18" height="14" rx="2" stroke={primaryColor} strokeWidth="2" />
        <line x1="3" y1="10" x2="21" y2="10" stroke={primaryColor} strokeWidth="1.5" />
        <circle cx="7" cy="14" r="1.5" fill={coralColor} />
        <circle cx="11" cy="14" r="1.5" fill={coralColor} />
      </svg>
    )
    case 'Drivers': return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke={primaryColor} strokeWidth="2" />
        <circle cx="12" cy="12" r="2.5" fill={coralColor} />
        <path d="M12 3v4M12 17v4M3 12h4M17 12h4" stroke={primaryColor} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
    case 'SOS': return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className={isActive ? 'animate-pulse' : ''}>
        <path d="M12 2L2 22h20L12 2z" stroke="var(--color-coral)" strokeWidth="2" strokeLinejoin="round" fill={isActive ? 'rgba(200,75,58,0.1)' : 'none'} />
        <line x1="12" y1="9" x2="12" y2="14" stroke={primaryColor} strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="17.5" r="1.5" fill={primaryColor} />
      </svg>
    )
    case 'Appeals': return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke={primaryColor} strokeWidth="2" strokeLinejoin="round" />
        <path d="M8 10h8" stroke={coralColor} strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
    case 'Attendance': return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke={primaryColor} strokeWidth="2" />
        <circle cx="9" cy="7" r="4" stroke={primaryColor} strokeWidth="2" />
        <path d="M19 8l2 2 3-3" stroke={coralColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
    case 'Audit': return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke={primaryColor} strokeWidth="2" />
        <polyline points="14 2 14 8 20 8" stroke={primaryColor} strokeWidth="2" />
        <line x1="8" y1="13" x2="16" y2="13" stroke={clayColor} strokeWidth="2" strokeLinecap="round" />
        <line x1="8" y1="17" x2="12" y2="17" stroke={clayColor} strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
    default: return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="8" stroke={primaryColor} strokeWidth="2" />
      </svg>
    )
  }
}

function CollapseToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      className="flex items-center justify-center w-7 h-7 rounded-[8px] text-[var(--color-stone)] hover:text-[var(--color-ink)] hover:bg-[var(--color-cream-2)] transition-colors"
    >
      <motion.svg
        width="14" height="14" viewBox="0 0 14 14" fill="none"
        animate={{ rotate: collapsed ? 180 : 0 }}
        transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </motion.svg>
    </button>
  )
}

export function StewardShell() {
  const { user, logout } = useAuth()
  const bp = useBreakpoint()
  const location = useLocation()
  const [collapsed, setCollapsed] = useSidebarCollapsed()
  const isMobile = bp === 'mobile'
  const iconOnly = bp === 'tablet' || (bp === 'desktop' && collapsed)

  return (
    <div className={cn(
      'min-h-dvh flex bg-[var(--color-cream)]',
      isMobile ? 'flex-col' : 'flex-row',
    )}>

      {/* Side nav — tablet/desktop */}
      {!isMobile && (
        <motion.aside
          animate={{ width: iconOnly ? 64 : 220 }}
          transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
          className="shrink-0 flex flex-col border-r border-[var(--color-hairline)] bg-[var(--color-paper)] z-40 overflow-hidden"
          style={{ width: iconOnly ? 64 : 220, minWidth: iconOnly ? 64 : 220 }}
        >
          {/* Logo + collapse */}
          <div className={cn(
            'pt-5 pb-4 flex items-center',
            iconOnly ? 'justify-center px-2' : 'justify-between px-4',
          )}>
            <Link
              to="/steward"
              className="text-[20px] font-medium tracking-tight text-[var(--color-indigo)] hover:opacity-85 transition-opacity shrink-0"
            >
              {iconOnly
                ? <span className="text-[var(--color-clay)]">·</span>
                : <>akin<span className="text-[var(--color-clay)]">.</span> <span className="text-xs font-normal text-[var(--color-stone)]">stewards</span></>
              }
            </Link>
            {bp === 'desktop' && (
              <CollapseToggle collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
            )}
          </div>

          <nav className={cn('flex-1 space-y-0.5', iconOnly ? 'px-2' : 'px-3')}>
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                title={item.label}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-[10px] transition-all relative z-10',
                    iconOnly ? 'justify-center p-3' : 'px-3 py-2.5 text-sm',
                    isActive
                      ? 'text-[var(--color-indigo)] font-semibold'
                      : 'text-[var(--color-stone)] hover:text-[var(--color-ink)] hover:bg-[var(--color-cream-2)]/30',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.div
                        layoutId="active-steward-nav-pill"
                        className="absolute inset-0 bg-[var(--color-cream-2)] rounded-[10px] -z-10"
                        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                      />
                    )}
                    <span className="flex items-center justify-center shrink-0">
                      {renderStewardIcon(item.label, isActive)}
                    </span>
                    {!iconOnly && <span className="truncate">{item.label}</span>}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className={cn(
            'border-t border-[var(--color-hairline)] shrink-0',
            iconOnly ? 'px-2 py-3 flex flex-col items-center gap-2' : 'px-3 py-3',
          )}>
            {iconOnly ? (
              <>
                <Link to="/give" title={user?.email} className="flex items-center justify-center w-8 h-8 rounded-full bg-[var(--color-cream-2)] text-[var(--color-indigo)] text-[12px] font-semibold hover:opacity-80 transition-opacity">
                  {user?.email?.charAt(0).toUpperCase() ?? '?'}
                </Link>
                <button onClick={() => logout()} title="Sign out" className="flex items-center justify-center w-8 h-8 rounded-[8px] text-[var(--color-stone)] hover:text-[var(--color-coral)] hover:bg-[rgba(200,75,58,0.08)] transition-colors">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </>
            ) : (
              <motion.div key="steward-footer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex items-center gap-2.5">
                <Link to="/give" className="flex items-center justify-center w-8 h-8 rounded-full bg-[var(--color-cream-2)] text-[var(--color-indigo)] text-[12px] font-semibold shrink-0 hover:opacity-80 transition-opacity" title="Member view">
                  {user?.email?.charAt(0).toUpperCase() ?? '?'}
                </Link>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-[var(--color-ink)] truncate">{user?.email}</p>
                  <p className="text-[10px] font-mono text-[var(--color-stone-soft)] uppercase tracking-wider">steward</p>
                </div>
                <button onClick={() => logout()} title="Sign out" className="flex items-center justify-center w-7 h-7 rounded-[8px] text-[var(--color-stone)] hover:text-[var(--color-coral)] hover:bg-[rgba(200,75,58,0.08)] transition-colors shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </motion.div>
            )}
          </div>
        </motion.aside>
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
                    'shrink-0 px-3 py-1.5 rounded-md text-[11px] font-medium uppercase tracking-wide transition-colors relative z-10',
                    isActive
                      ? 'text-[var(--color-paper)] font-semibold'
                      : 'text-[var(--color-stone)] hover:text-[var(--color-ink)] hover:bg-[var(--color-cream-2)]/30',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.div
                        layoutId="active-steward-mobile-subnav"
                        className="absolute inset-0 bg-[var(--color-indigo)] rounded-md -z-10"
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      />
                    )}
                    <span className="relative z-10">{item.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        )}

        <main className={cn(
          'flex-1 bg-[var(--color-cream)]',
          isMobile ? 'px-5 py-6' : bp === 'tablet' ? 'px-6 py-6' : 'px-[150px] py-8',
        )}>
          {/* See the long comment in RoleShell for why we don't use
              AnimatePresence + mode="wait" around <Outlet/>. Same fix here. */}
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  )
}
