import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

type Wallet = { id: string; balanceKobo: number; updatedAt: string }
type Tx = {
  id: string
  type: 'credit' | 'debit'
  amountKobo: number
  balanceKobo: number
  description: string
  createdAt: string
}

function naira(kobo: number): string {
  return '₦' + Math.round(kobo / 100).toLocaleString('en-NG')
}

export function WalletPage() {
  const wallet = useQuery<Wallet>({
    queryKey: ['wallet'],
    queryFn: () => api.get<Wallet>('/wallet'),
  })
  const txs = useQuery<{ items: Tx[] }>({
    queryKey: ['wallet', 'transactions'],
    queryFn: () => api.get('/wallet/transactions'),
  })

  return (
    <div className="pt-4">
      <h2 className="text-[28px] font-medium tracking-tight text-[var(--color-indigo)] leading-tight">
        Your wallet.
      </h2>
      <p className="mt-2 text-[12px] text-[var(--color-stone)]">
        Support disbursements land here. Looks like any other balance — no labels, no stigma.
      </p>

      <div className="mt-5 card-base p-5 bg-gradient-to-b from-[var(--color-paper)] to-[var(--color-cream)]">
        <div className="label-cap">Balance</div>
        <div className="mt-1 text-[44px] font-medium tracking-tight text-[var(--color-indigo)] leading-none">
          {wallet.isLoading ? '…' : naira(wallet.data?.balanceKobo ?? 0)}
        </div>
      </div>

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
