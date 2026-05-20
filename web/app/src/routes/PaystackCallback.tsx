import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

type Deposit = {
  id: string
  amountKobo: number
  status: 'pending' | 'succeeded' | 'failed'
  paystackReference: string
  settledAt?: string
}

function formatNaira(kobo: number): string {
  const naira = Math.round(kobo / 100)
  return '₦' + naira.toLocaleString('en-NG')
}

export function PaystackCallback() {
  const [params] = useSearchParams()
  const reference = params.get('reference') ?? params.get('trxref') ?? ''
  const queryClient = useQueryClient()
  const [deposit, setDeposit] = useState<Deposit | null>(null)
  const [error, setError] = useState<string | null>(null)
  const stopped = useRef(false)

  useEffect(() => {
    if (!reference) {
      setError('Missing reference. Open this page from the Paystack redirect.')
      return
    }
    stopped.current = false
    const tick = async () => {
      try {
        const d = await api.get<Deposit>(`/giver/deposits/${reference}`)
        setDeposit(d)
        if (d.status === 'succeeded') {
          queryClient.invalidateQueries({ queryKey: ['pool'] })
          stopped.current = true
          return
        }
        if (d.status === 'failed') {
          stopped.current = true
          return
        }
      } catch (err) {
        setError((err as Error).message)
        stopped.current = true
        return
      }
      if (!stopped.current) {
        setTimeout(() => void tick(), 1500)
      }
    }
    void tick()
    return () => {
      stopped.current = true
    }
  }, [reference, queryClient])

  return (
    <div className="mx-auto min-h-dvh w-full max-w-[420px] px-6 pt-12 pb-10 flex flex-col">
      <div className="text-[24px] font-medium tracking-tight text-[var(--color-indigo)]">
        akin<span className="text-[var(--color-clay)]">.</span>
      </div>

      <div className="mt-12">
        {error ? (
          <>
            <h1 className="text-[32px] leading-tight font-medium tracking-tight text-[var(--color-coral)]">
              Something went wrong.
            </h1>
            <p className="mt-3 text-[13px] text-[var(--color-stone)]">{error}</p>
          </>
        ) : !deposit ? (
          <p className="text-[13px] text-[var(--color-stone)]">Checking payment status…</p>
        ) : deposit.status === 'succeeded' ? (
          <>
            <h1 className="text-[36px] leading-tight font-medium tracking-tight text-[var(--color-moss)]">
              Thank you.
            </h1>
            <p className="mt-3 text-[13px] text-[var(--color-stone)]">
              Your gift of <span className="text-[var(--color-ink)]">{formatNaira(deposit.amountKobo)}</span> joined the pool.
            </p>
          </>
        ) : deposit.status === 'failed' ? (
          <>
            <h1 className="text-[32px] leading-tight font-medium tracking-tight text-[var(--color-ink)]">
              It didn’t go through.
            </h1>
            <p className="mt-3 text-[13px] text-[var(--color-stone)]">
              No charge was made. You can try again — nothing has been recorded against you.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-[32px] leading-tight font-medium tracking-tight text-[var(--color-indigo)]">
              Almost there.
            </h1>
            <p className="mt-3 text-[13px] text-[var(--color-stone)]">
              Waiting for Paystack to confirm. This is usually a few seconds.
            </p>
          </>
        )}
      </div>

      <div className="flex-1" />
      <Link to="/give" className="btn-primary w-full mt-8 h-[52px]">
        Back to the pool
      </Link>
    </div>
  )
}
