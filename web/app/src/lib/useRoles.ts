import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { api } from '@/lib/api'

export type Role = 'giver' | 'commuter' | 'driver' | 'steward'

// Derives which roles a user has access to based on their account state.
// Results are cached in module-level state to avoid re-fetching on every render.
let cachedRoles: Role[] | null = null
let cachedUserId: string | null = null

export function useRoles() {
  const { user, status } = useAuth()
  const [roles, setRoles] = useState<Role[]>(() => {
    if (cachedUserId === user?.id && cachedRoles) return cachedRoles
    return ['giver', 'commuter']
  })

  useEffect(() => {
    if (status === 'loading') return
    if (!user) { setRoles(['giver', 'commuter']); return }
    // Return cache if same user
    if (cachedUserId === user.id && cachedRoles) {
      setRoles(cachedRoles)
      return
    }
    // Fetch both in parallel, single time per user session
    Promise.all([
      api.get<{ status: string }>('/driver/me').catch(() => null),
      api.get<{ status: string }>('/recipients/me').catch(() => null),
    ]).then(([driver, _recipient]) => {
      const r: Role[] = ['giver', 'commuter']
      if (driver?.status === 'approved' || driver?.status === 'pending') r.push('driver')
      if (user.role === 'steward' || user.role === 'admin') r.push('steward')
      cachedRoles = r
      cachedUserId = user.id
      setRoles(r)
    })
  }, [user?.id, status])

  return roles
}

export const roleLabels: Record<Role, string> = {
  giver: 'Give',
  commuter: 'Commute',
  driver: 'Drive',
  steward: 'Steward',
}

export const roleRoutes: Record<Role, string> = {
  giver: '/give',
  commuter: '/ride',
  driver: '/drive',
  steward: '/steward',
}

// Active-role memory — used so shared pages (Account, Notifications) can
// render the shell of whatever rail the user came from instead of always
// flipping to giver. Persists across reloads via sessionStorage; falls
// back to giver when nothing is stored or in-memory only when storage is
// unavailable (e.g. private mode).
const ACTIVE_ROLE_KEY = 'akin.activeRole'
const SHARED_ROLES: Role[] = ['giver', 'commuter', 'driver', 'steward']

export function setActiveRole(role: Role): void {
  try {
    sessionStorage.setItem(ACTIVE_ROLE_KEY, role)
  } catch {
    // sessionStorage can throw in private mode / when disabled; ignore.
  }
}

export function getActiveRole(): Role {
  try {
    const v = sessionStorage.getItem(ACTIVE_ROLE_KEY)
    if (v && (SHARED_ROLES as string[]).includes(v)) return v as Role
  } catch {
    /* ignore */
  }
  return 'giver'
}
