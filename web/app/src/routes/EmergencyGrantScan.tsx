import { useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { api } from '@/lib/api'
import { useToast } from '@/lib/toast'
import { fadeUp, stagger, transition } from '@/lib/motion'

// Tier-3 fallback: no peer, no partner picked up the ride, so an admin has
// arranged an emergency grant in person. Both sides confirm the handshake
// happened by tapping "Confirm" once they've physically met — no camera
// permission or QR decoding needed, since the admin is the one who set up
// the meeting in the first place; this is a deliberate, honest confirmation
// step rather than a scan the admin already trusts.
export function EmergencyGrantScan() {
  const { rideId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [confirmed, setConfirmed] = useState(false)

  const confirm = useMutation({
    mutationFn: () => api.rides.emergencyScan(rideId!),
    onSuccess: () => {
      setConfirmed(true)
      toast.show('Ride confirmed.', 'success')
      setTimeout(() => navigate('/ride'), 1500)
    },
    onError: (e: Error) => toast.show(e.message, 'error'),
  })

  return (
    <motion.div
      variants={stagger(0.08, 0.04)}
      initial="hidden"
      animate="show"
      className="min-h-[60dvh] flex flex-col items-center justify-center text-center px-6 space-y-6"
    >
      <motion.div variants={fadeUp} transition={transition.default} className="card-base p-6 w-full max-w-xs">
        <h1 className="text-[18px] font-medium text-[var(--color-indigo)]">Emergency grant</h1>
        <p className="mt-2 text-[12px] text-[var(--color-stone)] leading-relaxed">
          {confirmed
            ? "Confirmed — you're on your way."
            : "Once you've met your driver in person, confirm below to close out the ride."}
        </p>
        {!confirmed && (
          <button
            onClick={() => confirm.mutate()}
            disabled={confirm.isPending || !rideId}
            className="mt-4 btn-primary w-full h-10 text-sm disabled:opacity-50"
          >
            {confirm.isPending ? 'Confirming…' : 'Confirm ride'}
          </button>
        )}
      </motion.div>
    </motion.div>
  )
}
