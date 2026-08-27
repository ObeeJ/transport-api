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
  if (status === 'unauthenticated') return <Navigate to="/onboarding" replace />
  if (user?.role !== 'admin') {
    return (
      <div className="min-h-dvh grid place-items-center text-center px-6 text-[var(--color-stone)]">
        <div>
          <div className="text-2xl text-[var(--color-indigo)] mb-2">Admin only.</div>
          <p className="text-sm">This area is restricted to the platform administrator.</p>
        </div>
      </div>
    )
  }
  return <Outlet />
}
