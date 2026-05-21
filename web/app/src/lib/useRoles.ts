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
