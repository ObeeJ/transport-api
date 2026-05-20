import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '@/lib/auth'

export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <div className="min-h-dvh grid place-items-center text-[var(--color-stone)] text-sm">
        Loading…
      </div>
    )
  }
  if (status === 'unauthenticated') {
    return <Navigate to="/onboarding" state={{ from: location.pathname }} replace />
  }
  return <Outlet />
}
