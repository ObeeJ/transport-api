import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { useAuth } from '@/lib/auth'
import { useRoles, roleRoutes } from '@/lib/useRoles'

const roleConfig = {
  giver: {
    label: 'Give',
    sub: 'Add to the pool. Any amount, any time.',
    icon: '◎',
    color: 'var(--color-indigo)',
    bg: 'linear-gradient(135deg, #F5EFE6 0%, #EDE5D7 100%)',
  },
  rider: {
    label: 'Ride',
    sub: 'Find a seat. Book a trip from a hub.',
    icon: '◈',
    color: 'var(--color-moss)',
    bg: 'linear-gradient(135deg, #EEF3EC 0%, #E0EAD8 100%)',
  },
  driver: {
    label: 'Drive',
    sub: 'Donate a seat. Publish a trip.',
    icon: '◇',
    color: 'var(--color-clay)',
    bg: 'linear-gradient(135deg, #FBF1E7 0%, #F2E4D0 100%)',
  },
  steward: {
    label: 'Steward',
    sub: 'Review applications. Manage payouts.',
    icon: '◉',
    color: 'var(--color-coral)',
    bg: 'linear-gradient(135deg, #FBF8F2 0%, #F0E8E0 100%)',
  },
} as const

export function RoleHome() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const roles = useRoles()

  // If only one role (giver), skip the picker and go straight to /give
  useEffect(() => {
    if (roles.length === 1 && roles[0] === 'giver') {
      navigate('/give', { replace: true })
    }
  }, [roles, navigate])

  if (roles.length === 1) return null

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 py-12"
      style={{
        background: 'radial-gradient(at 20% 20%, rgba(217,119,87,0.07) 0, transparent 50%), radial-gradient(at 80% 80%, rgba(27,42,78,0.07) 0, transparent 50%), var(--color-cream)',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
        className="w-full max-w-[420px]"
      >
        <div className="text-[22px] font-medium tracking-tight text-[var(--color-indigo)]">
          akin<span className="text-[var(--color-clay)]">.</span>
        </div>
        <h1 className="mt-6 text-[32px] leading-tight font-medium tracking-tight text-[var(--color-indigo)]">
          Good to see you,<br />
          <span className="text-[var(--color-stone)]">{user?.email?.split('@')[0]}.</span>
        </h1>
        <p className="mt-2 text-[13px] text-[var(--color-stone)]">What would you like to do today?</p>

        <div className="mt-8 space-y-3">
          {roles.map((role, i) => {
            const cfg = roleConfig[role]
            return (
              <motion.button
                key={role}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.1 + i * 0.07, ease: [0.25, 0.1, 0.25, 1] }}
                onClick={() => navigate(role === 'steward' ? '/steward' : roleRoutes[role])}
                className="w-full text-left rounded-[18px] p-5 border border-[var(--color-hairline)] transition-transform active:scale-[0.98]"
                style={{ background: cfg.bg }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xl" style={{ color: cfg.color }}>{cfg.icon}</span>
                      <span className="text-base font-medium tracking-tight" style={{ color: cfg.color }}>{cfg.label}</span>
                    </div>
                    <p className="mt-1 text-[12px] text-[var(--color-stone)]">{cfg.sub}</p>
                  </div>
                  <span className="text-[var(--color-stone-soft)] text-lg">→</span>
                </div>
              </motion.button>
            )
          })}
        </div>
      </motion.div>
    </div>
  )
}
