import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { listMembers } from '../lib/db'
import { supabase } from '../lib/supabase'
import type { Member } from '../lib/types'

type MembersValue = {
  members: Member[]
  reload: () => void
  loading: boolean
}

const MembersContext = createContext<MembersValue | null>(null)

/** 成员列表（只有「我」需要）：增删改名后实时同步 */
export function MembersProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(() => {
    if (!enabled) {
      setMembers([])
      setLoading(false)
      return
    }
    setLoading(true)
    listMembers()
      .then(setMembers)
      .catch(() => setMembers([]))
      .finally(() => setLoading(false))
  }, [enabled])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    if (!enabled) return
    const channel = supabase
      .channel('members')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, () => reload())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [enabled, reload])

  const value = useMemo<MembersValue>(() => ({ members, reload, loading }), [members, reload, loading])
  return <MembersContext.Provider value={value}>{children}</MembersContext.Provider>
}

export function useMembers(): MembersValue {
  const ctx = useContext(MembersContext)
  if (!ctx) throw new Error('useMembers 必须在 MembersProvider 内使用')
  return ctx
}
