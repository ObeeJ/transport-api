import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api, type KYCStatus } from '@/lib/api'
import { useToast } from '@/lib/toast'

export function KYCFlow() {
  const toast = useToast()
  const [nin, setNin] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const [status, setStatus] = useState<KYCStatus | null>(null)

  const submit = useMutation({
    mutationFn: () => api.kyc.submitNIN(nin),
    onSuccess: (data) => setJobId(data.jobId),
    onError: (e: Error) => toast.show(e.message, 'error'),
  })

  // Poll every 30s until done or failed.
  useQuery({
    queryKey: ['kyc', 'status', jobId],
    queryFn: () => api.kyc.status(jobId!),
    enabled: !!jobId && status !== 'verified' && status !== 'failed',
    refetchInterval: 30_000,
    select: (data) => {
      setStatus(data.status as KYCStatus)
      return data
    },
  })

  useEffect(() => {
    if (status === 'verified') toast.show('Identity verified ✅', 'success')
    if (status === 'failed') toast.show("We couldn't verify your NIN. Please try again.", 'error')
  }, [status])

  if (status === 'verified') {
    return (
      <div className="pt-8 text-center">
        <div className="text-4xl mb-3">✅</div>
        <h2 className="text-xl font-medium text-[var(--color-indigo)]">You're verified</h2>
        <p className="mt-2 text-sm text-[var(--color-stone)]">Your identity has been confirmed.</p>
      </div>
    )
  }

  if (jobId && status !== 'failed') {
    return (
      <div className="pt-8 text-center">
        <div className="text-4xl mb-3">⏳</div>
        <h2 className="text-xl font-medium text-[var(--color-indigo)]">Verifying your identity</h2>
        <p className="mt-2 text-sm text-[var(--color-stone)]">This usually takes under a minute. We'll notify you when it's done.</p>
      </div>
    )
  }

  return (
    <div className="pt-4 max-w-sm mx-auto">
      <h2 className="text-2xl font-medium tracking-tight text-[var(--color-indigo)]">Verify your identity</h2>
      <p className="mt-2 text-sm text-[var(--color-stone)]">
        We need your NIN to keep the platform safe for everyone. It's encrypted and never shared.
      </p>
      <div className="mt-6 space-y-4">
        <input
          type="text"
          inputMode="numeric"
          maxLength={11}
          placeholder="11-digit NIN"
          value={nin}
          onChange={e => setNin(e.target.value.replace(/\D/g, ''))}
          className="w-full border border-[var(--color-hairline)] rounded-lg px-4 py-3 text-sm font-mono"
        />
        <button
          onClick={() => submit.mutate()}
          disabled={nin.length < 11 || submit.isPending}
          className="w-full bg-[var(--color-indigo)] text-white rounded-lg py-3 text-sm font-medium disabled:opacity-40"
        >
          {submit.isPending ? 'Submitting…' : 'Verify NIN'}
        </button>
      </div>
    </div>
  )
}
