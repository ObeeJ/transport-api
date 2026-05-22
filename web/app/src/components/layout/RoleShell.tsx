import { useEffect } from 'react'
import { Outlet, NavLink, Link, useLocation } from 'react-router'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { useBreakpoint } from '@/lib/useBreakpoint'
import { useRoles, roleLabels, roleRoutes, setActiveRole, getActiveRole, type Role } from '@/lib/useRoles'
import { useSidebarCollapsed } from '@/lib/useSidebarCollapsed'

// ─── Nav items per role ───────────────────────────────────────────────────────

const giverNav  = [{ to: '/give', label: 'Pool' }, { to: '/notes', label: 'Notes' }, { to: '/transparency', label: 'Open' }]
const commuterNav = [{ to: '/ride', label: 'Rides' }, { to: '/support', label: 'Support' }, { to: '/wallet', label: 'Wallet' }]
const driverNav = [{ to: '/drive', label: 'Trips' }, { to: '/drive/apply', label: 'Verify' }]
const sharedNav = [{ to: '/notifications', label: 'Inbox' }, { to: '/account', label: 'Account' }]

function navForRole(role: Role) {
  if (role === 'commuter') return commuterNav
  if (role === 'driver') return driverNav
  return giverNav
}

// ─── Role colours ─────────────────────────────────────────────────────────────

const roleColors: Record<Role, { bg: string; fg: string }> = {
  giver:   { bg: 'rgba(27,42,78,0.08)',   fg: 'var(--color-indigo)' },
  commuter: { bg: 'rgba(94,114,89,0.10)',  fg: 'var(--color-moss)'   },
  driver:  { bg: 'rgba(217,119,87,0.12)', fg: 'var(--color-clay)'   },
  steward: { bg: 'rgba(200,75,58,0.10)',  fg: 'var(--color-coral)'  },
}

// ─── Icons ────────────────────────────────────────────────────────────────────
// Every icon is two-tone: stroke = role/active colour, fill = soft tint.
// Inactive state: both colours collapse to stone/stone-soft.

function NavIcon({ label, active }: { label: string; active: boolean }) {
  const p = active ? 'var(--color-indigo)' : 'var(--color-stone)'
  const c = active ? 'var(--color-clay)'   : 'var(--color-stone-soft)'
  const m = active ? 'var(--color-moss)'   : 'var(--color-stone)'
  const cl = active ? 'var(--color-clay)'  : 'var(--color-stone)'
  const coral = active ? 'var(--color-coral)' : 'var(--color-stone-soft)'

  // Giver
  if (label === 'Pool') return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke={p} strokeWidth="1.8"/>
      <path d="M12 17v-9M9 11l3-3 3 3" stroke={p} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="12" cy="12" r="2.5" fill={c} opacity="0.6"/>
    </svg>
  )
  if (label === 'Notes') return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M20 2H4a1 1 0 0 0-1 1v13l4 4h13a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z" stroke={p} strokeWidth="1.8" strokeLinejoin="round"/>
      <path d="M7 8h10M7 12h6" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
  if (label === 'Open') return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="3" stroke={p} strokeWidth="1.8"/>
      <path d="M7 16h2v-5H7v5zm4 0h2v-8h-2v8zm4 0h2v-11h-2v11z" fill={c}/>
    </svg>
  )

  // Commuter
  if (label === 'Rides') return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke={m} strokeWidth="1.8" strokeLinejoin="round"/>
      <circle cx="12" cy="9" r="3" fill={cl} stroke={m} strokeWidth="0.5"/>
    </svg>
  )
  if (label === 'Support') return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke={m} strokeWidth="1.8" strokeLinejoin="round"/>
      <path d="M9 12l2 2 4-4" stroke={cl} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
  if (label === 'Wallet') return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="5" width="20" height="14" rx="2" stroke={m} strokeWidth="1.8"/>
      <path d="M2 10h20" stroke={m} strokeWidth="1.5"/>
      <circle cx="16" cy="15" r="2" fill={cl}/>
    </svg>
  )

  // Driver
  if (label === 'Trips') return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke={cl} strokeWidth="1.8"/>
      <circle cx="12" cy="12" r="3" fill={p}/>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" stroke={cl} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
  if (label === 'Verify') return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="16" rx="2" stroke={cl} strokeWidth="1.8"/>
      <path d="M7 9h5M7 13h10" stroke={cl} strokeWidth="1.8" strokeLinecap="round"/>
      <circle cx="17" cy="9" r="2" fill={p}/>
    </svg>
  )

  // Shared
  if (label === 'Inbox') return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke={p} strokeWidth="1.8"/>
      <path d="M22 6l-10 7L2 6" stroke={p} strokeWidth="1.5"/>
      <circle cx="18" cy="6" r="3" fill={coral} stroke="var(--color-paper)" strokeWidth="1.5"/>
    </svg>
  )
  if (label === 'Account') return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" stroke={p} strokeWidth="1.8"/>
      <path d="M4 20c0-4 3.58-7 8-7s8 3 8 7" stroke={p} strokeWidth="1.8" strokeLinecap="round"/>
      <circle cx="12" cy="8" r="1.5" fill={coral}/>
    </svg>
  )

  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke={p} strokeWidth="1.8"/></svg>
}

// Role icon for the switcher (larger, more expressive)
function RoleIcon({ role, active }: { role: Role; active: boolean }) {
  const fg = active ? roleColors[role].fg : 'var(--color-stone)'
  const fill = active ? roleColors[role].bg : 'transparent'
  switch (role) {
    case 'giver': return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" fill={fill} stroke={fg} strokeWidth="2"/>
        <path d="M12 17v-9M9 11l3-3 3 3" stroke={fg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
    case 'commuter': return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill={fill} stroke={fg} strokeWidth="2" strokeLinejoin="round"/>
        <circle cx="12" cy="9" r="3" fill={fg} opacity="0.7"/>
      </svg>
    )
    case 'driver': return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" fill={fill} stroke={fg} strokeWidth="2"/>
        <circle cx="12" cy="12" r="3" fill={fg}/>
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3" stroke={fg} strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    )
    case 'steward': return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M12 3L4 7v6c0 5 3.6 9.1 8 10 4.4-.9 8-5 8-10V7L12 3z" fill={fill} stroke={fg} strokeWidth="2" strokeLinejoin="round"/>
        <path d="M9 12l2 2.5 4-4" stroke={fg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
  }
}

// ─── Collapse toggle ──────────────────────────────────────────────────────────

function CollapseToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      className="flex items-center justify-center w-8 h-8 rounded-[10px] text-[var(--color-stone)] hover:text-[var(--color-ink)] hover:bg-[var(--color-cream-2)] transition-colors shrink-0"
    >
      <motion.svg
        width="16" height="16" viewBox="0 0 16 16" fill="none"
        animate={{ rotate: collapsed ? 180 : 0 }}
        transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </motion.svg>
    </button>
  )
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export function RoleShell({ role }: { role: Role }) {
  const { user, logout } = useAuth()
  const bp = useBreakpoint()
  const roles = useRoles()
  const location = useLocation()
  const [collapsed, setCollapsed] = useSidebarCollapsed()

  // Remember the rail the user is currently on so shared pages (Account,
  // Notifications) can restore it instead of always flipping to giver.
  useEffect(() => { setActiveRole(role) }, [role])

  const isSteward = user?.role === 'steward' || user?.role === 'admin'
  const primaryNav = navForRole(role)
  const allNav = [...primaryNav, ...sharedNav]
  const isMobile = bp === 'mobile'
  const isSide = bp === 'tablet' || bp === 'desktop'
  // tablet = always icon-only; desktop = respects collapsed state
  const iconOnly = bp === 'tablet' || (bp === 'desktop' && collapsed)
  const sideW = iconOnly ? 64 : 220

  return (
    <div className={cn(
      'min-h-dvh flex bg-[var(--color-cream)]',
      isSide ? 'flex-row' : 'flex-col',
    )}>
      {/* ── Sidebar ── */}
      {isSide && (
        <motion.aside
          initial={false}
          animate={{ width: sideW }}
          transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          className="shrink-0 flex flex-col border-r border-[var(--color-hairline)] bg-[var(--color-paper)] z-40 overflow-hidden"
          style={{ width: sideW, minWidth: sideW }}
        >
          {/* ── Logo row ── */}
          <div className={cn('h-14 flex items-center shrink-0 border-b border-[var(--color-hairline)]', iconOnly ? 'justify-center px-0' : 'justify-between px-4')}>
            <Link to="/give" className="text-[18px] font-medium tracking-tight text-[var(--color-indigo)] hover:opacity-75 transition-opacity shrink-0">
              {iconOnly
                ? <span className="text-[22px] text-[var(--color-clay)] leading-none">·</span>
                : <>akin<span className="text-[var(--color-clay)]">.</span></>
              }
            </Link>
            {bp === 'desktop' && (
              <CollapseToggle collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
            )}
          </div>

          {/* ── Role switcher ── */}
          {roles.length > 1 && (
            <div className={cn('pt-3 pb-2 border-b border-[var(--color-hairline)]', iconOnly ? 'px-2' : 'px-3')}>
              {roles.filter(r => r !== 'steward').map((r) => {
                const isCurrent = r === role
                const colors = roleColors[r]
                return (
                  <Link
                    key={r}
                    to={roleRoutes[r]}
                    title={roleLabels[r]}
                    className={cn(
                      'flex items-center rounded-[10px] transition-all duration-150 mb-0.5 relative',
                      iconOnly ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2',
                      !isCurrent && 'hover:bg-[var(--color-cream-2)]/60',
                    )}
                    style={{ color: isCurrent ? colors.fg : 'var(--color-stone)' }}
                  >
                    {isCurrent && (
                      <motion.div
                        layoutId="sidebar-role-bg"
                        className="absolute inset-0 rounded-[10px]"
                        style={{ background: colors.bg }}
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                    <span className="relative shrink-0">
                      <RoleIcon role={r} active={isCurrent} />
                    </span>
                    {!iconOnly && (
                      <span className="relative text-[11px] font-semibold uppercase tracking-widest">
                        {roleLabels[r]}
                      </span>
                    )}
                  </Link>
                )
              })}
              {isSteward && (
                <Link
                  to="/steward"
                  title="Steward console"
                  className={cn(
                    'flex items-center rounded-[10px] transition-colors text-[var(--color-clay)] hover:bg-[rgba(217,119,87,0.08)] mt-0.5',
                    iconOnly ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2',
                  )}
                >
                  <span className="shrink-0"><RoleIcon role="steward" active={false} /></span>
                  {!iconOnly && <span className="text-[11px] font-semibold uppercase tracking-widest">Steward</span>}
                </Link>
              )}
            </div>
          )}

          {/* ── Primary nav ── */}
          <nav className={cn('flex-1 pt-2', iconOnly ? 'px-2' : 'px-3')}>
            {allNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={['/', '/give', '/ride', '/drive'].includes(item.to)}
                title={item.label}
                className={({ isActive }) => cn(
                  'flex items-center rounded-[10px] transition-all duration-150 mb-0.5 relative',
                  iconOnly ? 'justify-center p-3' : 'gap-3 px-3 py-2.5',
                  isActive
                    ? 'text-[var(--color-indigo)]'
                    : 'text-[var(--color-stone)] hover:text-[var(--color-ink)] hover:bg-[var(--color-cream-2)]/40',
                )}
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.div
                        layoutId="sidebar-nav-bg"
                        className="absolute inset-0 bg-[var(--color-cream-2)] rounded-[10px]"
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                    <span className="relative shrink-0 flex items-center justify-center">
                      <NavIcon label={item.label} active={isActive} />
                    </span>
                    {!iconOnly && (
                      <span className={cn('relative text-[13px] truncate', isActive && 'font-semibold')}>
                        {item.label}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* ── User footer ── */}
          <div className={cn(
            'border-t border-[var(--color-hairline)] shrink-0',
            iconOnly ? 'px-2 py-3 flex flex-col items-center gap-2' : 'px-3 py-3',
          )}>
            {iconOnly ? (
              // Collapsed: avatar + sign-out icon stacked
              <>
                <Link
                  to="/account"
                  title={user?.email}
                  className="flex items-center justify-center w-8 h-8 rounded-full bg-[var(--color-cream-2)] text-[var(--color-indigo)] text-[12px] font-semibold hover:opacity-80 transition-opacity"
                >
                  {user?.email?.charAt(0).toUpperCase() ?? '?'}
                </Link>
                <button
                  onClick={() => logout()}
                  title="Sign out"
                  className="flex items-center justify-center w-8 h-8 rounded-[8px] text-[var(--color-stone)] hover:text-[var(--color-coral)] hover:bg-[rgba(200,75,58,0.08)] transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </>
            ) : (
              // Expanded: avatar + email/role + sign-out button
              <motion.div
                key="footer-expanded"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-2.5"
              >
                <Link
                  to="/account"
                  className="flex items-center justify-center w-8 h-8 rounded-full bg-[var(--color-cream-2)] text-[var(--color-indigo)] text-[12px] font-semibold shrink-0 hover:opacity-80 transition-opacity"
                >
                  {user?.email?.charAt(0).toUpperCase() ?? '?'}
                </Link>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-[var(--color-ink)] truncate">{user?.email}</p>
                  <p className="text-[10px] font-mono text-[var(--color-stone-soft)] uppercase tracking-wider">{user?.role}</p>
                </div>
                <button
                  onClick={() => logout()}
                  title="Sign out"
                  className="flex items-center justify-center w-7 h-7 rounded-[8px] text-[var(--color-stone)] hover:text-[var(--color-coral)] hover:bg-[rgba(200,75,58,0.08)] transition-colors shrink-0"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </motion.div>
            )}
          </div>
        </motion.aside>
      )}

      {/* ── Main ── */}
      <div className={cn('flex-1 flex flex-col min-w-0', isMobile && 'w-full overflow-x-hidden')}>

        {/* Mobile header */}
        {isMobile && (
          <header className="h-14 px-4 flex items-center justify-between shrink-0 bg-[var(--color-paper)] border-b border-[var(--color-hairline)]">
            <Link to="/give" className="text-[20px] font-medium tracking-tight text-[var(--color-indigo)]">
              akin<span className="text-[var(--color-clay)]">.</span>
            </Link>
            <div className="flex items-center gap-1">
              {roles.length > 1 && <MobileRoleSwitcher roles={roles} current={role} />}
              {isSteward && (
                <Link to="/steward" className="flex items-center justify-center w-9 h-9 rounded-[10px] hover:bg-[var(--color-cream-2)] transition-colors" title="Steward console">
                  <RoleIcon role="steward" active={false} />
                </Link>
              )}
              <NavLink
                to="/notifications"
                title="Inbox"
                className={({ isActive }) => cn(
                  'flex items-center justify-center w-9 h-9 rounded-[10px] transition-colors',
                  isActive ? 'bg-[var(--color-cream-2)] text-[var(--color-indigo)]' : 'text-[var(--color-stone)] hover:bg-[var(--color-cream-2)]',
                )}
              >
                {({ isActive }) => <NavIcon label="Inbox" active={isActive} />}
              </NavLink>
            </div>
          </header>
        )}

        {/* Tablet header */}
        {bp === 'tablet' && (
          <header className="h-12 px-5 flex items-center justify-between shrink-0 border-b border-[var(--color-hairline)] bg-[var(--color-paper)]">
            <span className="text-[13px] font-semibold text-[var(--color-indigo)] uppercase tracking-wider">{roleLabels[role]}</span>
            <div className="flex items-center gap-1">
              {roles.length > 1 && <MobileRoleSwitcher roles={roles} current={role} />}
              {isSteward && (
                <Link to="/steward" className="flex items-center justify-center w-9 h-9 rounded-[10px] text-[var(--color-clay)] hover:bg-[rgba(217,119,87,0.08)] transition-colors" title="Steward">
                  <RoleIcon role="steward" active={false} />
                </Link>
              )}
              <NavLink
                to="/notifications"
                className={({ isActive }) => cn(
                  'flex items-center justify-center w-9 h-9 rounded-[10px] transition-colors',
                  isActive ? 'bg-[var(--color-cream-2)] text-[var(--color-indigo)]' : 'text-[var(--color-stone)] hover:bg-[var(--color-cream-2)]',
                )}
              >
                {({ isActive }) => <NavIcon label="Inbox" active={isActive} />}
              </NavLink>
            </div>
          </header>
        )}

        {/* Email verify banner */}
        {user && !user.emailVerifiedAt && (
          <div
            className="mx-4 mt-3 mb-0 rounded-[12px] px-4 py-2.5 flex items-center justify-between"
            style={{ background: 'rgba(217,119,87,0.10)', border: '1px solid rgba(217,119,87,0.25)' }}
          >
            <p className="text-[11px] text-[var(--color-clay)]">Email not verified</p>
            <Link to="/account/verify-email" className="text-[11px] font-medium text-[var(--color-clay)] underline underline-offset-[3px]">Verify →</Link>
          </div>
        )}

        {/* Page content */}
        <main className={cn(
          'flex-1 bg-[var(--color-cream)]',
          isMobile ? 'px-4 pt-5 pb-24' : bp === 'tablet' ? 'px-6 py-6' : 'px-[150px] py-8',
        )}>
          {/*
            Page transition wrapper.

            Earlier we used <AnimatePresence mode="wait"> around <Outlet/>,
            which caused a known footgun: React Router immediately swaps
            the Outlet's content on navigation, but `mode="wait"` blocks
            the new wrapper from mounting until the OLD wrapper finishes
            its exit animation. During that gap, the new page's mount
            effects could lose a race condition and render blank until a
            manual refresh.

            The Outlet now sits OUTSIDE AnimatePresence, so it always
            mounts immediately on navigation. The motion.div is keyed on
            the pathname and animates content in without blocking on
            anything previous — no `mode="wait"`, no deadlock.
          */}
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <Outlet />
          </motion.div>
        </main>

        {/* Mobile bottom nav */}
        {isMobile && (
          <nav className="fixed bottom-0 inset-x-0 bg-[var(--color-paper)]/96 backdrop-blur-md border-t border-[var(--color-hairline)] z-50">
            {/*
              Inline grid-template-columns is intentional: Tailwind's
              `grid-cols-N` utilities are generated at build time from
              static class names. A template literal like
              `grid-cols-${allNav.length}` never makes it into the CSS
              bundle, so the class doesn't exist at runtime and the layout
              silently breaks. Using inline style sidesteps the purge.
            */}
            <div
              className="grid"
              style={{ gridTemplateColumns: `repeat(${allNav.length}, minmax(0, 1fr))` }}
            >
              {allNav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={['/', '/give', '/ride', '/drive'].includes(item.to)}
                  className={({ isActive }) => cn(
                    'py-2.5 flex flex-col items-center gap-1 transition-colors relative',
                    isActive ? 'text-[var(--color-indigo)]' : 'text-[var(--color-stone)]',
                  )}
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span
                          layoutId="mobile-nav-bar"
                          className="absolute top-0 inset-x-3 h-[2px] bg-[var(--color-indigo)] rounded-full"
                          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        />
                      )}
                      <motion.span
                        animate={{ scale: isActive ? 1.1 : 1 }}
                        transition={{ duration: 0.15 }}
                        className="flex items-center justify-center"
                      >
                        <NavIcon label={item.label} active={isActive} />
                      </motion.span>
                      <span className="text-[9px] font-medium tracking-wide uppercase leading-none">{item.label}</span>
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

// ─── Mobile role switcher ─────────────────────────────────────────────────────

function MobileRoleSwitcher({ roles, current }: { roles: Role[]; current: Role }) {
  const visible = roles.filter(r => r !== 'steward')
  if (visible.length <= 1) return null

  return (
    <div className="flex items-center gap-0.5 rounded-[11px] border border-[var(--color-hairline)] bg-[var(--color-cream)] p-1">
      {visible.map((r) => {
        const isActive = r === current
        const colors = roleColors[r]
        return (
          <Link
            key={r}
            to={roleRoutes[r]}
            title={roleLabels[r]}
            className={cn(
              'relative flex items-center gap-1.5 pl-2 pr-3 h-7 rounded-[8px] text-[11px] font-semibold transition-colors',
              isActive ? '' : 'text-[var(--color-stone)] hover:text-[var(--color-ink)]',
            )}
            style={isActive ? { color: colors.fg } : {}}
          >
            {isActive && (
              <motion.div
                layoutId="mobile-role-bg"
                className="absolute inset-0 rounded-[8px]"
                style={{ background: colors.bg }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative shrink-0">
              <RoleIcon role={r} active={isActive} />
            </span>
            <span className="relative">{roleLabels[r]}</span>
          </Link>
        )
      })}
    </div>
  )
}

// SharedRoleShell — used for routes that aren't bound to a single rail
// (Account, Notifications, email verification). Reads the last role the
// user was active in and renders the matching shell. Defaults to giver
// for new sessions where no rail has been visited yet.
export function SharedRoleShell() {
  return <RoleShell role={getActiveRole()} />
}
