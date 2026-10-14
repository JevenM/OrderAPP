import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { verifyLogin } from '../lib/db'
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
    // 存储可能因配额满 / Safari 隐私模式 / 系统禁用而抛错：
    // 会话存不进去不能影响登录和使用，失败时顺手清掉体积大的缓存兜底
    try {
      if (state) localStorage.setItem(KEY, JSON.stringify(state))
      else localStorage.removeItem(KEY)
    } catch {
      try {
        for (let i = 0; i < localStorage.length; ) {
          const k = localStorage.key(i)
          if (k && (k.startsWith('chat:') || k.startsWith('wishes:') || k.startsWith('draw-'))) localStorage.removeItem(k)
          else i += 1
        }
      } catch {
        // 清理也失败就只能放弃持久化，本次会话仍可正常使用
      }
    }
  }, [state])

  // 真实身份来自数据库端校验结果；不再通过前端 bundle 中的管理口令判断。
  const isAdmin = state?.role === 'me'

  const enter = useCallback(async (code: string) => {
    const c = code.trim()
    if (!c) return false

    const verified = await verifyLogin(c)
    if (!verified) {
      throw new Error('登录校验服务尚未部署：请先执行 supabase/migrations/0035_login_verify.sql')
    }
    if (!verified.ok) return false

    if (verified.role === 'me') {
      setState({ code: '', role: 'me', memberId: null, memberName: '', memberAvatar: '' })
      return true
    }
    if (!verified.member_id) return false

    setState({
      code: c,
      role: 'her',
      memberId: verified.member_id,
      memberName: verified.member_name ?? '',
      memberAvatar: verified.member_avatar ?? '',
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

  const logout = useCallback(() => {
    // 登出时清除互动缓存（留言、心愿、题库草稿、棋局快照等）；账号私密内容不跨会话留存
    for (const storage of [localStorage, sessionStorage]) {
      try {
        for (let i = 0; i < storage.length; ) {
          const k = storage.key(i)
          if (k?.startsWith('couple-')) storage.removeItem(k)
          else i += 1
        }
      } catch {
        // Safari 隐私模式可能禁用 Storage；不影响退出登录
      }
    }
    setState(null)
  }, [])

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
