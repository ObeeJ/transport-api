import type { Streak } from '@/lib/api'

type Props = { streak: Streak }

export function StreakChip({ streak }: Props) {
  const atRisk = streak.freezesLeft === 0
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
      style={{
        background: atRisk ? 'rgba(200,75,58,0.10)' : 'rgba(217,119,87,0.10)',
        color: atRisk ? 'var(--color-coral)' : 'var(--color-clay)',
      }}
      title={atRisk ? 'No freezes left — miss a day and this streak resets' : `${streak.freezesLeft} freeze${streak.freezesLeft !== 1 ? 's' : ''} left`}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
      {streak.count}
      <span className="font-mono text-[9px] uppercase tracking-wider opacity-70">{streak.kind}</span>
      {atRisk && (
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-label="At risk" className="shrink-0">
          <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  )
}
