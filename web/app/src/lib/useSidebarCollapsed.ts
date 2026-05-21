import { useState, useEffect } from 'react'

const KEY = 'akin:sidebar-collapsed'

export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(KEY) === 'true' } catch { return false }
  })

  useEffect(() => {
    try { localStorage.setItem(KEY, String(collapsed)) } catch { /* noop */ }
  }, [collapsed])

  return [collapsed, setCollapsed] as const
}
