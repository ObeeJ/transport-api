import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { motion } from 'motion/react'
import { api, ApiError } from '@/lib/api'

export function ResetConfirm() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await api.post('/auth/password/reset/confirm', { token, newPassword: password })
      setDone(true)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.code === 'reset_token_invalid' ? 'This link has expired or is invalid.' : err.message)
      } else {
        setError('Something went wrong.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto min-h-dvh w-full max-w-[420px] px-6 pt-12 pb-10 flex flex-col items-center justify-center"
      >
        <h1 className="text-[24px] font-medium tracking-tight text-[var(--color-indigo)]">Password updated</h1>
        <p className="mt-4 text-[13px] text-[var(--color-stone)] text-center leading-relaxed">
          Your password has been reset and all sessions have been signed out.
        </p>
        <Link to="/onboarding" className="mt-8 btn-primary px-8 py-3">
          Sign in
        </Link>
      </motion.div>
    )
  }

  if (!token) {
    return (
      <div className="mx-auto min-h-dvh w-full max-w-[420px] px-6 pt-12 flex flex-col items-center justify-center">
        <p className="text-[14px] text-[var(--color-stone)]">Invalid or missing reset link.</p>
        <Link to="/onboarding" className="mt-4 text-[13px] text-[var(--color-indigo)] underline">Back to sign in</Link>
      </div>
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
        Set a new password
      </h1>

      <label className="block mt-8">
        <span className="label-cap">New password</span>
        <div className="card-base px-4 py-3.5 bg-[var(--color-cream)] mt-2">
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--color-stone-soft)]"
          />
        </div>
        <span className="text-[10px] text-[var(--color-stone)] mt-1 block">Minimum 8 characters</span>
      </label>

      {error && <p className="mt-4 text-[12px] text-[var(--color-coral)]">{error}</p>}

      <div className="flex-1" />

      <button type="submit" disabled={submitting} className="btn-primary w-full mt-8 h-[52px]">
        {submitting ? 'Resetting…' : 'Reset password'}
      </button>
    </motion.form>
  )
}
