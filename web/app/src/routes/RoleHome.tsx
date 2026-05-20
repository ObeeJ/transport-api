import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { useAuth } from '@/lib/auth'
import { useRoles, roleRoutes } from '@/lib/useRoles'
import { fadeUp, fadeIn, stagger, ease, transition } from '@/lib/motion'

const roleConfig = {
  giver: {
    label: 'Give',
    sub: 'Add to the pool. Any amount, any time.',
    color: 'var(--color-indigo)',
    iconFill: 'rgba(27,42,78,0.10)',
    bg: 'linear-gradient(135deg, #F5EFE6 0%, #EDE5D7 100%)',
  },
  rider: {
    label: 'Ride',
    sub: 'Find a seat. Book a trip from a hub.',
    color: 'var(--color-moss)',
    iconFill: 'rgba(94,114,89,0.12)',
    bg: 'linear-gradient(135deg, #EEF3EC 0%, #E0EAD8 100%)',
  },
  driver: {
    label: 'Drive',
    sub: 'Donate a seat. Publish a trip.',
    color: 'var(--color-clay)',
    iconFill: 'rgba(217,119,87,0.12)',
    bg: 'linear-gradient(135deg, #FBF1E7 0%, #F2E4D0 100%)',
  },
  steward: {
    label: 'Steward',
    sub: 'Review applications. Manage payouts.',
    color: 'var(--color-coral)',
    iconFill: 'rgba(200,75,58,0.10)',
    bg: 'linear-gradient(135deg, #FBF8F2 0%, #F0E8E0 100%)',
  },
} as const

function RoleIcon({ role, color, fill }: { role: keyof typeof roleConfig; color: string; fill: string }) {
  switch (role) {
    case 'giver':
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <circle cx="14" cy="14" r="11" fill={fill} stroke={color} strokeWidth="1.5" />
          <path d="M14 19v-9M10.5 13.5 14 10l3.5 3.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'rider':
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <circle cx="14" cy="8" r="3" fill={fill} stroke={color} strokeWidth="1.5" />
          <path d="M9 14c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
          <path d="M8 20h12M11 20v-4h6v4" fill={fill} stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'driver':
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <circle cx="14" cy="14" r="10" fill={fill} stroke={color} strokeWidth="1.5" />
          <circle cx="14" cy="14" r="3" fill={color} />
          <path d="M14 11V7M9.27 16.5 5.8 18.5M18.73 16.5l3.47 2" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
    case 'steward':
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path d="M14 4 6 7.5v7c0 4.42 3.4 8.56 8 9.5 4.6-.94 8-5.08 8-9.5v-7L14 4Z" fill={fill} stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M10.5 14.5l2.5 2.5 4.5-5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
  }
}

export function RoleHome() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const roles = useRoles()

  useEffect(() => {
    if (roles.length === 1 && roles[0] === 'giver') {
      navigate('/give', { replace: true })
    }
  }, [roles, navigate])

  if (roles.length === 1) return null

  const firstName = user?.email?.split('@')[0] ?? ''

  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center px-6 py-12"
      style={{
        background:
          'radial-gradient(at 20% 20%, rgba(217,119,87,0.07) 0, transparent 50%), radial-gradient(at 80% 80%, rgba(27,42,78,0.07) 0, transparent 50%), var(--color-cream)',
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
          className="text-[22px] font-medium tracking-tight text-[var(--color-indigo)]"
        >
          akin<span className="text-[var(--color-clay)]">.</span>
        </motion.div>

        {/* Greeting */}
        <motion.h1
          variants={fadeUp}
          transition={transition.default}
          className="mt-6 text-[32px] leading-tight font-medium tracking-tight text-[var(--color-indigo)]"
        >
          Good to see you,
          <br />
          <span className="text-[var(--color-stone)]">{firstName}.</span>
        </motion.h1>

        <motion.p
          variants={fadeUp}
          transition={transition.default}
          className="mt-2 text-[13px] text-[var(--color-stone)]"
        >
          What would you like to do today?
        </motion.p>

        {/* Role cards */}
        <motion.div variants={stagger(0.09, 0.15)} initial="hidden" animate="show" className="mt-8 space-y-3">
          {roles.map((role) => {
            const cfg = roleConfig[role]
            return (
              <motion.button
                key={role}
                variants={fadeUp}
                transition={transition.default}
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate(role === 'steward' ? '/steward' : roleRoutes[role])}
                className="w-full text-left rounded-[18px] p-5 border border-[var(--color-hairline)]"
                style={{ background: cfg.bg }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <motion.span
                        initial={{ scale: 0.7, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.35, ease }}
                      >
                        <RoleIcon role={role} color={cfg.color} fill={cfg.iconFill} />
                      </motion.span>
                      <span className="text-base font-medium tracking-tight" style={{ color: cfg.color }}>
                        {cfg.label}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[12px] text-[var(--color-stone)]">{cfg.sub}</p>
                  </div>
                  <motion.span
                    className="text-[var(--color-stone-soft)] text-lg"
                    initial={{ x: -4, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ duration: 0.3, delay: 0.3, ease }}
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
