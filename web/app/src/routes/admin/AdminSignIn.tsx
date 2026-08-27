import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'

export function AdminSignIn() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const user = await login({ email: email.trim().toLowerCase(), password })
      if (user.role !== 'admin') {
        setError('This account does not have admin access.')
        return
      }
      navigate('/admin', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'invalid_credentials') {
        setError('Email or password is incorrect.')
      } else {
        setError('Something went wrong. Try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center px-6 py-12"
      style={{
        background:
          'radial-gradient(at 15% 15%, rgba(27,42,78,0.07) 0, transparent 50%), radial-gradient(at 85% 85%, rgba(217,119,87,0.07) 0, transparent 50%), var(--color-paper)',
      }}
    >
      <div className="w-full max-w-[380px]">
        <Link to="/" className="text-[20px] font-medium tracking-tight text-[var(--color-indigo)]">
          akin<span className="text-[var(--color-clay)]">.</span>
        </Link>

        <div className="mt-6 mb-1 text-[10px] uppercase tracking-[0.18em] font-semibold text-[var(--color-indigo)]">
          Admin sign-in
        </div>
        <h1 className="text-[28px] font-medium tracking-tight text-[var(--color-indigo)] leading-tight">
          Platform admin.
        </h1>
        <p className="mt-2 text-[13px] text-[var(--color-stone)] leading-relaxed">
          Restricted to the platform administrator. Use your admin email and password.
        </p>

        <form onSubmit={onSubmit} className="mt-7 space-y-3">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@akin.app"
            className="w-full h-[52px] px-4 rounded-[14px] border border-[var(--color-hairline)] bg-[var(--color-paper)] text-[15px] text-[var(--color-ink)] placeholder:text-[var(--color-stone-soft)] focus:outline-none focus:border-[var(--color-indigo)] transition-colors"
          />
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full h-[52px] px-4 rounded-[14px] border border-[var(--color-hairline)] bg-[var(--color-paper)] text-[15px] text-[var(--color-ink)] placeholder:text-[var(--color-stone-soft)] focus:outline-none focus:border-[var(--color-indigo)] transition-colors"
          />
          {error && <p className="text-[12px] text-[var(--color-coral)]" role="alert">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="btn-primary w-full h-[52px] mt-1"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="mt-8">
          <Link to="/onboarding" className="text-[11px] text-[var(--color-stone)] underline underline-offset-[3px]">
            Not an admin? Sign in as a member →
          </Link>
        </div>
      </div>
    </div>
  )
}
