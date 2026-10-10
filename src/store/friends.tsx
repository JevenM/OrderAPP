import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { listFriendRequests, listFriends, listMembers } from '../lib/db'
import { useRealtime } from '../lib/realtime'
import type { FriendProfile, FriendRequestItem } from '../lib/types'
import { useSession } from './session'
import { useSettings } from './settings'

export type FriendsValue = {
  /** 好友列表（管理员 视图下 = 所有账户，因为默认和所有人都是好友） */
  friends: FriendProfile[]
  /** 好友 id 列表，喂给饭圈做可见性过滤 */
  friendIds: string[]
  /** 别人发给我的申请 */
  incoming: FriendRequestItem[]
  /** 我发出去的申请 */
  outgoing: FriendRequestItem[]
  loading: boolean
  reload: (silent?: boolean) => void
  /** 是不是好友（管理员 不算在列表里，由调用方单独放行） */
  isFriend: (memberId: string | null) => boolean
  /** 好友显示名：有备注用备注，没备注用对方昵称；不是好友返回空串（调用方兜底） */
  displayName: (memberId: string | null) => string
  /** 好友头像 */
  avatarOf: (memberId: string | null) => string
}

const FriendsContext = createContext<FriendsValue | null>(null)

/**
 * 好友数据：
 * - 管理视图：默认和所有账户都是好友，直接把成员表当成好友列表；
 * - 她（含 管理员 切到某个她的视角）：只加载她自己的好友和申请。
 */
export function FriendsProvider({ children }: { children: ReactNode }) {
  const { entered, isAdmin, role, memberId } = useSession()
  const { adminName, viewerAdminName } = useSettings()
  /** 管理员 自己的视角（不是切换到某个她） */
  const adminView = isAdmin && role === 'me'
  const adminDisplayName = memberId ? viewerAdminName : adminName
  /** 这份好友列表属于谁：null = 管理员 */
  const ownerId = adminView ? null : memberId

  const [friends, setFriends] = useState<FriendProfile[]>([])
  const [incoming, setIncoming] = useState<FriendRequestItem[]>([])
  const [outgoing, setOutgoing] = useState<FriendRequestItem[]>([])
  const [loading, setLoading] = useState(false)

  const reload = useCallback(
    (silent = false) => {
      if (!entered) {
        setFriends([])
        setIncoming([])
        setOutgoing([])
        return
      }
      if (!silent) setLoading(true)

      const job: Promise<{
        friends: FriendProfile[]
        incoming: FriendRequestItem[]
        outgoing: FriendRequestItem[]
      }> =
        ownerId === null
          ? // 管理员：所有账户都是好友
            listMembers().then((ms) => ({
              friends: ms.map((m) => ({
                memberId: m.id,
                name: m.name,
                avatarUrl: m.avatar_url ?? '',
                note: '',
                shownName: m.name,
                friendshipId: '',
                since: m.created_at,
              })),
              incoming: [] as FriendRequestItem[],
              outgoing: [] as FriendRequestItem[],
            }))
          : Promise.all([listFriends(ownerId), listFriendRequests(ownerId)]).then(([f, r]) => ({
              friends: [
                {
                  memberId: '__admin__',
                  name: adminDisplayName,
                  avatarUrl: '',
                  note: '',
                  shownName: adminDisplayName,
                  friendshipId: '',
                  since: '',
                },
                ...f.filter((friend) => friend.memberId !== '__admin__'),
              ],
              incoming: r.incoming,
              outgoing: r.outgoing,
            }))

      job
        .then((v) => {
          setFriends(v.friends)
          setIncoming(v.incoming)
          setOutgoing(v.outgoing)
        })
        .catch(() => {
          // 没跑 0011_friends.sql 时保持空列表，别把页面搞崩
        })
        .finally(() => setLoading(false))
    },
    [adminDisplayName, entered, ownerId]
  )

  useEffect(() => {
    reload()
  }, [reload])

  useRealtime(
    'friends',
    [
      { table: 'friendships', on: () => reload(true) },
      // 好友改昵称 / 换头像后立刻跟着变
      { table: 'members', on: () => reload(true) },
    ],
    { enabled: entered, onPoll: () => reload(true) }
  )

  const friendIds = useMemo(() => friends.map((f) => f.memberId), [friends])
  const byId = useMemo(() => new Map(friends.map((f) => [f.memberId, f])), [friends])

  const value = useMemo<FriendsValue>(
    () => ({
      friends,
      friendIds,
      incoming,
      outgoing,
      loading,
      reload,
      isFriend: (id) => !!id && byId.has(id),
      displayName: (id) => (id ? (byId.get(id)?.shownName ?? '') : ''),
      avatarOf: (id) => (id ? (byId.get(id)?.avatarUrl ?? '') : ''),
    }),
    [friends, friendIds, byId, incoming, outgoing, loading, reload]
  )

  return <FriendsContext.Provider value={value}>{children}</FriendsContext.Provider>
}

export function useFriends(): FriendsValue {
  const ctx = useContext(FriendsContext)
  if (!ctx) throw new Error('useFriends 必须在 FriendsProvider 内使用')
  return ctx
}
