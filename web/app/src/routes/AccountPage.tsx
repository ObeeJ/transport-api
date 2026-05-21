import { Link } from 'react-router'
import { motion } from 'motion/react'
import { useAuth } from '@/lib/auth'
import { useRoles, roleLabels } from '@/lib/useRoles'
import { fadeUp, stagger, transition } from '@/lib/motion'

const roleColors: Record<string, { bg: string; fg: string }> = {
  giver:   { bg: 'rgba(27,42,78,0.08)',   fg: 'var(--color-indigo)' },
  commuter: { bg: 'rgba(94,114,89,0.10)',  fg: 'var(--color-moss)'   },
  driver:  { bg: 'rgba(217,119,87,0.12)', fg: 'var(--color-clay)'   },
  steward: { bg: 'rgba(200,75,58,0.10)',  fg: 'var(--color-coral)'  },
}

export function AccountPage() {
  const { user, logout } = useAuth()
  const roles = useRoles()

  return (
    <motion.div
      variants={stagger(0.07, 0.04)}
      initial="hidden"
      animate="show"
      className="space-y-4"
    >
      {/* Header */}
      <motion.div variants={fadeUp} transition={transition.default}>
        <h2 className="text-[28px] font-medium tracking-tight text-[var(--color-indigo)] leading-tight">
          Account
        </h2>
        <p className="mt-1 text-[12px] text-[var(--color-stone)]">
          {user?.email}
        </p>
      </motion.div>

      {/* Email verification banner — only if unverified */}
      {!user?.emailVerifiedAt && (
        <motion.div
          variants={fadeUp}
          transition={transition.default}
          className="rounded-[14px] px-4 py-3.5 flex items-center justify-between"
          style={{ background: 'rgba(217,119,87,0.10)', border: '1px solid rgba(217,119,87,0.25)' }}
        >
          <div>
            <p className="text-[12px] font-medium text-[var(--color-clay)]">Email not verified</p>
            <p className="text-[11px] text-[var(--color-clay)]/70 mt-0.5">
              Verify to apply for support or unlock all features.
            </p>
          </div>
          <Link
            to="/account/verify-email"
            className="shrink-0 ml-4 h-8 px-3 rounded-[10px] text-xs font-semibold bg-[var(--color-clay)] text-white hover:opacity-90 transition-opacity"
          >
            Verify now
          </Link>
        </motion.div>
      )}

      {/* Profile */}
      <motion.div variants={fadeUp} transition={transition.default} className="card-base overflow-hidden">
        <div className="px-5 pt-4 pb-1">
          <div className="label-cap mb-4">Profile</div>
          <div className="space-y-4">
            <Field label="Email">
              <span className="text-[13px] text-[var(--color-ink)]">{user?.email}</span>
              {user?.emailVerifiedAt && (
                <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(94,114,89,0.12)', color: 'var(--color-moss)' }}>
                  verified
                </span>
              )}
            </Field>
            <div className="h-px bg-[var(--color-hairline)]" />
            <Field label="Phone">
              <span className="text-[13px] font-mono text-[var(--color-ink)]">{user?.phone ?? '—'}</span>
            </Field>
            <div className="h-px bg-[var(--color-hairline)]" />
            <Field label="Member since">
              <span className="text-[13px] text-[var(--color-stone)]">
                {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' }) : '—'}
              </span>
            </Field>
          </div>
        </div>
        <div className="h-4" />
      </motion.div>

      {/* Active roles */}
      <motion.div variants={fadeUp} transition={transition.default} className="card-base p-5">
        <div className="label-cap mb-3">Active roles</div>
        <div className="flex flex-wrap gap-2">
          {roles.map((r) => {
            const c = roleColors[r] ?? roleColors.giver
            return (
              <span
                key={r}
                className="px-3 py-1.5 rounded-full text-[11px] font-semibold uppercase tracking-wide"
                style={{ background: c.bg, color: c.fg }}
              >
                {roleLabels[r]}
              </span>
            )
          })}
        </div>
        <p className="mt-3 text-[11px] text-[var(--color-stone)] leading-relaxed">
          Roles unlock automatically. Apply to drive or receive support to add more.
        </p>
      </motion.div>

      {/* Student ID */}
      <motion.div variants={fadeUp} transition={transition.default} className="card-base p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="label-cap mb-1">Student ID</div>
            <p className="text-[12px] text-[var(--color-stone)] leading-relaxed">
              Required before applying for transport support. Your ID is hashed — the raw number is never stored.
            </p>
          </div>
          <Link
            to="/support/verify"
            className="shrink-0 h-8 px-3 rounded-[10px] border border-[var(--color-hairline)] text-xs font-medium flex items-center text-[var(--color-ink)] hover:bg-[var(--color-cream-2)] transition-colors"
          >
            Verify →
          </Link>
        </div>
      </motion.div>

      {/* Sign out */}
      <motion.div variants={fadeUp} transition={transition.default} className="card-base p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] font-medium text-[var(--color-ink)]">Sign out</p>
            <p className="text-[11px] text-[var(--color-stone)] mt-0.5">You'll need to sign back in to access your account.</p>
          </div>
          <button
            onClick={() => logout()}
            className="shrink-0 h-9 px-4 rounded-[10px] border border-[var(--color-coral)]/30 text-[var(--color-coral)] text-xs font-medium hover:bg-[rgba(200,75,58,0.06)] transition-colors"
          >
            Sign out
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-[var(--color-stone)] uppercase tracking-wider shrink-0">{label}</span>
      <div className="flex items-center">{children}</div>
    </div>
  )
}
