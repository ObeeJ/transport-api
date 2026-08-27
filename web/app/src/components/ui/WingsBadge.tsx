type Props = { amount: number; nairaEquiv?: number; size?: 'sm' | 'md' }

export function WingsBadge({ amount, nairaEquiv, size = 'md' }: Props) {
  const base = size === 'sm'
    ? 'text-[10px] px-2 py-0.5 gap-1'
    : 'text-[12px] px-2.5 py-1 gap-1.5'
  return (
    <span
      className={`inline-flex items-center font-mono font-semibold rounded-full ${base}`}
      style={{ background: 'rgba(217,119,87,0.12)', color: 'var(--color-clay)' }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
        <path d="M5 1L6.5 4H9L6.8 6L7.5 9L5 7.5L2.5 9L3.2 6L1 4H3.5L5 1Z" fill="currentColor" />
      </svg>
      {amount.toLocaleString()}W
      {nairaEquiv != null && (
        <span style={{ color: 'var(--color-stone)' }}>
          (~₦{Math.round(nairaEquiv).toLocaleString('en-NG')})
        </span>
      )}
    </span>
  )
}
