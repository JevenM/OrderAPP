import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { verifyLogin } from '../lib/db'
import type { Role } from '../lib/types'

const KEY = 'order-app-session-v2'
/**
 * 最后一次操作的时间戳。单独存一个 key，不能并进 SessionState ——
 * 否则每记一次活动都要 setState，整棵组件树跟着重渲染。
 */
const ACTIVITY_KEY = 'order-app-session-active-at'

/**
 * 闲置多久就自动退出登录（毫秒）。改这一个常量即可，默认 60 分钟。
 * 手机落在桌上、或在公共设备上登录完忘了退，登录态不该一直挂着。
 *
 * 注意：本项目是「邀请码 + Supabase RPC 校验」，登录态只存在于浏览器 localStorage，
 * 并没有服务端会话，所以这个过期只能在前端判定。若要真正的服务端会话（别的设备也能
 * 感知、服务端可强制踢下线），需要引入会话表或改用 Supabase Auth。
 */
export const SESSION_IDLE_TIMEOUT = 60 * 60 * 1000
/** 活动时间的写入节流：鼠标动一下就写一次 localStorage 太浪费 */
const ACTIVITY_FLUSH_MS = 20_000
/** 多久检查一次有没有超时 */
const IDLE_CHECK_MS = 30_000

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
  /** 登录态是因为长时间未操作而被自动清掉的；登录页据此提示一次 */
  idleExpired: boolean
  clearIdleExpired: () => void
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

  /** 登录态因长时间未操作被自动清掉时置 true，登录页据此提示一次 */
  const [idleExpired, setIdleExpired] = useState(false)
  const clearIdleExpired = useCallback(() => setIdleExpired(false), [])

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
    try {
      localStorage.removeItem(ACTIVITY_KEY)
    } catch {
      // 存储不可用时忽略，退出登录本身不受影响
    }
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

  // 闲置自动退出：记住最后一次操作时间，超过 SESSION_IDLE_TIMEOUT 没动静就清掉登录态。
  // 依赖用 loggedIn 而不是 state —— 否则改个昵称、换个头像都要重建一遍监听。
  const loggedIn = state != null
  useEffect(() => {
    if (!loggedIn) return

    const readLast = () => {
      try {
        return Number(localStorage.getItem(ACTIVITY_KEY)) || 0
      } catch {
        return 0
      }
    }
    const touch = () => {
      try {
        localStorage.setItem(ACTIVITY_KEY, String(Date.now()))
      } catch {
        // 存不进去就退化成「每次检查都算活跃」：宁可不退出，也不误伤用户
      }
    }

    // 刚登录或存储被清过：记为活跃，免得刷新一下就被踢出去
    if (!readLast()) touch()

    let flushed = 0
    const onActivity = () => {
      const now = Date.now()
      if (now - flushed < ACTIVITY_FLUSH_MS) return
      flushed = now
      touch()
    }
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'wheel', 'touchstart']
    for (const e of events) window.addEventListener(e, onActivity, { passive: true })

    const check = () => {
      const last = readLast()
      if (!last) {
        touch()
        return
      }
      if (Date.now() - last < SESSION_IDLE_TIMEOUT) return
      try {
        localStorage.removeItem(ACTIVITY_KEY)
      } catch {
        // 清不掉也不影响退出
      }
      setIdleExpired(true)
      logout()
    }
    const timer = window.setInterval(check, IDLE_CHECK_MS)
    // 切回前台立刻查一次：切走或息屏的那段时间不算「操作」
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      for (const e of events) window.removeEventListener(e, onActivity)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(timer)
    }
  }, [loggedIn, logout])

  const value = useMemo<SessionValue>(
    () => ({
      idleExpired,
      clearIdleExpired,
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
    [state, isAdmin, enter, setViewMember, setMyAvatar, setMyName, logout, idleExpired, clearIdleExpired]
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession 必须在 SessionProvider 内使用')
  return ctx
}
