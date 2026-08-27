import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { api } from '@/lib/api'
import { useToast } from '@/lib/toast'
import { fadeUp, transition } from '@/lib/motion'

export function CircleJoin() {
  const { token } = useParams()
  const navigate = useNavigate()
  const toast = useToast()

  const join = useMutation({
    mutationFn: () => api.circles.join(token!),
    onSuccess: () => {
      toast.show('You joined the Circle.', 'success')
      navigate('/')
    },
    onError: (e: Error) => toast.show(e.message, 'error'),
  })

  useEffect(() => {
    if (token) join.mutate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  return (
    <div className="min-h-[60dvh] flex items-center justify-center px-6">
      <motion.div
        initial="hidden"
        animate="show"
        variants={fadeUp}
        transition={transition.default}
        className="text-center space-y-3"
      >
        {join.isPending && (
          <>
            <div className="size-10 rounded-full border-2 border-[var(--color-indigo)]/20 border-t-[var(--color-indigo)] animate-spin mx-auto" />
            <p className="text-[13px] text-[var(--color-stone)]">Joining Circle…</p>
          </>
        )}
        {join.isError && (
          <>
            <p className="text-[15px] font-medium text-[var(--color-coral)]">Invite link invalid</p>
            <p className="text-[12px] text-[var(--color-stone)]">This link may have expired or already been used.</p>
            <button onClick={() => navigate('/')} className="btn-primary h-9 px-5 text-sm mt-2">
              Go home
            </button>
          </>
        )}
      </motion.div>
    </div>
  )
}
