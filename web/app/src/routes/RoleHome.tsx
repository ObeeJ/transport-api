import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { useAuth } from '@/lib/auth'
import { useRoles, roleRoutes } from '@/lib/useRoles'
import { fadeUp, fadeIn, stagger, transition } from '@/lib/motion'

const roleConfig = {
  giver: {
    label: 'Give',
    sub: 'Add to the pool. Any amount, any time.',
    color: 'var(--color-indigo)',
    glowClass: 'glow-indigo',
    iconPrimary: 'var(--color-indigo)',
    iconSecondary: 'var(--color-clay)',
    bg: 'linear-gradient(135deg, rgba(251, 248, 242, 0.95) 0%, rgba(237, 229, 215, 0.8) 100%)',
  },
  commuter: {
    label: 'Commute',
    sub: 'Find a seat. Book a trip from a hub.',
    color: 'var(--color-moss)',
    glowClass: 'glow-moss',
    iconPrimary: 'var(--color-moss)',
    iconSecondary: 'var(--color-clay)',
    bg: 'linear-gradient(135deg, rgba(251, 248, 242, 0.95) 0%, rgba(224, 234, 216, 0.7) 100%)',
  },
  driver: {
    label: 'Drive',
    sub: 'Donate a seat. Publish a trip.',
    color: 'var(--color-clay)',
    glowClass: 'glow-clay',
    iconPrimary: 'var(--color-clay)',
    iconSecondary: 'var(--color-indigo)',
    bg: 'linear-gradient(135deg, rgba(251, 248, 242, 0.95) 0%, rgba(242, 228, 208, 0.7) 100%)',
  },
  steward: {
    label: 'Steward',
    sub: 'Review applications. Manage payouts.',
    color: 'var(--color-coral)',
    glowClass: 'glow-coral',
    iconPrimary: 'var(--color-coral)',
    iconSecondary: 'var(--color-indigo)',
    bg: 'linear-gradient(135deg, rgba(251, 248, 242, 0.95) 0%, rgba(240, 232, 224, 0.7) 100%)',
  },
} as const

function RoleIcon({ role, primary, secondary }: { role: keyof typeof roleConfig; primary: string; secondary: string }) {
  switch (role) {
    case 'giver':
      return (
        <svg width="32" height="32" viewBox="0 0 28 28" fill="none">
          <circle cx="14" cy="14" r="11" stroke={primary} strokeWidth="2" />
          <circle cx="14" cy="14" r="4" fill={secondary} />
          <path d="M14 8v12M8 14h12" stroke={primary} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
    case 'commuter':
      return (
        <svg width="32" height="32" viewBox="0 0 28 28" fill="none">
          <circle cx="14" cy="9" r="3.5" fill={secondary} stroke={primary} strokeWidth="1.5" />
          <path d="M7 16c0-3 3-5 7-5s7 2 7 5" stroke={primary} strokeWidth="2" strokeLinecap="round" />
          <path d="M8 22h12M11 22v-3.5h6V22" stroke={primary} strokeWidth="2" strokeLinecap="round" />
        </svg>
      )
    case 'driver':
      return (
        <svg width="32" height="32" viewBox="0 0 28 28" fill="none">
          <circle cx="14" cy="14" r="11" stroke={primary} strokeWidth="2" />
          <circle cx="14" cy="14" r="3.5" fill={secondary} />
          <path d="M14 9V5M8.5 17.5l-3.5 2M19.5 17.5l3.5 2" stroke={primary} strokeWidth="2" strokeLinecap="round" />
        </svg>
      )
    case 'steward':
      return (
        <svg width="32" height="32" viewBox="0 0 28 28" fill="none">
          <path d="M14 3L5 7v7c0 5 4 9 9 11 5-2 9-6 9-11V7l-9-4z" stroke={primary} strokeWidth="2" strokeLinejoin="round" />
          <circle cx="14" cy="12" r="3" fill={secondary} />
          <path d="M10 17l4 2 4-2" stroke={primary} strokeWidth="2" strokeLinecap="round" />
        </svg>
      )
  }
}

export function RoleHome() {
  const { user, status } = useAuth()
  const navigate = useNavigate()
  const roles = useRoles()

  useEffect(() => {
    // Wait for auth to finish loading before redirecting
    if (status !== 'authenticated') return
    if (!roles.includes('driver') && !roles.includes('steward')) {
      navigate('/give', { replace: true })
    }
  }, [roles, navigate, status])

  // Show nothing while auth is loading or redirect is pending
  if (status === 'loading' || (!roles.includes('driver') && !roles.includes('steward'))) {
    return null
  }

  const firstName = user?.email?.split('@')[0] ?? ''

  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center px-6 py-12"
      style={{
        background:
          'radial-gradient(at 15% 15%, rgba(217,119,87,0.08) 0, transparent 50%), radial-gradient(at 85% 85%, rgba(27,42,78,0.08) 0, transparent 50%), var(--color-paper)',
      }}
    >
      <motion.div
        variants={stagger(0.08, 0)}
        initial="hidden"
        animate="show"
        className="w-full max-w-[420px]"
      >
        {/* Wordmark */}
        <motion.div
          variants={fadeIn}
          transition={transition.fast}
          className="text-[24px] font-semibold tracking-tight text-[var(--color-indigo)]"
        >
          akin<span className="text-[var(--color-clay)]">.</span>
        </motion.div>

        {/* Greeting */}
        <motion.h1
          variants={fadeUp}
          transition={transition.default}
          className="mt-8 text-[36px] leading-tight font-medium tracking-tight text-[var(--color-indigo)]"
        >
          Good to see you,
          <br />
          <span className="text-[var(--color-stone)] capitalize font-semibold">{firstName}.</span>
        </motion.h1>

        <motion.p
          variants={fadeUp}
          transition={transition.default}
          className="mt-3 text-[14px] text-[var(--color-stone)]"
        >
          What would you like to do today?
        </motion.p>

        {/* Role cards */}
        <motion.div variants={stagger(0.08, 0.15)} initial="hidden" animate="show" className="mt-8 space-y-4">
          {roles.map((role) => {
            const cfg = roleConfig[role]
            return (
              <motion.button
                key={role}
                variants={fadeUp}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                whileHover={{ scale: 1.025, y: -2 }}
                whileTap={{ scale: 0.975 }}
                onClick={() => navigate(role === 'steward' ? '/steward' : roleRoutes[role])}
                className={`w-full text-left rounded-[18px] p-5 border border-[var(--color-hairline)] transition-all ${cfg.glowClass} hover:border-[var(--color-stone-soft)] cursor-pointer`}
                style={{ background: cfg.bg }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <motion.span
                        initial={{ scale: 0.75, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.4, type: 'spring', stiffness: 200 }}
                        className="flex items-center justify-center p-2 rounded-xl bg-white/60 shadow-sm"
                      >
                        <RoleIcon role={role} primary={cfg.iconPrimary} secondary={cfg.iconSecondary} />
                      </motion.span>
                      <div>
                        <span className="text-[17px] font-bold tracking-tight block" style={{ color: cfg.color }}>
                          {cfg.label}
                        </span>
                        <p className="mt-1 text-[12px] leading-snug text-[var(--color-stone)] pr-2">{cfg.sub}</p>
                      </div>
                    </div>
                  </div>
                  <motion.span
                    className="text-[var(--color-stone)] font-bold text-xl ml-2 w-8 h-8 rounded-full bg-white/50 flex items-center justify-center shadow-sm"
                    whileHover={{ x: 3, backgroundColor: 'rgba(255,255,255,0.9)' }}
                    transition={{ duration: 0.2 }}
                  >
                    →
                  </motion.span>
                </div>
              </motion.button>
            )
          })}
        </motion.div>
      </motion.div>
    </div>
  )
}
