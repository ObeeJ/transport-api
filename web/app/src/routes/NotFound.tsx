import { useNavigate, useLocation } from 'react-router'
import { motion } from 'motion/react'
import { fadeUp, stagger, transition } from '@/lib/motion'

export function NotFound() {
  const navigate = useNavigate()
  const location = useLocation()

  // Go back if there's history, otherwise go home
  function handleBack() {
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate('/', { replace: true })
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 relative overflow-hidden">

      {/* Background blobs */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
      >
        <div className="absolute top-[10%] left-[8%] w-64 h-64 rounded-full bg-[var(--color-clay)] opacity-[0.06] blur-3xl" />
        <div className="absolute bottom-[12%] right-[6%] w-80 h-80 rounded-full bg-[var(--color-indigo)] opacity-[0.06] blur-3xl" />
      </motion.div>

      <motion.div
        className="relative z-10 flex flex-col items-center text-center max-w-[340px]"
        variants={stagger(0.08, 0.1)}
        initial="hidden"
        animate="show"
      >
        {/* 404 glyph */}
        <motion.div
          variants={fadeUp}
          transition={transition.slow}
          className="relative mb-8 select-none"
        >
          <span className="text-[120px] font-medium leading-none tracking-tighter text-[var(--color-indigo)] opacity-[0.07]">
            404
          </span>
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <div className="card-base w-16 h-16 flex items-center justify-center glow-clay">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 11c-.55 0-1-.45-1-1V8c0-.55.45-1 1-1s1 .45 1 1v4c0 .55-.45 1-1 1zm1 4h-2v-2h2v2z"
                  fill="var(--color-clay)"
                />
              </svg>
            </div>
          </motion.div>
        </motion.div>

        {/* Text */}
        <motion.div variants={fadeUp} transition={transition.default} className="space-y-2 mb-8">
          <h1 className="text-[28px] font-medium tracking-tight text-[var(--color-indigo)] leading-tight">
            Nothing here.
          </h1>
          <p className="text-[13px] leading-relaxed text-[var(--color-stone)]">
            The page{' '}
            <span className="font-mono text-[11px] bg-[var(--color-cream-2)] px-1.5 py-0.5 rounded-md text-[var(--color-ink)]">
              {location.pathname}
            </span>{' '}
            doesn't exist or was moved.
          </p>
        </motion.div>

        {/* Actions */}
        <motion.div
          variants={fadeUp}
          transition={transition.default}
          className="flex flex-col gap-3 w-full"
        >
          <motion.button
            onClick={handleBack}
            className="btn-primary w-full h-[52px] text-[15px]"
            whileTap={{ scale: 0.97 }}
            whileHover={{ y: -1 }}
            transition={{ duration: 0.12 }}
          >
            ← Go back
          </motion.button>

          <motion.button
            onClick={() => navigate('/', { replace: true })}
            className="btn-secondary w-full h-[44px] text-[13px]"
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.12 }}
          >
            Home
          </motion.button>
        </motion.div>
      </motion.div>

      {/* Brand mark */}
      <motion.div
        className="absolute bottom-8 left-0 right-0 flex justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.4 }}
      >
        <span className="text-[18px] font-medium tracking-tight text-[var(--color-indigo)] opacity-30">
          akin<span className="text-[var(--color-clay)]">.</span>
        </span>
      </motion.div>
    </div>
  )
}
