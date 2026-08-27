import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { api } from '@/lib/api'

export type Role = 'giver' | 'commuter' | 'driver' | 'steward'

const ROLES_CACHE_KEY = 'akin.roles'

function readCache(userId: string): Role[] | null {
  try {
    const raw = sessionStorage.getItem(ROLES_CACHE_KEY)
    if (!raw) return null
    const { id, roles } = JSON.parse(raw)
    if (id === userId) return roles as Role[]
  } catch { /* ignore */ }
  return null
}

function writeCache(userId: string, roles: Role[]): void {
  try {
    sessionStorage.setItem(ROLES_CACHE_KEY, JSON.stringify({ id: userId, roles }))
  } catch { /* ignore */ }
}

export function clearRolesCache(): void {
  try { sessionStorage.removeItem(ROLES_CACHE_KEY) } catch { /* ignore */ }
}

export function useRoles() {
  const { user, status } = useAuth()
  const [roles, setRoles] = useState<Role[]>(() => {
    if (user?.id) {
      const cached = readCache(user.id)
      if (cached) return cached
    }
    return ['giver', 'commuter']
  })

  useEffect(() => {
    if (status === 'loading') return
    if (!user) {
      setRoles(['giver', 'commuter'])
      return
    }
    const cached = readCache(user.id)
    if (cached) {
      setRoles(cached)
      return
    }
    Promise.all([
      api.get<{ status: string }>('/driver/me').catch(() => null),
      api.get<{ status: string }>('/recipients/me').catch(() => null),
    ]).then(([driver]) => {
      const r: Role[] = ['giver', 'commuter']
      if (driver?.status === 'approved' || driver?.status === 'pending') r.push('driver')
      if (user.role === 'steward' || user.role === 'admin') r.push('steward')
      writeCache(user.id, r)
      setRoles(r)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
