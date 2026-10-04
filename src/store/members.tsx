import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { listMembers } from '../lib/db'
import { useRealtime } from '../lib/realtime'
import type { Member } from '../lib/types'

type MembersValue = {
  members: Member[]
  reload: (silent?: boolean) => void
  loading: boolean
}

const MembersContext = createContext<MembersValue | null>(null)

/** 成员列表（只有「我」需要）：增删改名后实时同步 */
export function MembersProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(
    (silent = false) => {
      if (!enabled) {
        setMembers([])
        setLoading(false)
        return
      }
      if (!silent) setLoading(true)
      listMembers()
        .then(setMembers)
        .catch(() => setMembers([]))
        .finally(() => setLoading(false))
    },
    [enabled]
  )

  useEffect(() => {
    reload()
  }, [reload])

  useRealtime('members', [{ table: 'members', on: () => reload(true) }], {
    enabled,
    onPoll: () => reload(true),
  })

  const value = useMemo<MembersValue>(() => ({ members, reload, loading }), [members, reload, loading])
  return <MembersContext.Provider value={value}>{children}</MembersContext.Provider>
}

export function useMembers(): MembersValue {
  const ctx = useContext(MembersContext)
  if (!ctx) throw new Error('useMembers 必须在 MembersProvider 内使用')
  return ctx
}
