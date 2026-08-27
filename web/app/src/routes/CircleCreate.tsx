import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { api } from '@/lib/api'
import { useToast } from '@/lib/toast'
import { fadeUp, stagger, transition } from '@/lib/motion'

export function CircleCreate() {
  const navigate = useNavigate()
  const toast = useToast()
  const [name, setName] = useState('')
  const [sector, setSector] = useState('')
  const [error, setError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () => api.post('/circles', { name, sector }),
    onSuccess: () => {
      toast.show('Circle created.', 'success')
      navigate('/')
    },
    onError: (e: Error) => setError(e.message),
  })

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) { setError('Circle name is required.'); return }
    create.mutate()
  }

  return (
    <motion.div variants={stagger(0.07, 0.03)} initial="hidden" animate="show" className="space-y-5">
      <motion.div variants={fadeUp} transition={transition.default}>
        <h2 className="text-[28px] font-medium tracking-tight text-[var(--color-indigo)] leading-tight">
          Create a Circle
        </h2>
        <p className="mt-2 text-[12px] text-[var(--color-stone)] leading-relaxed">
          A Circle is a private community on Akin — a campus, company, or group with its own fund pool and feed.
        </p>
      </motion.div>

      <motion.form variants={fadeUp} transition={transition.default} onSubmit={onSubmit} className="space-y-4">
        <div className="card-base p-5 space-y-4">
          <div>
            <label className="label-cap mb-2 block">Circle name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Unilag Transport Circle"
              className="w-full border border-[var(--color-hairline)] rounded-[10px] px-4 py-3 text-sm bg-[var(--color-cream)] outline-none focus:border-[var(--color-indigo)] transition-colors"
            />
          </div>
          <div className="h-px bg-[var(--color-hairline)]" />
          <div>
            <label className="label-cap mb-2 block">Sector</label>
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className="w-full border border-[var(--color-hairline)] rounded-[10px] px-4 py-3 text-sm bg-[var(--color-cream)] outline-none focus:border-[var(--color-indigo)] transition-colors"
            >
              <option value="">Select sector</option>
              {['university', 'company', 'ngo', 'community', 'other'].map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>

        {error && <p className="text-[12px] text-[var(--color-coral)] px-1" role="alert">{error}</p>}

        <button
          type="submit"
          disabled={create.isPending}
          className="btn-primary w-full h-[52px] text-[14px] disabled:opacity-50"
        >
          {create.isPending ? 'Creating…' : 'Create Circle'}
        </button>
      </motion.form>
    </motion.div>
  )
}
