import { Navigate, Outlet } from 'react-router'
import { useAuth } from '@/lib/auth'

export function RequireAdmin() {
  const { user, status } = useAuth()
  if (status === 'loading') {
    return (
      <div className="min-h-dvh grid place-items-center text-[var(--color-stone)] text-sm">
        Loading…
      </div>
    )
  }
  if (status === 'unauthenticated') return <Navigate to="/admin/sign-in" replace />
  if (user?.role !== 'admin') return <Navigate to="/admin/sign-in" replace />
  return <Outlet />
}
