import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, api } from '@/lib/api'

type Wallet = { id: string; balanceKobo: number; updatedAt: string }
type Tx = {
  id: string
  type: 'credit' | 'debit'
  amountKobo: number
  balanceKobo: number
  description: string
  createdAt: string
}
type RecipientStatus = {
  status: 'pending' | 'approved' | 'declined'
  pseudonymousId: string
}
type BankAccount = {
  bankName: string
  accountName: string
  accountNumber: string
}

function naira(kobo: number): string {
  return '₦' + Math.round(kobo / 100).toLocaleString('en-NG')
}

function maskAccount(n: string): string {
  if (!n || n.length < 4) return n ?? ''
  return '••• ' + n.slice(-4)
}

export function WalletPage() {
  const qc = useQueryClient()

  const wallet = useQuery<Wallet>({
    queryKey: ['wallet'],
    queryFn: () => api.get<Wallet>('/wallet'),
  })
  const txs = useQuery<{ items: Tx[] }>({
    queryKey: ['wallet', 'transactions'],
    queryFn: () => api.get('/wallet/transactions'),
  })

  // Withdraw is only meaningful for approved recipients with a bank on file.
  // We don't gate the page itself (the wallet balance might still show
  // post-trip credits etc.) — we just don't surface the form unless ready.
  const recipient = useQuery<RecipientStatus>({
    queryKey: ['recipient', 'me'],
    queryFn: () => api.get<RecipientStatus>('/recipients/me'),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 1,
  })
  const bank = useQuery<BankAccount>({
    queryKey: ['recipient', 'bank'],
    queryFn: () => api.get<BankAccount>('/recipients/me/bank'),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 1,
    enabled: recipient.data?.status === 'approved',
  })

  const isApproved = recipient.data?.status === 'approved'
  const hasBank = !!bank.data?.accountNumber
  const balance = wallet.data?.balanceKobo ?? 0
  const canWithdraw = isApproved && hasBank && balance >= 100 * 100

  return (
    <div className="pt-4">
      <h2 className="text-[28px] font-medium tracking-tight text-[var(--color-indigo)] leading-tight">
        Your wallet.
      </h2>
      <p className="mt-2 text-[12px] text-[var(--color-stone)]">
        Support disbursements land here. Looks like any other balance — no labels, no stigma. Withdraw to your bank whenever you need it.
      </p>

      <div className="mt-5 card-base p-5 bg-gradient-to-b from-[var(--color-paper)] to-[var(--color-cream)]">
        <div className="label-cap">Balance</div>
        <div className="mt-1 text-[44px] font-medium tracking-tight text-[var(--color-indigo)] leading-none">
          {wallet.isLoading ? '…' : naira(balance)}
        </div>
        {canWithdraw ? null : isApproved && !hasBank ? (
          <p className="mt-3 text-[11px] text-[var(--color-stone)]">
            Add a bank account in <a href="/support/bank" className="underline underline-offset-2 text-[var(--color-ink)]">Support → Bank</a> to enable withdrawals.
          </p>
        ) : !isApproved ? (
          <p className="mt-3 text-[11px] text-[var(--color-stone)]">
            Withdrawals are available once a recipient application has been approved.
          </p>
        ) : balance < 100 * 100 ? (
          <p className="mt-3 text-[11px] text-[var(--color-stone)]">
            Minimum withdrawal is {naira(100 * 100)}.
          </p>
        ) : null}
      </div>

      {canWithdraw && bank.data ? <WithdrawCard balance={balance} bank={bank.data} qc={qc} /> : null}

      <div className="mt-6">
        <div className="label-cap mb-3">Transactions</div>
        {txs.isLoading ? (
          <p className="text-sm text-[var(--color-stone)]">Loading…</p>
        ) : (txs.data?.items ?? []).length === 0 ? (
          <div className="card-base p-5 text-center">
            <p className="text-sm text-[var(--color-stone)]">No transactions yet.</p>
          </div>
        ) : (
          <div className="card-base divide-y divide-[var(--color-hairline)]">
            {txs.data?.items.map((tx) => (
              <div key={tx.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm text-[var(--color-ink)]">{tx.description || tx.type}</div>
                  <div className="text-[10px] text-[var(--color-stone)] mt-0.5 font-mono">
                    {new Date(tx.createdAt).toLocaleString('en-NG', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className="font-mono text-sm font-medium"
                    style={{ color: tx.type === 'credit' ? 'var(--color-moss)' : 'var(--color-coral)' }}
                  >
                    {tx.type === 'credit' ? '+' : '-'}{naira(tx.amountKobo)}
                  </div>
                  <div className="text-[10px] text-[var(--color-stone)] font-mono">
                    bal {naira(tx.balanceKobo)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function WithdrawCard({
  balance,
  bank,
  qc,
}: {
  balance: number
  bank: BankAccount
  qc: ReturnType<typeof useQueryClient>
}) {
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const withdraw = useMutation({
    mutationFn: (amountKobo: number) =>
      api.post<{ id: string; status: string }>('/wallet/withdraw', { amountKobo }),
    onSuccess: (p) => {
      setSuccess(
        p.status === 'succeeded'
          ? 'Withdrawal sent to your bank.'
          : 'Withdrawal initiated — funds usually arrive within minutes.',
      )
      setAmount('')
      qc.invalidateQueries({ queryKey: ['wallet'] })
      qc.invalidateQueries({ queryKey: ['wallet', 'transactions'] })
    },
    onError: (err) => {
      setSuccess(null)
      if (err instanceof ApiError) {
        setError(humanize(err.code ?? err.message))
      } else {
        setError('Could not withdraw. Try again.')
      }
    },
  })

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    const naira = parseInt(amount.replace(/[^\d]/g, ''), 10)
    if (!Number.isFinite(naira) || naira < 100) {
      setError('Enter at least ₦100.')
      return
    }
    const kobo = naira * 100
    if (kobo > balance) {
      setError(`You only have ${'₦' + Math.round(balance / 100).toLocaleString('en-NG')} available.`)
      return
    }
    withdraw.mutate(kobo)
  }

  return (
    <div className="mt-4 card-base p-5">
      <div className="flex items-center justify-between">
        <div className="label-cap">Withdraw to bank</div>
        <button
          type="button"
          onClick={() => setAmount(String(Math.floor(balance / 100)))}
          className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-stone)] hover:text-[var(--color-ink)] transition-colors"
        >
          Withdraw all
        </button>
      </div>

      <form onSubmit={onSubmit} className="mt-3 space-y-3">
        <div className="card-base px-4 py-3.5 bg-[var(--color-cream)]">
          <div className="flex items-baseline gap-2">
            <span className="text-base text-[var(--color-stone)]">₦</span>
            <input
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="0"
              className="flex-1 bg-transparent text-[24px] font-medium tracking-tight outline-none placeholder:text-[var(--color-stone-soft)]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-[10px] bg-[var(--color-cream)] px-4 py-2.5 text-[11px]">
          <span className="text-[var(--color-stone)]">Sending to</span>
          <span className="text-[var(--color-ink)] font-mono truncate ml-3">
            {bank.bankName} · {maskAccount(bank.accountNumber)}
          </span>
        </div>

        {error ? (
          <p className="text-[12px] text-[var(--color-coral)]" role="alert">{error}</p>
        ) : null}
        {success ? (
          <p className="text-[12px] text-[var(--color-moss)]">{success}</p>
        ) : null}

        <button
          type="submit"
          disabled={withdraw.isPending || !amount}
          className="btn-primary w-full h-[52px]"
        >
          {withdraw.isPending ? 'Sending…' : 'Withdraw'}
        </button>
        <p className="text-[10px] text-[var(--color-stone)] text-center">
          No steward approval needed for routine withdrawals. Stewards are notified only of unusual activity.
        </p>
      </form>
    </div>
  )
}

function humanize(code: string): string {
  switch (code) {
    case 'amount_too_small': return 'Minimum withdrawal is ₦100.'
    case 'insufficient_balance': return "You don't have enough in your wallet."
    case 'no_bank_on_file': return 'Add a bank account first.'
    case 'not_approved': return 'Withdrawals are only available to approved recipients.'
    case 'recipient_not_found': return 'You need to be an approved recipient to withdraw.'
    case 'payments_not_configured': return 'Withdrawals are temporarily disabled. Try again later.'
    case 'too_many_requests': return 'Too many withdrawal attempts. Wait a minute and retry.'
    default: return 'Could not complete the withdrawal. Try again.'
  }
}
