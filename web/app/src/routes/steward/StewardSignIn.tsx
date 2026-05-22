import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { motion, AnimatePresence } from 'motion/react'
import { ApiError, api } from '@/lib/api'
import { useAuth } from '@/lib/auth'

type Stage = 'email' | 'code'

const SUPPORT_EMAIL = 'ajayiobanijesu2000@gmail.com'

export function StewardSignIn() {
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const [stage, setStage] = useState<Stage>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onRequest(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const value = email.trim().toLowerCase()
    if (!value || !value.includes('@')) {
      setError('Enter a valid email.')
      return
    }
    setBusy(true)
    try {
      // Endpoint is silent on unknown/non-steward — we always advance to the
      // code stage so we never leak whether the email is registered as a
      // steward. The verify step is what actually decides.
      await api.post('/auth/steward/otp/request', { email: value })
      setStage('code')
    } catch (err) {
      setError(humanize(err))
    } finally {
      setBusy(false)
    }
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const c = code.trim()
    if (!/^\d{6}$/.test(c)) {
      setError('Enter the 6-digit code from your email.')
      return
    }
    setBusy(true)
    try {
      await api.post('/auth/steward/otp/verify', { email: email.trim().toLowerCase(), code: c })
      await refresh()
      navigate('/steward', { replace: true })
    } catch (err) {
      setError(humanize(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center px-6 py-12"
      style={{
        background:
          'radial-gradient(at 15% 15%, rgba(200,75,58,0.07) 0, transparent 50%), radial-gradient(at 85% 85%, rgba(27,42,78,0.08) 0, transparent 50%), var(--color-paper)',
      }}
    >
      <div className="w-full max-w-[380px]">
        <Link to="/" className="text-[20px] font-medium tracking-tight text-[var(--color-indigo)]">
          akin<span className="text-[var(--color-clay)]">.</span>
        </Link>

        <div className="mt-6 mb-1 text-[10px] uppercase tracking-[0.18em] font-semibold text-[var(--color-coral)]">
          Steward sign-in
        </div>
        <h1 className="text-[28px] font-medium tracking-tight text-[var(--color-indigo)] leading-tight">
          {stage === 'email' ? 'Verify it’s you.' : 'Enter the code.'}
        </h1>
        <p className="mt-2 text-[13px] text-[var(--color-stone)] leading-relaxed">
          {stage === 'email'
            ? 'Stewards sign in with a one-time code sent to their registered email. No password needed.'
            : <>We sent a 6-digit code to <strong className="text-[var(--color-ink)]">{email}</strong>. It expires in 10 minutes.</>}
        </p>

        <AnimatePresence mode="wait">
          {stage === 'email' ? (
            <motion.form
              key="email"
              onSubmit={onRequest}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="mt-7 space-y-3"
            >
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full h-[52px] px-4 rounded-[14px] border border-[var(--color-hairline)] bg-[var(--color-paper)] text-[15px] text-[var(--color-ink)] placeholder:text-[var(--color-stone-soft)] focus:outline-none focus:border-[var(--color-indigo)] transition-colors"
              />
              {error && <p className="text-[12px] text-[var(--color-coral)]" role="alert">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className="btn-primary w-full h-[52px] mt-1"
              >
                {busy ? 'Sending…' : 'Send code'}
              </button>
            </motion.form>
          ) : (
            <motion.form
              key="code"
              onSubmit={onVerify}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="mt-7 space-y-3"
            >
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-full h-[56px] px-4 rounded-[14px] border border-[var(--color-hairline)] bg-[var(--color-paper)] text-center text-[24px] tracking-[0.4em] font-mono text-[var(--color-ink)] placeholder:text-[var(--color-stone-soft)] focus:outline-none focus:border-[var(--color-indigo)] transition-colors"
              />
              {error && <p className="text-[12px] text-[var(--color-coral)]" role="alert">{error}</p>}
              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="btn-primary w-full h-[52px] mt-1"
              >
                {busy ? 'Verifying…' : 'Sign in'}
              </button>
              <button
                type="button"
                onClick={() => { setStage('email'); setCode(''); setError(null) }}
                className="w-full text-[12px] text-[var(--color-stone)] underline underline-offset-[3px]"
              >
                Use a different email
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Contact admin — replaces forgot-password */}
        <div className="mt-10 pt-6 border-t border-[var(--color-hairline)]">
          <p className="text-[11px] text-[var(--color-stone)] leading-relaxed">
            Account problems? Stewards don’t reset their own passwords — contact a system admin
            so we can verify identity out-of-band before any change.
          </p>
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=Akin%20steward%20account%20help`}
            className="mt-3 inline-flex items-center gap-2 h-10 px-4 rounded-[10px] border border-[var(--color-hairline)] bg-[var(--color-paper)] text-[12px] font-medium text-[var(--color-ink)] hover:bg-[var(--color-cream-2)] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M3 7l9 6 9-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Contact admin
          </a>
        </div>

        <div className="mt-6">
          <Link to="/onboarding" className="text-[11px] text-[var(--color-stone)] underline underline-offset-[3px]">
            Not a steward? Sign in as a member →
          </Link>
        </div>
      </div>
    </div>
  )
}

function humanize(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'otp_invalid') return 'That code is wrong or expired. Request a new one.'
    if (err.code === 'not_steward') return 'That email isn’t registered as a steward.'
    if (err.code === 'too_many_auth_attempts') return 'Too many attempts. Wait a few minutes and try again.'
    if (err.code === 'csrf_missing' || err.code === 'csrf_mismatch') return 'Session refreshed — please retry.'
  }
  return 'Something went wrong. Try again.'
}
