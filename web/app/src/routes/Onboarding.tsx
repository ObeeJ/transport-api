import { useState } from 'react'
import { useNavigate, Link } from 'react-router'
import { motion } from 'motion/react'
import { useAuth } from '@/lib/auth'
import { ApiError } from '@/lib/api'

type Mode = 'signup' | 'login'

export function Onboarding() {
  const navigate = useNavigate()
  const { signup, login } = useAuth()
  const [mode, setMode] = useState<Mode>('signup')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      if (mode === 'signup') {
        await signup({ email, firstName, lastName, phone, password })
      } else {
        await login({ email, password })
      }
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        setError(humanizeError(err.code ?? err.message))
      } else {
        setError('Something went wrong. Try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <motion.form
      onSubmit={onSubmit}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      className="mx-auto min-h-dvh w-full max-w-[420px] px-6 pt-12 pb-10 flex flex-col"
    >
      <div className="flex items-center justify-between">
        <span className="text-[24px] font-medium tracking-tight text-[var(--color-indigo)]">
          akin<span className="text-[var(--color-clay)]">.</span>
        </span>
        <button
          type="button"
          onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}
          className="label-cap hover:text-[var(--color-ink)] transition-colors"
        >
          {mode === 'signup' ? 'Sign in instead' : 'Create account'}
        </button>
      </div>

      <h1 className="mt-10 text-[36px] leading-[1.05] font-medium tracking-tight text-[var(--color-indigo)]">
        Class transport,<br />together.
      </h1>
      <p className="mt-4 text-[13px] leading-relaxed text-[var(--color-stone)]">
        A shared fund and a ride network for your class. Give when you can. Ride when you need to. Anonymously, either way.
      </p>

      <div className="mt-8 space-y-4">
        {mode === 'signup' ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name">
              <input
                required
                autoComplete="given-name"
                placeholder="Ayo"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--color-stone-soft)]"
              />
            </Field>
            <Field label="Last name">
              <input
                autoComplete="family-name"
                placeholder="Bello"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--color-stone-soft)]"
              />
            </Field>
          </div>
        ) : null}

        <Field label="Email">
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@school.edu.ng"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--color-stone-soft)]"
          />
        </Field>

        {mode === 'signup' ? (
          <Field
            label={<span>Phone <span className="text-[var(--color-clay)]">*</span></span>}
            hint="for SOS &amp; account recovery only"
          >
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm text-[var(--color-stone)]">+234</span>
              <span className="h-5 w-px bg-[var(--color-hairline)]" />
              <input
                type="tel"
                required
                autoComplete="tel-national"
                placeholder="803 000 0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-stone-soft)]"
              />
            </div>
          </Field>
        ) : null}

        <Field label="Password" hint={mode === 'signup' ? 'minimum 8 characters' : undefined}>
          <input
            type="password"
            required
            minLength={8}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--color-stone-soft)]"
          />
        </Field>
      </div>

      {error ? (
        <p className="mt-4 text-[12px] text-[var(--color-coral)]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex-1" />

      <button
        type="submit"
        disabled={submitting}
        className="btn-primary w-full mt-8 h-[52px]"
      >
        {submitting ? 'Working…' : mode === 'signup' ? 'Continue' : 'Sign in'}
      </button>
      <p className="text-center text-[11px] mt-4 text-[var(--color-stone)]">
        By continuing you accept our{' '}
        <a className="text-[var(--color-ink)] underline underline-offset-[3px]">privacy promise</a>.
      </p>
      {mode === 'login' ? (
        <Link
          to="/reset-password"
          className="mt-3 text-center text-[11px] text-[var(--color-stone)] underline underline-offset-[3px]"
        >
          Forgot password?
        </Link>
      ) : null}
    </motion.form>
  )
}

function Field({ label, hint, children }: { label: React.ReactNode; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-2">
        <span className="label-cap">{label}</span>
        {hint ? (
          <span className="text-[10px] text-[var(--color-stone)] normal-case tracking-normal">{hint}</span>
        ) : null}
      </div>
      <div className="card-base px-4 py-3.5 bg-[var(--color-cream)]">{children}</div>
    </label>
  )
}

function humanizeError(code: string): string {
  switch (code) {
    case 'email_taken':
      return 'That email is already in use. Try signing in instead.'
    case 'email_invalid':
      return 'That email doesn’t look right.'
    case 'phone_invalid':
      return 'Phone must be a valid Nigerian number.'
    case 'password_too_short':
      return 'Password must be at least 8 characters.'
    case 'invalid_credentials':
      return 'Email or password is incorrect.'
    default:
      return 'Could not complete. Please try again.'
  }
}
