import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/lib/toast'
import { transition } from '@/lib/motion'

type Props = {
  targetRole: string
  onClose: () => void
  onSuccess: () => void
}

export function RoleSwitchModal({ targetRole, onClose, onSuccess }: Props) {
  const { refresh } = useAuth()
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await api.post('/auth/role-switch', { role: targetRole, password })
      await refresh()
      toast.show(`Switched to ${targetRole}.`, 'success')
      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not switch role.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm px-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={transition.default}
          onClick={(e) => e.stopPropagation()}
          className="card-base w-full max-w-sm p-6 space-y-5"
        >
          <div>
            <h2 className="text-[18px] font-medium text-[var(--color-indigo)]">Switch to {targetRole}</h2>
            <p className="mt-1 text-[12px] text-[var(--color-stone)]">
              Confirm your password to continue. This action is audit-logged.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              autoFocus
              className="w-full border border-[var(--color-hairline)] rounded-[10px] px-4 py-3 text-sm bg-[var(--color-cream)] outline-none focus:border-[var(--color-indigo)] transition-colors"
            />

            {error && (
              <p className="text-[12px] text-[var(--color-coral)]" role="alert">{error}</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-10 rounded-[10px] border border-[var(--color-hairline)] text-sm text-[var(--color-stone)] hover:bg-[var(--color-cream)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !password}
                className="flex-1 h-10 rounded-[10px] bg-[var(--color-indigo)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {loading ? 'Switching…' : 'Confirm'}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
