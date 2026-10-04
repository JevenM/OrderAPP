import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getSetting, setSetting } from '../lib/db'
import { useRealtime } from '../lib/realtime'
import { ADMIN_NAME } from '../lib/supabase'

export const ADMIN_NAME_KEY = 'admin_name'

type SettingsValue = {
  /** 我的昵称：她在饭圈里看到的名字 */
  adminName: string
  saveAdminName: (name: string) => Promise<void>
}

const SettingsContext = createContext<SettingsValue>({
  adminName: ADMIN_NAME,
  saveAdminName: async () => {},
})

/** 应用设置：所有身份都要读（她要看到「我」的昵称），所以不受管理员身份限制 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [adminName, setAdminName] = useState(ADMIN_NAME)

  const load = useCallback(async () => {
    try {
      setAdminName(await getSetting(ADMIN_NAME_KEY, ADMIN_NAME))
    } catch {
      // 没跑 0006_settings.sql 时保持默认值
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useRealtime('app-settings', [{ table: 'app_settings', on: () => void load() }], { onPoll: () => void load() })

  const saveAdminName = useCallback(
    async (name: string) => {
      await setSetting(ADMIN_NAME_KEY, name.trim())
      setAdminName(name.trim() || ADMIN_NAME)
    },
    []
  )

  const value = useMemo<SettingsValue>(() => ({ adminName, saveAdminName }), [adminName, saveAdminName])
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsValue {
  return useContext(SettingsContext)
}
