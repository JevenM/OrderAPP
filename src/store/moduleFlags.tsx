import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { listModuleFlags, saveModuleFlag, deleteModuleFlag, type ModuleFlagRow } from '../lib/db'
import { type ModuleKey } from '../lib/modules'
import { useRealtime } from '../lib/realtime'
import { useSession } from './session'

type FlagsValue = {
  /** 原始开关行（全局 + 成员单独配置），管理页直接用 */
  rows: ModuleFlagRow[]
  loading: boolean
  /** 某个成员（null = 全局视角）对某模块的最终可用性：成员配置 > 全局配置 > 默认开放 */
  isEnabled: (key: ModuleKey, memberId?: string | null) => boolean
  /** 管理员保存开关 */
  save: (key: ModuleKey, enabled: boolean, memberId?: string | null) => Promise<void>
  /** 管理员清除某成员的单独配置，回落到全局 */
  clearForMember: (key: ModuleKey, memberId: string) => Promise<void>
  reload: () => Promise<void>
}

const FlagsContext = createContext<FlagsValue>({
  rows: [],
  loading: true,
  isEnabled: () => true,
  save: async () => {},
  clearForMember: async () => {},
  reload: async () => {},
})

/**
 * 模块开关：管理员控制普通用户登录后能看到 / 用到哪些模块。
 * 管理员自己不受开关限制（否则一旦关掉自己就进不去管理页了）。
 */
export function ModuleFlagsProvider({ children }: { children: ReactNode }) {
  const { memberId, isAdmin } = useSession()
  const [rows, setRows] = useState<ModuleFlagRow[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      setRows(await listModuleFlags())
    } catch {
      // 读不到就按「全部开放」处理，别把整个应用锁死
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useRealtime('module-flags', [{ table: 'app_module_flags', on: () => void reload() }], {
    onPoll: () => void reload(),
  })

  const isEnabled = useCallback(
    (key: ModuleKey, viewer: string | null = memberId) => {
      if (isAdmin) return true
      const scoped = rows.find((row) => row.key === key && row.member_id === viewer)
      if (scoped) return scoped.enabled
      const global = rows.find((row) => row.key === key && row.member_id === null)
      if (global) return global.enabled
      return true // 没配置过的模块默认开放
    },
    [rows, memberId, isAdmin]
  )

  const save = useCallback(async (key: ModuleKey, enabled: boolean, target: string | null = null) => {
    await saveModuleFlag(key, enabled, target)
    setRows((prev) => {
      const next = prev.filter((row) => !(row.key === key && row.member_id === target))
      return [...next, { key, member_id: target, enabled, updated_at: new Date().toISOString() }]
    })
  }, [])

  const clearForMember = useCallback(async (key: ModuleKey, target: string) => {
    await deleteModuleFlag(key, target)
    setRows((prev) => prev.filter((row) => !(row.key === key && row.member_id === target)))
  }, [])

  const value = useMemo<FlagsValue>(
    () => ({ rows, loading, isEnabled, save, clearForMember, reload }),
    [rows, loading, isEnabled, save, clearForMember, reload]
  )

  return <FlagsContext.Provider value={value}>{children}</FlagsContext.Provider>
}

export function useModuleFlags(): FlagsValue {
  return useContext(FlagsContext)
}
