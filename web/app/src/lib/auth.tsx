import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { ApiError, api } from '@/lib/api'

export type User = {
  id: string
  email: string
  firstName: string
  lastName: string
  phone: string
  role: 'member' | 'steward' | 'admin'
  emailVerifiedAt?: string
  createdAt: string
}

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

type AuthContextValue = {
  user: User | null
  status: AuthStatus
  signup: (input: { email: string; firstName: string; lastName: string; phone: string; password: string; acceptedPrivacy: boolean }) => Promise<User>
  login: (input: { email: string; password: string }) => Promise<User>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')

  const refresh = useCallback(async () => {
    try {
      const me = await api.get<User>('/auth/me')
      setUser(me)
      setStatus('authenticated')
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null)
        setStatus('unauthenticated')
        return
      }
      setUser(null)
      setStatus('unauthenticated')
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh])

  const signup: AuthContextValue['signup'] = async (input) => {
    const u = await api.post<User>('/auth/signup', input)
    setUser(u)
    setStatus('authenticated')
    return u
  }

  const login: AuthContextValue['login'] = async (input) => {
    const u = await api.post<User>('/auth/login', input)
    setUser(u)
    setStatus('authenticated')
    return u
  }

  const logout: AuthContextValue['logout'] = async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      setUser(null)
      setStatus('unauthenticated')
    }
  }

  return (
    <AuthContext.Provider value={{ user, status, signup, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
