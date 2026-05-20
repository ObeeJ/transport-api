import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ApiError, api } from '@/lib/api'

type Bank = { name: string; code: string; slug: string }
type Resolved = { accountNumber: string; accountName: string }

export function RecipientBank() {
  const navigate = useNavigate()

  const banks = useQuery<{ items: Bank[] }>({
    queryKey: ['banks'],
    queryFn: () => api.get<{ items: Bank[] }>('/banks'),
    staleTime: 30 * 60 * 1000,
  })

  const [bankCode, setBankCode] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [filter, setFilter] = useState('')
  const [resolved, setResolved] = useState<Resolved | null>(null)
  const [resolving, setResolving] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedBank = useMemo(
    () => banks.data?.items.find((b) => b.code === bankCode),
    [banks.data, bankCode],
  )

  const filteredBanks = useMemo(() => {
    if (!banks.data) return []
    const q = filter.trim().toLowerCase()
    if (!q) return banks.data.items
    return banks.data.items.filter((b) => b.name.toLowerCase().includes(q))
  }, [banks.data, filter])

  async function onResolve() {
    setError(null)
    setResolved(null)
    if (!bankCode || accountNumber.length < 10) {
      setError('Pick a bank and enter a 10-digit account number.')
      return
    }
    setResolving(true)
    try {
      const r = await api.post<Resolved>('/recipients/me/bank/resolve', {
        bankCode,
        accountNumber,
      })
      setResolved(r)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Could not look up that account — ${err.message}`
          : 'Could not look up that account.',
      )
    } finally {
      setResolving(false)
    }
  }

  async function onSave() {
    if (!selectedBank || !resolved) return
    setSaving(true)
    setError(null)
    try {
      await api.post('/recipients/me/bank', {
        bankCode: selectedBank.code,
        bankName: selectedBank.name,
        accountNumber: resolved.accountNumber,
      })
      navigate('/support', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save. Try again.')
      setSaving(false)
    }
  }

  return (
    <div className="pt-4">
      <h2 className="text-[26px] font-medium tracking-tight text-[var(--color-indigo)] leading-tight">
        Your bank account.
      </h2>
      <p className="mt-3 text-[13px] text-[var(--color-stone)]">
        Used only for support disbursements. Givers don't see this. Stewards see only the bank name and the masked account.
      </p>

      <div className="mt-6 space-y-4">
        <label className="block">
          <div className="label-cap mb-2">Bank</div>
          <div className="card-base bg-[var(--color-cream)] px-4 py-3">
            <input
              type="text"
              placeholder="Search bank…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--color-stone-soft)]"
            />
            <div className="mt-2 max-h-40 overflow-y-auto -mx-2">
              {banks.isLoading ? (
                <p className="px-2 text-[12px] text-[var(--color-stone)]">Loading banks…</p>
              ) : banks.isError ? (
                <p className="px-2 text-[12px] text-[var(--color-coral)]">Could not load banks.</p>
              ) : filteredBanks.length === 0 ? (
                <p className="px-2 text-[12px] text-[var(--color-stone)]">No matches.</p>
              ) : (
                filteredBanks.map((b) => (
                  <button
                    type="button"
                    key={b.code}
                    onClick={() => {
                      setBankCode(b.code)
                      setResolved(null)
                    }}
                    className={`block w-full text-left px-2 py-1.5 text-sm rounded-md ${
                      bankCode === b.code
                        ? 'bg-[var(--color-indigo)] text-[var(--color-paper)]'
                        : 'text-[var(--color-ink)] hover:bg-[var(--color-cream-2)]'
                    }`}
                  >
                    {b.name}
                  </button>
                ))
              )}
            </div>
          </div>
        </label>

        <label className="block">
          <div className="label-cap mb-2">Account number</div>
          <div className="card-base bg-[var(--color-cream)] px-4 py-3.5">
            <input
              type="text"
              inputMode="numeric"
              maxLength={10}
              value={accountNumber}
              onChange={(e) => {
                setAccountNumber(e.target.value.replace(/[^\d]/g, ''))
                setResolved(null)
              }}
              placeholder="10 digits"
              className="w-full bg-transparent text-base outline-none placeholder:text-[var(--color-stone-soft)]"
            />
          </div>
        </label>

        {!resolved ? (
          <button
            type="button"
            onClick={onResolve}
            disabled={resolving || !bankCode || accountNumber.length < 10}
            className="btn-primary w-full h-[52px]"
          >
            {resolving ? 'Looking up…' : 'Verify account'}
          </button>
        ) : (
          <div className="card-base p-4 bg-gradient-to-b from-[var(--color-paper)] to-[var(--color-cream)]">
            <div className="label-cap">Account name</div>
            <div className="mt-1 text-xl font-medium tracking-tight text-[var(--color-indigo)]">
              {resolved.accountName}
            </div>
            <p className="mt-1 text-[11px] text-[var(--color-stone)]">
              Make sure this is you. Funds will go here on every disbursement until you change it.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setResolved(null)}
                className="flex-1 h-10 rounded-[12px] border border-[var(--color-hairline)] bg-[var(--color-paper)] text-xs"
              >
                That's not me
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className="flex-1 h-10 rounded-[12px] bg-[var(--color-indigo)] text-[var(--color-paper)] text-xs font-medium"
              >
                {saving ? 'Saving…' : 'Confirm & save'}
              </button>
            </div>
          </div>
        )}

        {error ? (
          <p className="text-[12px] text-[var(--color-coral)]" role="alert">{error}</p>
        ) : null}
      </div>
    </div>
  )
}
