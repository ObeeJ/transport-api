import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import { api } from '@/lib/api'
import { transition } from '@/lib/motion'

type Circle = { id: string; name: string; sector?: string }

export function CircleSwitcher() {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()

  const circles = useQuery<{ items: Circle[] }>({
    queryKey: ['circles', 'mine'],
    queryFn: () => api.circles.mine() as Promise<{ items: Circle[] }>,
  })

  const switchCircle = useMutation({
    mutationFn: (id: string) => api.post(`/circles/${id}/switch`, {}),
    onSuccess: () => {
      qc.invalidateQueries()
      setOpen(false)
    },
  })

  const items = circles.data?.items ?? []
  if (items.length <= 1) return null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 h-8 px-3 rounded-[10px] border border-[var(--color-hairline)] text-[12px] text-[var(--color-ink)] hover:bg-[var(--color-cream)] transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
          <path d="M12 8v4l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        Circle
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <motion.ul
              role="listbox"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={transition.fast}
              className="absolute right-0 top-10 z-40 w-52 card-base py-1 shadow-lg"
            >
              {items.map((c) => (
                <li key={c.id}>
                  <button
                    role="option"
                    onClick={() => switchCircle.mutate(c.id)}
                    disabled={switchCircle.isPending}
                    className="w-full text-left px-4 py-2.5 text-[13px] text-[var(--color-ink)] hover:bg-[var(--color-cream)] transition-colors"
                  >
                    {c.name}
                    {c.sector && (
                      <span className="ml-1.5 text-[10px] text-[var(--color-stone)] uppercase tracking-wider">
                        {c.sector}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </motion.ul>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
