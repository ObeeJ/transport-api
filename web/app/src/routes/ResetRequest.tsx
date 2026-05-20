import { useState } from 'react'
import { Link } from 'react-router'
import { motion } from 'motion/react'
import { api } from '@/lib/api'

export function ResetRequest() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await api.post('/auth/password/reset/request', { email })
    } catch {
      // silent — don't reveal whether email exists
    } finally {
      setSubmitted(true)
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto min-h-dvh w-full max-w-[420px] px-6 pt-12 pb-10 flex flex-col items-center justify-center"
      >
        <h1 className="text-[24px] font-medium tracking-tight text-[var(--color-indigo)]">Check your email</h1>
        <p className="mt-4 text-[13px] text-[var(--color-stone)] text-center leading-relaxed">
          If an account exists for <strong className="text-[var(--color-ink)]">{email}</strong>, we sent a reset link. It expires in 1 hour.
        </p>
        <Link to="/onboarding" className="mt-8 text-[13px] text-[var(--color-indigo)] underline underline-offset-[3px]">
          Back to sign in
        </Link>
      </motion.div>
    )
  }

  return (
    <motion.form
      onSubmit={onSubmit}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto min-h-dvh w-full max-w-[420px] px-6 pt-12 pb-10 flex flex-col"
    >
      <span className="text-[24px] font-medium tracking-tight text-[var(--color-indigo)]">
        akin<span className="text-[var(--color-clay)]">.</span>
      </span>

      <h1 className="mt-10 text-[28px] font-medium tracking-tight text-[var(--color-indigo)]">
        Reset your password
      </h1>
      <p className="mt-3 text-[13px] text-[var(--color-stone)] leading-relaxed">
        Enter your email and we'll send a link to set a new password.
      </p>

      <label className="block mt-8">
        <span className="label-cap">Email</span>
        <div className="card-base px-4 py-3.5 bg-[var(--color-cream)] mt-2">
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@school.edu.ng"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--color-stone-soft)]"
          />
        </div>
      </label>

      <div className="flex-1" />

      <button type="submit" disabled={submitting} className="btn-primary w-full mt-8 h-[52px]">
        {submitting ? 'Sending…' : 'Send reset link'}
      </button>
      <Link to="/onboarding" className="block text-center mt-4 text-[12px] text-[var(--color-stone)] underline underline-offset-[3px]">
        Back to sign in
      </Link>
    </motion.form>
  )
}
