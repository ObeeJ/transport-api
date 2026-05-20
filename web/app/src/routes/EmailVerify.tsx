import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { motion } from 'motion/react'
import { useAuth } from '@/lib/auth'
import { ApiError, api } from '@/lib/api'

export function EmailVerify() {
  const { user, refresh } = useAuth()
  const [params] = useSearchParams()
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Handle redirect back from the email link
  const verified = params.get('verified') === '1'
  const linkError = params.get('error')

  useEffect(() => {
    if (verified) void refresh()
  }, [verified, refresh])

  if (user?.emailVerifiedAt || verified) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25 }}
        className="pt-4"
      >
        <div className="card-base p-6 text-center">
          <div className="text-3xl mb-3">✓</div>
          <div className="text-base font-medium text-[var(--color-moss)]">Email verified</div>
          <p className="mt-2 text-[12px] text-[var(--color-stone)]">
            {user?.email} is confirmed.
          </p>
        </div>
      </motion.div>
    )
  }

  async function onSend() {
    setError(null)
    setSending(true)
    try {
      await api.post('/auth/email/verify/send')
      setSent(true)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'already_verified') {
        await refresh()
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not send. Try again.')
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="pt-4">
      <h2 className="text-[28px] font-medium tracking-tight text-[var(--color-indigo)] leading-tight">
        Verify your email.
      </h2>
      <p className="mt-3 text-[13px] leading-relaxed text-[var(--color-stone)]">
        We'll send a link to{' '}
        <span className="text-[var(--color-ink)]">{user?.email}</span>.
        Click it to confirm your account.
      </p>

      {linkError && (
        <div className="mt-4 card-base p-4" style={{ borderColor: 'var(--color-coral)' }}>
          <p className="text-[12px] text-[var(--color-coral)]">
            {linkError === 'invalid_token'
              ? 'That link has expired or already been used. Request a new one below.'
              : 'Something went wrong with the link. Request a new one below.'}
          </p>
        </div>
      )}

      {sent ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 space-y-4"
        >
          <div className="card-base p-5" style={{ borderColor: 'var(--color-moss-soft)' }}>
            <div className="label-cap text-[var(--color-moss)]">Email sent</div>
            <p className="mt-2 text-[13px] text-[var(--color-stone)] leading-relaxed">
              Check your inbox at <strong className="text-[var(--color-ink)]">{user?.email}</strong>.
              Click the link in the email — you'll be verified instantly.
            </p>
            <p className="mt-2 text-[11px] text-[var(--color-stone)]">
              The link expires in 24 hours. Check your spam folder if you don't see it.
            </p>
          </div>

          <button
            onClick={onSend}
            disabled={sending}
            className="w-full text-[12px] text-[var(--color-stone)] underline underline-offset-[3px]"
          >
            {sending ? 'Resending…' : 'Resend email'}
          </button>
        </motion.div>
      ) : (
        <>
          {error && <p className="mt-4 text-[12px] text-[var(--color-coral)]" role="alert">{error}</p>}
          <button
            onClick={onSend}
            disabled={sending}
            className="btn-primary w-full mt-8 h-[52px]"
          >
            {sending ? 'Sending…' : 'Send verification email'}
          </button>
        </>
      )}
    </div>
  )
}
