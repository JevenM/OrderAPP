import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ADMIN_CODE, INVITE_CODE } from '../lib/supabase'
import { createMember, findMemberByCode, listMembers } from '../lib/db'
import type { Role } from '../lib/types'

const KEY = 'order-app-session-v2'

type SessionState = {
  code: string
  role: Role
  memberId: string | null
  memberName: string
  /** 当前查看的那个她的头像（登录后跟着一起记住，她本人也能看到自己的头像） */
  memberAvatar: string
}

type SessionValue = {
  role: Role
  entered: boolean
  isAdmin: boolean
  memberId: string | null
  memberName: string
  memberAvatar: string
  /** 登录用的邀请码（管理员 就是管理口令）：给别人加好友时用 */
  code: string
  enter: (code: string) => Promise<boolean>
  setViewMember: (m: { id: string; name: string; avatarUrl?: string | null } | null) => void
  /** 她自己换完头像后同步进登录态（不用重新登录就能看到） */
  setMyAvatar: (url: string | null) => void
  /** 她自己改完昵称后同步进登录态 */
  setMyName: (name: string) => void
  logout: () => void
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState | null>(() => {
    try {
      const raw = localStorage.getItem(KEY)
      return raw ? (JSON.parse(raw) as SessionState) : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (state) localStorage.setItem(KEY, JSON.stringify(state))
    else localStorage.removeItem(KEY)
  }, [state])

  // 真实身份：用管理口令进入的始终是「我」；切换查看某个她只改 role，不改身份
  const isAdmin = state?.code === ADMIN_CODE

  const enter = useCallback(async (code: string) => {
    const c = code.trim()
    if (!c) return false

    if (c === ADMIN_CODE) {
      setState({ code: c, role: 'me', memberId: null, memberName: '', memberAvatar: '' })
      return true
    }

    // 她的专属邀请码
    let member = await findMemberByCode(c)

    // 兼容主邀请码：映射到第一个成员；成员表为空时自动建一个
    if (!member && c === INVITE_CODE) {
      const all = await listMembers()
      member = all[0] ?? (await createMember('她', c))
    }
    if (!member) return false

    setState({
      code: c,
      role: 'her',
      memberId: member.id,
      memberName: member.name,
      memberAvatar: member.avatar_url ?? '',
    })
    return true
  }, [])

  /** 「我」切换查看某个她；传 null 回到管理视图 */
  const setViewMember = useCallback((m: { id: string; name: string; avatarUrl?: string | null } | null) => {
    setState((s) =>
      s
        ? {
            ...s,
            role: m ? 'her' : 'me',
            memberId: m?.id ?? null,
            memberName: m?.name ?? '',
            memberAvatar: m?.avatarUrl ?? '',
          }
        : s
    )
  }, [])

  /** 她自己换头像后立刻生效（省得重新登录） */
  const setMyAvatar = useCallback((url: string | null) => {
    setState((s) => (s ? { ...s, memberAvatar: url ?? '' } : s))
  }, [])

  /** 她自己改昵称后立刻生效 */
  const setMyName = useCallback((name: string) => {
    setState((s) => (s ? { ...s, memberName: name } : s))
  }, [])

  const logout = useCallback(() => setState(null), [])

  const value = useMemo<SessionValue>(
    () => ({
      role: state?.role ?? 'her',
      entered: state != null,
      isAdmin,
      memberId: state?.memberId ?? null,
      memberName: state?.memberName ?? '',
      memberAvatar: state?.memberAvatar ?? '',
      code: state?.code ?? '',
      enter,
      setViewMember,
      setMyAvatar,
      setMyName,
      logout,
    }),
    [state, isAdmin, enter, setViewMember, setMyAvatar, setMyName, logout]
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession 必须在 SessionProvider 内使用')
  return ctx
}
