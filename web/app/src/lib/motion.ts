// Shared motion variants — one source of truth for all screens.
// Principle: calm, purposeful. Nothing bounces. Nothing spins for fun.

export const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
}

export const fadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1 },
}

// Stagger container — children animate in sequence
export const stagger = (staggerChildren = 0.07, delayChildren = 0.05) => ({
  hidden: {},
  show: { transition: { staggerChildren, delayChildren } },
})

// Standard easing — matches the brand's "quiet utility" feel
export const ease = [0.25, 0.1, 0.25, 1] as const

export const transition = {
  default: { duration: 0.3, ease },
  fast: { duration: 0.18, ease },
  slow: { duration: 0.45, ease },
}
