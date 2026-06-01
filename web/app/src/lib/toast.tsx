import { useState, useCallback, useEffect, createContext, useContext, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'

type ToastKind = 'success' | 'error' | 'info'
type Toast = { id: number; message: string; kind: ToastKind }

type ToastCtx = { show: (message: string, kind?: ToastKind) => void }
const Ctx = createContext<ToastCtx>({ show: () => {} })

let _counter = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Map<number, number>>(new Map())

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    const t = timers.current.get(id)
    if (t) { clearTimeout(t); timers.current.delete(id) }
  }, [])

  const show = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = ++_counter
    setToasts(prev => [...prev.slice(-2), { id, message, kind }])
    const t = window.setTimeout(() => dismiss(id), 4500)
    timers.current.set(id, t)
  }, [dismiss])

  useEffect(() => {
    const m = timers.current
    return () => m.forEach(t => clearTimeout(t))
  }, [])

  const dot: Record<ToastKind, string> = {
    success: 'bg-[var(--color-moss)]',
    error:   'bg-[var(--color-coral)]',
    info:    'bg-[var(--color-stone)]',
  }

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto flex items-start gap-3 px-4 py-3.5 rounded-[14px] border border-[var(--color-hairline)] bg-[var(--color-paper)]/95 backdrop-blur-md"
              style={{ boxShadow: '0 8px 32px -8px rgba(27,42,78,0.18), 0 2px 8px rgba(27,42,78,0.06)' }}
            >
              <span className={`mt-1 shrink-0 size-1.5 rounded-full ${dot[t.kind]}`} />
              <p className="text-[12px] leading-[1.55] text-[var(--color-ink)] flex-1">{t.message}</p>
              <button
                onClick={() => dismiss(t.id)}
                className="shrink-0 text-[var(--color-stone-soft)] hover:text-[var(--color-stone)] transition-colors mt-0.5"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  return useContext(Ctx)
}
