import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { api } from '@/lib/api'

export type Role = 'giver' | 'commuter' | 'driver'

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
    if (!user) { setRoles(['giver', 'commuter']); return }
    const cached = readCache(user.id)
    if (cached) { setRoles(cached); return }
    api.get<{ status: string }>('/driver/me').catch(() => null).then((driver) => {
      const r: Role[] = ['giver', 'commuter']
      if (driver?.status === 'approved' || driver?.status === 'pending') r.push('driver')
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
}

export const roleRoutes: Record<Role, string> = {
  giver: '/give',
  commuter: '/ride',
  driver: '/drive',
}

const ACTIVE_ROLE_KEY = 'akin.activeRole'
const VALID_ROLES: Role[] = ['giver', 'commuter', 'driver']

export function setActiveRole(role: Role): void {
  try { sessionStorage.setItem(ACTIVE_ROLE_KEY, role) } catch { /* ignore */ }
}

export function getActiveRole(): Role {
  try {
    const v = sessionStorage.getItem(ACTIVE_ROLE_KEY)
    if (v && (VALID_ROLES as string[]).includes(v)) return v as Role
  } catch { /* ignore */ }
  return 'giver'
}
