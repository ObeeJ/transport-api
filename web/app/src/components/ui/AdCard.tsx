type Props = {
  ctaUrl: string
  creativeKey?: string
  onImpression?: () => void
}

export function AdCard({ ctaUrl, onImpression }: Props) {
  return (
    <a
      href={ctaUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onImpression}
      className="block card-base px-4 py-3 hover:shadow-sm transition-shadow"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-stone)] mb-1">Sponsored</div>
          <div className="text-[12px] text-[var(--color-ink)] truncate">{ctaUrl}</div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0 text-[var(--color-stone-soft)]" aria-hidden>
          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </a>
  )
}
