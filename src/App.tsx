import { useState, type ReactNode } from 'react'
import { HashRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ToastProvider, useToast } from './components/Toast'
import Avatar from './components/Avatar'
import ProfileSheet from './components/ProfileSheet'
import { saveMemberAvatar } from './components/AvatarSheet'
import { updateMember } from './lib/db'
import ChangelogModal from './components/ChangelogModal'
import { configured } from './lib/supabase'
import { requestNotifyPermission } from './lib/notify'
import { SessionProvider, useSession } from './store/session'
import { SettingsProvider, useSettings } from './store/settings'
import { UnreadProvider, useUnread } from './store/unread'
import { MembersProvider, useMembers } from './store/members'
import { FriendsProvider } from './store/friends'
import FeedNotifyPanel from './components/FeedNotifyPanel'
import { ChangelogProvider, useChangelog } from './store/changelog'
import type { Role } from './lib/types'
import Login from './pages/Login'
import OrderPage from './pages/OrderPage'
import MealLogPage from './pages/MealLogPage'
import FeedPage from './pages/FeedPage'
import CouplePage from './pages/CouplePage'
import AdminFriendships from './pages/AdminFriendships'
import AdminOrders from './pages/AdminOrders'
import AdminMeals from './pages/AdminMeals'
import AdminDishes from './pages/AdminDishes'
import AdminMembers from './pages/AdminMembers'

/** 互动空间开关；好友管理面板不对普通用户展示 */
export const ENABLE_FRIENDS = true

const HOME: Record<Role, string> = { her: '/order', me: '/admin/orders' }

export default function App() {
  return (
    <HashRouter>
      <SessionProvider>
        <ToastProvider>
          <SettingsProvider>
            <ChangelogProvider>
              <Shell />
              <ChangelogModal />
            </ChangelogProvider>
          </SettingsProvider>
        </ToastProvider>
      </SessionProvider>
    </HashRouter>
  )
}

function Shell() {
  const { entered, role, isAdmin } = useSession()

  if (!entered) {
    return (
      <UnreadProvider enabled={false}>
        <Login />
      </UnreadProvider>
    )
  }

  return (
    <UnreadProvider enabled={true}>
      <MembersProvider enabled={isAdmin}>
        <FriendsProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Navigate to={HOME[role]} replace />} />
              <Route path="/order" element={<OrderPage />} />
              <Route path="/meals" element={<MealLogPage />} />
              <Route path="/feed" element={<FeedPage />} />
              {!isAdmin && ENABLE_FRIENDS && <Route path="/couple" element={<CouplePage />} />}
              {isAdmin && <Route path="/admin/friendships" element={<AdminFriendships />} />}
              <Route path="/admin/orders" element={<AdminOrders />} />
              <Route path="/admin/meals" element={<AdminMeals />} />
              <Route path="/admin/dishes" element={<AdminDishes />} />
              <Route path="/admin/members" element={<AdminMembers />} />
              <Route path="*" element={<Navigate to={HOME[role]} replace />} />
            </Route>
          </Routes>
        </FriendsProvider>
      </MembersProvider>
    </UnreadProvider>
  )
}

const HEAD_BTN =
  'inline-flex h-8 max-w-[8rem] items-center gap-1 rounded-lg border border-brand-200 bg-white px-2 text-xs text-brand-600 active:bg-brand-50'
const PANEL =
  'absolute right-0 top-full z-40 mt-1.5 max-h-[60vh] w-40 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg'

function MenuItem({
  children,
  onClick,
  active,
  danger,
}: {
  children: ReactNode
  onClick: () => void
  active?: boolean
  danger?: boolean
}) {
  return (
    <button
      className={`block w-full truncate px-3 py-2 text-left ${
        active ? 'bg-brand-50 font-medium text-brand-600' : danger ? 'text-rose-600' : 'text-slate-600'
      } active:bg-brand-50`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function Layout() {
  const { role, setViewMember, isAdmin, memberId, memberName, memberAvatar, setMyAvatar, setMyName, logout } =
    useSession()
  const { adminName, adminAvatar, saveAdminAvatar, saveAdminName } = useSettings()
  const { members, reload: reloadMembers } = useMembers()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const unread = useUnread()
  const { open: openChangelog } = useChangelog()
  const toast = useToast()
  const [menu, setMenu] = useState<'member' | 'more' | 'feed' | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)

  /** 顶部头像：看到谁的脸就用谁的头像；「我」的视角用自己的 */
  const viewingMember = members.find((m) => m.id === memberId)
  const isMyView = role === 'me' || !memberId
  const avatarUrl = isMyView ? adminAvatar : (memberAvatar || viewingMember?.avatar_url || '')
  const avatarEmoji = isMyView ? '👨‍🍳' : '👧'
  /** 消息收件箱身份：管理员固定 'me'，她是自己的成员 id */
  const feedIdentity = isAdmin ? 'me' : memberId ?? ''

  const tabs: { to: string; label: string; emoji: string; badge?: number }[] =
    role === 'her'
      ? [
          { to: '/order', label: '点菜', emoji: '🧾' },
          { to: '/meals', label: '三餐', emoji: '🍚' },
          { to: '/feed', label: '饭圈', emoji: '📸' },
          ...(!isAdmin && ENABLE_FRIENDS ? [{ to: '/couple', label: '互动', emoji: '💞' }] : []),
        ]
      : [
          { to: '/admin/orders', label: '订单', emoji: '🧾', badge: unread.orders },
          { to: '/admin/meals', label: '饮食', emoji: '🍚', badge: unread.meals },
          { to: '/admin/dishes', label: '菜单', emoji: '📖', badge: unread.requests },
          { to: '/admin/members', label: '成员', emoji: '👭' },
          { to: '/feed', label: '饭圈', emoji: '📸' },
        ]

  const subtitle = isAdmin && role === 'her' && memberId
    ? `正在查看：${memberName || '她'}`
    : role === 'her'
      ? `嗨，${memberName || '她'} 👋`
      : adminName

  const enableBell = async () => {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      toast.show('通知需要 HTTPS 环境，请使用 HTTPS 访问', 'err')
      return
    }
    const p = await requestNotifyPermission()
    if (p === 'granted') {
      toast.show('已开启通知 🔔')
    } else if (p === 'unsupported') {
      // 针对 iPhone / Safari 给出明确指引（需 iOS 16.4+ 且添加到主屏幕打开）
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)
      if (isIOS) {
        toast.show('iPhone 请先“添加到主屏幕”，在桌面打开即可开启通知 📲', 'err')
      } else {
        toast.show('当前浏览器未开放通知权限，可在手机/浏览器系统设置中开启', 'err')
      }
    } else {
      toast.show('通知未授权，请在浏览器地址栏或系统设置中允许通知', 'err')
    }
  }

  const doLogout = () => {
    if (!window.confirm('确定退出登录吗？')) return
    navigate('/', { replace: true }) // 清空当前地址，避免下次登录跳到上次的页面
    logout()
  }

  const run = (fn: () => void) => {
    setMenu(null)
    fn()
  }

  const switchMember = (id: string | null) => {
    setMenu(null)
    if (!id) {
      setViewMember(null)
      navigate('/admin/orders')
      return
    }
    const m = members.find((x) => x.id === id)
    if (m) {
      setViewMember({ id: m.id, name: m.name, avatarUrl: m.avatar_url ?? '' })
      navigate('/order')
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-brand-50/40 pb-20">
      <header className="sticky top-0 z-30 border-b border-brand-100 bg-white/95 backdrop-blur">
        <div className="relative flex items-center gap-2 px-3 py-2">
          <button
            className="shrink-0 rounded-full transition active:scale-95"
            title="点击修改头像和昵称"
            onClick={() => setProfileOpen(true)}
          >
            <Avatar url={avatarUrl} emoji={avatarEmoji} size={38} />
          </button>
          <div className="min-w-0 flex-1">
            {/* <h1 className="truncate text-[15px] font-semibold leading-tight text-brand-600">{APP_TITLE}</h1> */}
            <p className="truncate text-[11px] leading-tight text-slate-400">{subtitle}</p>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {/* 消息通知：好友发动态 / 点赞 / 评论时未读 +1，点开查看后消失 */}
            <div className="relative">
              <button
                className={`${HEAD_BTN} relative`}
                title="消息通知"
                onClick={() => setMenu((m) => (m === 'feed' ? null : 'feed'))}
              >
                🔔
                {unread.feedUnread > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 min-w-[16px] animate-pop-in rounded-full bg-rose-500 px-1 text-center text-[10px] font-semibold leading-4 text-white">
                    {unread.feedUnread > 99 ? '99+' : unread.feedUnread}
                  </span>
                )}
              </button>
              {menu === 'feed' && <FeedNotifyPanel identity={feedIdentity} onClose={() => setMenu(null)} />}
            </div>
            {isAdmin && (
              <div className="relative">
                <button
                  className={`${HEAD_BTN} ${memberId ? 'bg-brand-50 ring-1 ring-brand-200' : ''}`}
                  onClick={() => setMenu((m) => (m === 'member' ? null : 'member'))}
                >
                  👥<span className="max-w-[4.5rem] truncate">{memberId ? memberName || '她' : '切换'}</span>
                </button>
                {menu === 'member' && (
                  <div className={PANEL}>
                    <div className="px-3 pb-1 pt-1.5 text-[11px] text-slate-400">切换到她的视角</div>
                    <MenuItem active={!memberId} onClick={() => switchMember(null)}>
                      我的管理视图
                    </MenuItem>
                    {members.map((m) => (
                      <MenuItem key={m.id} active={m.id === memberId} onClick={() => switchMember(m.id)}>
                        {m.name}
                      </MenuItem>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="relative">
              <button
                className={HEAD_BTN}
                title="更多"
                onClick={() => setMenu((m) => (m === 'more' ? null : 'more'))}
              >
                ⋯
              </button>
              {menu === 'more' && (
                <div className={PANEL}>
                  {role === 'me' && (
                    <MenuItem onClick={() => run(enableBell)}>开启推送通知</MenuItem>
                  )}
                  {isAdmin && role === 'me' && (
                    <MenuItem onClick={() => run(() => navigate('/admin/friendships'))}>好友关系管理</MenuItem>
                  )}
                  <MenuItem onClick={() => run(() => setProfileOpen(true))}>个人资料</MenuItem>
                  <MenuItem onClick={() => run(openChangelog)}>更新日志</MenuItem>
                  <MenuItem danger onClick={() => run(doLogout)}>
                    退出登录
                  </MenuItem>
                </div>
              )}
            </div>
          </div>

          {menu && <div className="fixed inset-0 z-30" onClick={() => setMenu(null)} />}
        </div>
      </header>

      {isAdmin && role === 'her' && memberId && (
        <div className="mx-3 mt-2 flex animate-fade-down items-center gap-2 rounded-xl bg-brand-50 px-3 py-1.5 text-[11px] text-brand-700">
          <span className="min-w-0 flex-1 truncate">
            👧 正在查看「{memberName || '她'}」，只看她的数据
          </span>
          <button
            className="shrink-0 rounded-lg bg-white px-2 py-0.5 text-brand-600"
            onClick={() => {
              setViewMember(null)
              navigate('/admin/orders')
            }}
          >
            回到全员
          </button>
        </div>
      )}

      {!configured && (
        <div className="m-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
          还没配置 Supabase：复制 <code>.env.example</code> 为 <code>.env</code> 填入 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 后重启。
        </div>
      )}

      {/* key 让每次切页都重新播一次入场动画 */}
      <main key={pathname} className="flex-1 animate-page px-4 py-4">
        <Outlet />
      </main>

      {profileOpen && (
        <ProfileSheet
          open
          title={isMyView ? '我的资料' : `${viewingMember?.name || memberName || '她'}的资料`}
          name={isMyView ? adminName : memberName || viewingMember?.name || ''}
          avatarUrl={avatarUrl}
          fallbackEmoji={avatarEmoji}
          hint={isMyView ? '改完头像和昵称，好友那边立刻就能看到' : '昵称和头像改完，你的好友立刻能看到'}
          onSaveAvatar={async (url) => {
            if (isMyView || !memberId) await saveAdminAvatar(url)
            else {
              await saveMemberAvatar(memberId, url)
              setMyAvatar(url)
              reloadMembers()
            }
          }}
          onSaveName={async (n) => {
            if (isMyView || !memberId) await saveAdminName(n)
            else {
              if (members.some((x) => x.id !== memberId && x.name.toLowerCase() === n.trim().toLowerCase())) {
                throw new Error('这个昵称已被其他成员使用，请换一个')
              }
              await updateMember(memberId, { name: n.trim() })
              setMyName(n.trim())
              reloadMembers()
            }
          }}
          onClose={() => setProfileOpen(false)}
        />
      )}

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md border-t border-brand-100 bg-white/95 backdrop-blur">
        {tabs.map((t) => {
          const active = pathname === t.to
          return (
            <NavLink
              key={t.to}
              to={t.to}
              className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors duration-200 ${
                active ? 'text-brand-600' : 'text-slate-400'
              }`}
            >
              <span className={`text-lg leading-none transition-transform duration-200 ${active ? 'scale-110' : ''}`}>
                {t.emoji}
              </span>
              <span>{t.label}</span>
              {active && <span className="absolute inset-x-0 top-0 mx-auto h-0.5 w-8 rounded-full bg-brand-400 animate-pop-in" />}
              {!!t.badge && t.badge > 0 && (
                <span className="absolute right-[22%] top-1 min-w-[16px] animate-pop-in rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-4 text-white">
                  {t.badge > 99 ? '99+' : t.badge}
                </span>
              )}
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
