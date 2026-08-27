import { useState, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import { api } from '@/lib/api'

type Props = { postId: string; initialCount?: number }

const MAX_CLAPS = 50

export function ClapButton({ postId, initialCount = 0 }: Props) {
  const [session, setSession] = useState(0)
  const [total, setTotal] = useState(initialCount)
  const [burst, setBurst] = useState(false)
  const flushTimer = useRef<number | null>(null)

  const clap = useMutation({
    mutationFn: (count: number) => api.posts.clap(postId, count),
  })

  function tap() {
    if (session >= MAX_CLAPS) return
    const next = session + 1
    setSession(next)
    setTotal((t) => t + 1)
    setBurst(true)
    setTimeout(() => setBurst(false), 200)

    if (flushTimer.current) clearTimeout(flushTimer.current)
    flushTimer.current = window.setTimeout(() => {
      clap.mutate(next)
      setSession(0)
    }, 1200)
  }

  return (
    <button
      onClick={tap}
      aria-label={`Clap (${total})`}
      className="flex items-center gap-1.5 text-[12px] text-[var(--color-stone)] hover:text-[var(--color-indigo)] transition-colors cursor-pointer select-none"
    >
      <motion.span animate={burst ? { scale: 1.35 } : { scale: 1 }} transition={{ duration: 0.15 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M7 11V7a2 2 0 0 1 4 0v4M7 11a2 2 0 0 0-2 2v1a6 6 0 0 0 6 6h2a6 6 0 0 0 6-6v-3a2 2 0 0 0-4 0M7 11h4m0 0V7a2 2 0 0 1 4 0v4m0 0h2"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
          />
        </svg>
      </motion.span>
      <span>{total}</span>
      <AnimatePresence>
        {session > 0 && (
          <motion.span
            key={session}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: -14 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute font-mono text-[10px] font-bold text-[var(--color-indigo)] pointer-events-none"
          >
            +{session}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  )
}
