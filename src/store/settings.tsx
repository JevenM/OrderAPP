import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getMemberMyName, getSetting, setSetting } from '../lib/db'
import { useRealtime } from '../lib/realtime'
import { ADMIN_NAME } from '../lib/supabase'
import { useSession } from './session'

export const ADMIN_NAME_KEY = 'admin_name'
export const ADMIN_AVATAR_KEY = 'admin_avatar'

type SettingsValue = {
  /** 我的昵称（全局默认）：没给某个她单独设置时，她看到的就是这个 */
  adminName: string
  saveAdminName: (name: string) => Promise<void>
  /** 我的头像（存在 app_settings，饭圈里显示的那张） */
  adminAvatar: string
  saveAdminAvatar: (url: string | null) => Promise<void>
  /**
   * 当前视图里看到的「我」的昵称：
   * - 某个她（或我切换到某个她的视角）：她在成员里单独设过就用那个，否则回落全局昵称
   * - 我的管理视图：就是全局昵称
   */
  viewerAdminName: string
}

const SettingsContext = createContext<SettingsValue>({
  adminName: ADMIN_NAME,
  saveAdminName: async () => {},
  adminAvatar: '',
  saveAdminAvatar: async () => {},
  viewerAdminName: ADMIN_NAME,
})

/** 应用设置：所有身份都要读（她要看到「我」的昵称），所以不受管理员身份限制 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const { memberId } = useSession()
  const [adminName, setAdminName] = useState(ADMIN_NAME)
  const [adminAvatar, setAdminAvatar] = useState('')
  /** 当前查看的那个她眼里的我叫什么（空 = 没单独设置） */
  const [privateName, setPrivateName] = useState('')

  const load = useCallback(async () => {
    try {
      setAdminName(await getSetting(ADMIN_NAME_KEY, ADMIN_NAME))
    } catch {
      // 没跑 0006_settings.sql 时保持默认值
    }
    try {
      setAdminAvatar(await getSetting(ADMIN_AVATAR_KEY, ''))
    } catch {
      // 头像可选，读不到就不显示
    }
  }, [])

  const loadPrivateName = useCallback(async () => {
    try {
      setPrivateName(await getMemberMyName(memberId))
    } catch {
      // 读不到就用全局昵称，别把整个页面搞崩
    }
  }, [memberId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadPrivateName()
  }, [loadPrivateName])

  useRealtime(
    'app-settings',
    [
      { table: 'app_settings', on: () => void load() },
      // 我在「成员」页改了某个她的专属称呼，她那边立刻跟着变
      { table: 'members', on: () => void loadPrivateName() },
    ],
    {
      onPoll: () => {
        void load()
        void loadPrivateName()
      },
    }
  )

  const saveAdminName = useCallback(
    async (name: string) => {
      await setSetting(ADMIN_NAME_KEY, name.trim())
      setAdminName(name.trim() || ADMIN_NAME)
    },
    []
  )

  const saveAdminAvatar = useCallback(async (url: string | null) => {
    await setSetting(ADMIN_AVATAR_KEY, url ?? '')
    setAdminAvatar(url ?? '')
  }, [])

  const viewerAdminName = privateName || adminName

  const value = useMemo<SettingsValue>(
    () => ({ adminName, saveAdminName, adminAvatar, saveAdminAvatar, viewerAdminName }),
    [adminName, saveAdminName, adminAvatar, saveAdminAvatar, viewerAdminName]
  )
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsValue {
  return useContext(SettingsContext)
}
