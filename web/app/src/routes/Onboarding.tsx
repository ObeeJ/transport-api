import { useState } from 'react'
import { useNavigate, Link } from 'react-router'
import { motion } from 'motion/react'
import { useAuth } from '@/lib/auth'
import { ApiError } from '@/lib/api'

type Mode = 'signup' | 'login'

export function Onboarding() {
  const navigate = useNavigate()
  const { signup, login } = useAuth()
  // Default to login: most arrivals are returning users. New users tap
  // "Create account" once; the choice survives the next render via state.
  const [mode, setMode] = useState<Mode>('login')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pwFocused, setPwFocused] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (mode === 'signup' && !acceptedPrivacy) {
      setError('Please read and accept the Privacy Promise to create an account.')
      return
    }
    setSubmitting(true)
    try {
      if (mode === 'signup') {
        const normalizedPhone = '+234' + phone.replace(/\D/g, '').replace(/^0/, '')
        await signup({ email, firstName, lastName, phone: normalizedPhone, password, acceptedPrivacy })
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
            onFocus={() => setPwFocused(true)}
            onBlur={() => setPwFocused(false)}
            className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--color-stone-soft)]"
          />
          {mode === 'signup' && (pwFocused || password.length > 0) ? (
            <PasswordStrength password={password} />
          ) : null}
        </Field>
      </div>

      {error ? (
        <p className="mt-4 text-[12px] text-[var(--color-coral)]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex-1" />

      {mode === 'signup' ? (
        <label className="mt-6 flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={acceptedPrivacy}
            onChange={(e) => setAcceptedPrivacy(e.target.checked)}
            className="mt-[3px] h-4 w-4 accent-[var(--color-indigo)] shrink-0 cursor-pointer"
          />
          <span className="text-[12px] leading-relaxed text-[var(--color-stone)]">
            I’ve read and agree to the{' '}
            <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="text-[var(--color-ink)] underline underline-offset-[3px]">
              Privacy Promise
            </Link>
            . Akin will only hold what’s needed to run the class fund and ride
            network, and never sell or share my data for anything else.
          </span>
        </label>
      ) : null}

      <button
        type="submit"
        disabled={submitting || (mode === 'signup' && !acceptedPrivacy)}
        className="btn-primary w-full mt-6 h-[52px]"
      >
        {submitting ? 'Working…' : mode === 'signup' ? 'Create account' : 'Sign in'}
      </button>

      {mode === 'login' ? (
        <p className="text-center text-[11px] mt-4 text-[var(--color-stone)]">
          By signing in you confirm our{' '}
          <Link to="/privacy" className="text-[var(--color-ink)] underline underline-offset-[3px]">
            Privacy Promise
          </Link>
          .
        </p>
      ) : null}

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

function scorePassword(pw: string): { score: number; label: string; color: string } {
  let score = 0
  if (pw.length >= 8)  score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 1) return { score, label: 'Weak',   color: 'bg-[var(--color-coral)]' }
  if (score <= 2) return { score, label: 'Fair',   color: 'bg-amber-400' }
  if (score <= 3) return { score, label: 'Good',   color: 'bg-yellow-400' }
  if (score <= 4) return { score, label: 'Strong', color: 'bg-emerald-400' }
  return               { score, label: 'Great',  color: 'bg-emerald-500' }
}

function PasswordStrength({ password }: { password: string }) {
  const { score, label, color } = scorePassword(password)
  const filled = Math.max(1, score)
  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              i < filled ? color : 'bg-[var(--color-hairline)]'
            }`}
          />
        ))}
      </div>
      <p className="text-[10px] text-[var(--color-stone)]">{label}</p>
    </div>
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
    case 'password_too_long':
      return 'Password is too long.'
    case 'first_name_invalid':
      return 'First name contains invalid characters or is too long.'
    case 'last_name_invalid':
      return 'Last name contains invalid characters or is too long.'
    case 'invalid_credentials':
      return 'Email or password is incorrect.'
    case 'privacy_required':
      return 'Please accept the Privacy Promise to continue.'
    default:
      return 'Could not complete. Please try again.'
  }
}
