import { motion } from 'motion/react'
import type { ComponentPropsWithoutRef } from 'react'

interface PrimaryButtonProps extends ComponentPropsWithoutRef<'button'> {
  loading?: boolean
  loadingText?: string
  icon?: React.ReactNode
}

/**
 * PrimaryButton — the single source of truth for all major CTAs.
 *
 * Wraps btn-primary with:
 * - whileTap scale press (0.97)
 * - whileHover subtle lift
 * - loading state with spinner
 * - optional trailing icon
 *
 * Usage:
 *   <PrimaryButton onClick={fn} loading={submitting} loadingText="Saving…">
 *     Save changes
 *   </PrimaryButton>
 */
export function PrimaryButton({
  children,
  loading,
  loadingText,
  icon,
  disabled,
  className = '',
  ...props
}: PrimaryButtonProps) {
  const isDisabled = disabled || loading

  return (
    <motion.button
      whileTap={isDisabled ? {} : { scale: 0.97 }}
      whileHover={isDisabled ? {} : { y: -1 }}
      transition={{ duration: 0.12, ease: [0.25, 0.1, 0.25, 1] }}
      disabled={isDisabled}
      className={`btn-primary ${className}`}
      {...(props as object)}
    >
      {loading ? (
        <>
          <Spinner />
          <span className="ml-2">{loadingText ?? 'Loading…'}</span>
        </>
      ) : (
        <>
          {children}
          {icon && <span className="ml-2 flex items-center">{icon}</span>}
        </>
      )}
    </motion.button>
  )
}

function Spinner() {
  return (
    <svg
      className="animate-spin"
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
    >
      <circle
        cx="7" cy="7" r="5.5"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="1.5"
      />
      <path
        d="M7 1.5A5.5 5.5 0 0 1 12.5 7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
