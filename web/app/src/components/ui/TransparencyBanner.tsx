import { Link } from 'react-router'
import { WingsBadge } from './WingsBadge'

type Props = { lockedAmount: number; onPost?: () => void }

export function TransparencyBanner({ lockedAmount, onPost }: Props) {
  if (lockedAmount <= 0) return null
  return (
    <div
      className="rounded-[14px] px-4 py-3.5 flex items-center justify-between gap-3"
      style={{ background: 'rgba(217,119,87,0.08)', border: '1px solid rgba(217,119,87,0.20)' }}
      role="status"
    >
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-[var(--color-clay)]">
          Post to unlock <WingsBadge amount={lockedAmount} size="sm" />
        </p>
        <p className="text-[10px] text-[var(--color-stone)] mt-0.5 leading-relaxed">
          Your sponsor's gift is held until you publicly acknowledge it. One post unlocks it.
        </p>
      </div>
      {onPost ? (
        <button
          onClick={onPost}
          className="shrink-0 h-8 px-3 rounded-[10px] bg-[var(--color-clay)] text-white text-xs font-medium hover:opacity-90 transition-opacity"
        >
          Post now
        </button>
      ) : (
        <Link
          to="/compose"
          className="shrink-0 h-8 px-3 rounded-[10px] bg-[var(--color-clay)] text-white text-xs font-medium hover:opacity-90 transition-opacity"
        >
          Post now
        </Link>
      )}
    </div>
  )
}
