import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { CHANGELOG, CURRENT_VERSION, loadSeen, saveSeen, type ChangelogEntry } from '../lib/changelog'
import { useSession } from './session'
import { useModuleFlags } from './moduleFlags'

type ChangelogValue = {
  /** 最新一条更新日志 */
  latest: ChangelogEntry | null
  /** 本次登录还没看过当前版本 → 该自动弹窗 */
  shouldShow: boolean
  /** 手动点「日志」打开（看全部历史） */
  manual: boolean
  open: () => void
  /** 关闭弹窗并把当前版本标记为已读 */
  dismiss: () => void
}

const ChangelogContext = createContext<ChangelogValue>({
  latest: CHANGELOG[0] ?? null,
  shouldShow: false,
  manual: false,
  open: () => {},
  dismiss: () => {},
})

export function ChangelogProvider({ children }: { children: ReactNode }) {
  const { entered, isAdmin, memberId } = useSession()
  const { isEnabled } = useModuleFlags()

  // 按登录身份分开记：同一个设备上「我」和「她」各自弹一次
  const identity = isAdmin ? 'me' : memberId ?? 'her'

  const [seen, setSeen] = useState<Record<string, string>>(() => loadSeen())
  const [manual, setManual] = useState(false)

  // 管理员把「更新日志」模块关掉后，既不再自动弹窗，也不给手动打开
  const changelogOn = isEnabled('changelog')
  const shouldShow = entered && changelogOn && !!CURRENT_VERSION && seen[identity] !== CURRENT_VERSION

  const dismiss = useCallback(() => {
    setSeen((prev) => {
      const next = { ...prev, [identity]: CURRENT_VERSION }
      saveSeen(next)
      return next
    })
    setManual(false)
  }, [identity])

  const open = useCallback(() => {
    if (!changelogOn) return
    setManual(true)
  }, [changelogOn])

  const value = useMemo<ChangelogValue>(
    () => ({ latest: CHANGELOG[0] ?? null, shouldShow, manual, open, dismiss }),
    [shouldShow, manual, open, dismiss]
  )

  return <ChangelogContext.Provider value={value}>{children}</ChangelogContext.Provider>
}

export function useChangelog(): ChangelogValue {
  return useContext(ChangelogContext)
}
