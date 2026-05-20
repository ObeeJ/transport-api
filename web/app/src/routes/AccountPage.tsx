import { Link } from 'react-router'
import { motion } from 'motion/react'
import { useAuth } from '@/lib/auth'
import { useRoles, roleLabels } from '@/lib/useRoles'
import { fadeUp, stagger, transition } from '@/lib/motion'

export function AccountPage() {
  const { user, logout } = useAuth()
  const roles = useRoles()

  return (
    <motion.div
      variants={stagger(0.07, 0.04)}
      initial="hidden"
      animate="show"
      className="pt-4 space-y-4"
    >
      <motion.h2
        variants={fadeUp}
        transition={transition.default}
        className="text-[28px] font-medium tracking-tight text-[var(--color-indigo)] leading-tight"
      >
        Account.
      </motion.h2>

      <motion.div variants={fadeUp} transition={transition.default} className="card-base p-5">
        <div className="label-cap mb-3">Profile</div>
        <div className="space-y-3">
          <Row label="Email" value={user?.email ?? '—'} />
          <Row label="Phone" value={user?.phone ?? '—'} />
          <Row label="Role" value={user?.role ?? '—'} mono />
          <Row
            label="Email verified"
            value={user?.emailVerifiedAt ? new Date(user.emailVerifiedAt).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not verified'}
            tone={user?.emailVerifiedAt ? 'moss' : 'clay'}
          />
        </div>
        {!user?.emailVerifiedAt && (
          <Link
            to="/account/verify-email"
            className="mt-4 inline-flex h-9 px-4 rounded-[12px] border border-[var(--color-clay)]/40 text-[var(--color-clay)] text-xs font-medium items-center"
          >
            Verify email →
          </Link>
        )}
      </motion.div>

      <motion.div variants={fadeUp} transition={transition.default} className="card-base p-5">
        <div className="label-cap mb-3">Your roles</div>
        <div className="flex flex-wrap gap-2">
          {roles.map((r) => (
            <span
              key={r}
              className="px-3 py-1 rounded-full text-[11px] font-medium uppercase tracking-wide bg-[var(--color-cream-2)] text-[var(--color-indigo)]"
            >
              {roleLabels[r]}
            </span>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-[var(--color-stone)]">
          Roles are unlocked automatically — apply to drive or receive support to add more.
        </p>
      </motion.div>

      <motion.div variants={fadeUp} transition={transition.default} className="card-base p-5">
        <div className="label-cap mb-2">Student ID verification</div>
        <p className="text-[12px] text-[var(--color-stone)]">
          Required before applying for support. One-way hash — never stored in plain text.
        </p>
        <Link
          to="/support/verify"
          className="mt-3 inline-flex h-9 px-4 rounded-[12px] border border-[var(--color-hairline)] text-xs font-medium items-center text-[var(--color-ink)]"
        >
          Verify student ID →
        </Link>
      </motion.div>

      <motion.div variants={fadeUp} transition={transition.default} className="card-base p-5">
        <button
          onClick={() => logout()}
          className="w-full h-11 rounded-[12px] border border-[var(--color-hairline)] text-sm text-[var(--color-stone)] hover:text-[var(--color-coral)] hover:border-[var(--color-coral)]/30 transition-colors"
        >
          Sign out
        </button>
      </motion.div>

      <motion.p
        variants={fadeUp}
        transition={transition.slow}
        className="text-[10px] text-center text-[var(--color-stone)] pb-4"
      >
        Member since {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' }) : '—'}
      </motion.p>
    </motion.div>
  )
}

function Row({ label, value, mono, tone }: { label: string; value: string; mono?: boolean; tone?: 'moss' | 'clay' }) {
  const valueColor = tone === 'moss' ? 'var(--color-moss)' : tone === 'clay' ? 'var(--color-clay)' : 'var(--color-ink)'
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-[var(--color-stone)] uppercase tracking-wider">{label}</span>
      <span className={`text-sm ${mono ? 'font-mono' : ''}`} style={{ color: valueColor }}>{value}</span>
    </div>
  )
}
