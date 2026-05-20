import { useEffect, useState } from 'react'

export type Breakpoint = 'mobile' | 'tablet' | 'desktop'

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(() => getBreakpoint())

  useEffect(() => {
    const mq768 = window.matchMedia('(min-width: 768px)')
    const mq1100 = window.matchMedia('(min-width: 1100px)')

    function update() {
      setBp(getBreakpoint())
    }

    mq768.addEventListener('change', update)
    mq1100.addEventListener('change', update)
    return () => {
      mq768.removeEventListener('change', update)
      mq1100.removeEventListener('change', update)
    }
  }, [])

  return bp
}

function getBreakpoint(): Breakpoint {
  if (typeof window === 'undefined') return 'mobile'
  if (window.innerWidth >= 1100) return 'desktop'
  if (window.innerWidth >= 768) return 'tablet'
  return 'mobile'
}
