import type { BadgeLevel } from '@/lib/api'

type Props = { level: BadgeLevel; size?: number }

const CONFIG: Record<NonNullable<BadgeLevel>, { color: string; label: string }> = {
  '':      { color: 'transparent', label: '' },
  grey:    { color: '#9CA3AF', label: 'Verified' },
  blue:    { color: '#3B82F6', label: 'Circle member' },
  gold:    { color: '#F59E0B', label: 'Founding member' },
  diamond: { color: '#67E8F9', label: 'Diamond' },
}

export function VerifiedTick({ level, size = 14 }: Props) {
  if (!level) return null
  const { color, label } = CONFIG[level]
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-label={label}
      className="shrink-0"
    >
      <path
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622C17.176 19.29 21 14.591 21 9a12.02 12.02 0 00-.382-3.016z"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={`${color}18`}
      />
    </svg>
  )
}
