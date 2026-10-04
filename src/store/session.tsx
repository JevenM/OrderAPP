import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ADMIN_CODE, INVITE_CODE } from '../lib/supabase'
import type { Role } from '../lib/types'

const KEY = 'order-app-session'

type SessionValue = {
  role: Role
  entered: boolean
  isAdmin: boolean
  enter: (code: string) => boolean
  setRole: (role: Role) => void
  logout: () => void
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ code: string; role: Role } | null>(() => {
    try {
      const raw = localStorage.getItem(KEY)
      return raw ? (JSON.parse(raw) as { code: string; role: Role }) : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (state) localStorage.setItem(KEY, JSON.stringify(state))
    else localStorage.removeItem(KEY)
  }, [state])

  const entered = state != null && (state.code === INVITE_CODE || state.code === ADMIN_CODE)

  // 真实身份：用管理口令进入的始终是“我”，切换视图只改 role，不改身份
  const isAdmin = state?.code === ADMIN_CODE

  const enter = useCallback((code: string) => {
    const c = code.trim()
    const role: Role | null = c === INVITE_CODE ? 'her' : c === ADMIN_CODE ? 'me' : null
    if (!role) return false
    setState({ code: c, role })
    return true
  }, [])

  const setRole = useCallback((role: Role) => {
    setState((s) => (s ? { ...s, role } : s))
  }, [])

  const logout = useCallback(() => setState(null), [])

  const value = useMemo<SessionValue>(
    () => ({ role: state?.role ?? 'her', entered, isAdmin, enter, setRole, logout }),
    [state, entered, isAdmin, enter, setRole, logout]
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession 必须在 SessionProvider 内使用')
  return ctx
}
