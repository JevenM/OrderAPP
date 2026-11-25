import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { HashRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ToastProvider, useToast } from './components/Toast'
import { ConfirmHost, useConfirm } from './components/Modal'
import Avatar from './components/Avatar'
import ProfileSheet from './components/ProfileSheet'
import ThemePicker from './components/ThemePicker'
import { saveMemberAvatar } from './components/AvatarSheet'
import { updateMember } from './lib/db'
import { configured } from './lib/supabase'
import { requestNotifyPermission } from './lib/notify'
import { SessionProvider, useSession } from './store/session'
import { SettingsProvider, useSettings } from './store/settings'
import { ModuleFlagsProvider, useModuleFlags } from './store/moduleFlags'
import { UnreadProvider, useUnread } from './store/unread'
import { MembersProvider, useMembers } from './store/members'
import { FriendsProvider, useFriends } from './store/friends'
import { pushDueMealReports } from './lib/mealReportNotify'
import FeedNotifyPanel from './components/FeedNotifyPanel'
import TogetherStatus from './components/TogetherStatus'
import { ChangelogProvider, useChangelog } from './store/changelog'
import type { Role } from './lib/types'
import Login from './pages/Login'

/*
 * 路由级代码分割：除登录页（首屏）外，其余页面按需加载。
 * 普通用户只用「点单 / 吃饭 / 动态 / 互动」四张页，
 * 于是 13 个管理页、CouplePage 里的题库与游戏逻辑都不再进首屏包，
 * 首屏 JS 从 735 KB 降到约 180 KB（gzip 后差距同样明显）。
 */
// 点菜 / 三餐页由 DiningPage 按需懒加载（整合后 App 层不再直接引用）
const DiningPage = lazy(() => import('./pages/DiningPage'))
const FeedPage = lazy(() => import('./pages/FeedPage'))
const CouplePage = lazy(() => import('./pages/CouplePage'))
const AboutPage = lazy(() => import('./pages/AboutPage'))
const ChangelogModal = lazy(() => import('./components/ChangelogModal'))
const AdminHome = lazy(() => import('./pages/AdminHome'))
const AdminFriendships = lazy(() => import('./pages/AdminFriendships'))
const AdminCoupleHistory = lazy(() => import('./pages/AdminCoupleHistory'))
const AdminCoupleWishes = lazy(() => import('./pages/AdminCoupleWishes'))
const AdminCoupleQuestions = lazy(() => import('./pages/AdminCoupleQuestions'))
const AdminCoupleTruthDare = lazy(() => import('./pages/AdminCoupleTruthDare'))
const AdminCoupleData = lazy(() => import('./pages/AdminCoupleData'))
const AdminCoupleModules = lazy(() => import('./pages/AdminCoupleModules'))
const AdminFeed = lazy(() => import('./pages/AdminFeed'))
const AdminModuleFlags = lazy(() => import('./pages/AdminModuleFlags'))
const AdminOrders = lazy(() => import('./pages/AdminOrders'))
const AdminMeals = lazy(() => import('./pages/AdminMeals'))
const AdminDishes = lazy(() => import('./pages/AdminDishes'))
const AdminMembers = lazy(() => import('./pages/AdminMembers'))

/** 切页时的占位：保持与页面同宽的内容区，避免导航栏跳动；骨架带扫光，切页不闪白 */
function PageFallback() {
  return (
    <div className="px-4 py-6">
      <div className="mx-auto max-w-md space-y-3">
        <div className="skeleton h-4 w-24 rounded-full bg-brand-100" />
        <div className="skeleton h-24 rounded-2xl bg-brand-50" />
        <div className="skeleton h-24 rounded-2xl bg-brand-50" />
      </div>
    </div>
  )
}

/** 互动空间开关；好友管理面板不对普通用户展示 */
export const ENABLE_FRIENDS = true

const HOME: Record<Role, string> = { her: '/dining', me: '/admin' }

export default function App() {
  // 实时通道探测在 realtime.ts 模块加载时自动跑（早于 React 渲染），
  // 探测未通过前所有 useRealtime 直接走轮询、绝不打开 socket，从根上消除重连风暴。
  return (
    <HashRouter>
      <SessionProvider>
        <ToastProvider>
          <ConfirmHost>
          <SettingsProvider>
            <ModuleFlagsProvider>
              <ChangelogProvider>
                <Shell />
                <Suspense fallback={null}>
                  <ChangelogModal />
                </Suspense>
              </ChangelogProvider>
            </ModuleFlagsProvider>
          </SettingsProvider>
          </ConfirmHost>
        </ToastProvider>
      </SessionProvider>
    </HashRouter>
  )
}

/**
 * 三餐周期报告自动推送：登录后全局检查一次「刚结束的周期」，生成报告并推给自己。
 * 放在 FriendsProvider 内才能拿到当前绑定的对象；不渲染任何 UI，
 * 因此不管用户落在干饭页还是互动页都能收到，不必先点开报告模块。
 */
function MealReportAutoPush() {
  const { memberId, memberName } = useSession()
  const { friends } = useFriends()
  const friend = friends.find((f) => f.memberId !== '__admin__' && f.memberId !== memberId)
  const friendId = friend?.memberId ?? null
  useEffect(() => {
    if (!memberId || !friendId) return
    void pushDueMealReports({ memberId, friendId, myName: memberName || '我' })
  }, [memberId, friendId, memberName])
  return null
}

function Shell() {
  const { entered, role, isAdmin } = useSession()
  const { isEnabled } = useModuleFlags()

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
          <MealReportAutoPush />
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Navigate to={HOME[role]} replace />} />
              {/* 「干饭」整合页：点菜 / 三餐 / 饭圈 三个入口收进一张页，tab 走 URL 参数 */}
              <Route path="/dining" element={<DiningPage />} />
              {/* 旧路由无损重定向：通知深链 / 老书签都能到达对应 tab。
                  /feed 只对普通成员重定向，管理端仍直达原页 */}
              <Route path="/order" element={<Navigate to="/dining?tab=order" replace />} />
              <Route path="/meals" element={<Navigate to="/dining?tab=meals" replace />} />
              <Route path="/feed" element={role === 'her' ? <Navigate to="/dining?tab=feed" replace /> : <FeedPage />} />
              {ENABLE_FRIENDS && <Route path="/couple" element={<CouplePage />} />}
              {isEnabled('about') && <Route path="/about" element={<AboutPage />} />}
              {isAdmin && <Route path="/admin" element={<AdminHome />} />}
              {isAdmin && <Route path="/admin/friendships" element={<AdminFriendships />} />}
              {isAdmin && <Route path="/admin/couple-data" element={<AdminCoupleData />} />}
              {isAdmin && <Route path="/admin/couple-modules" element={<AdminCoupleModules />} />}
              {isAdmin && <Route path="/admin/feed" element={<AdminFeed />} />}
              {isAdmin && <Route path="/admin/modules" element={<AdminModuleFlags />} />}
              {isAdmin && <Route path="/admin/couple-history" element={<AdminCoupleHistory />} />}
              {isAdmin && <Route path="/admin/couple-wishes" element={<AdminCoupleWishes />} />}
              {isAdmin && <Route path="/admin/couple-questions" element={<AdminCoupleQuestions />} />}
              {isAdmin && <Route path="/admin/couple-truth" element={<AdminCoupleTruthDare />} />}
              {/* 这四个页面同样只给管理员：普通成员手输地址不该能看全员订单 / 成员邀请码 */}
              {isAdmin && <Route path="/admin/orders" element={<AdminOrders />} />}
              {isAdmin && <Route path="/admin/meals" element={<AdminMeals />} />}
              {isAdmin && <Route path="/admin/dishes" element={<AdminDishes />} />}
              {isAdmin && <Route path="/admin/members" element={<AdminMembers />} />}
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
/** 成员切换菜单：要放得下成员名字，宽一点 */
const PANEL =
  'absolute right-0 top-full z-40 mt-1.5 max-h-[60vh] w-40 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg'
/** 「更多」菜单：条目都是「个人资料 / 退出登录」这类四字短语，窄一点更清爽；超出时 truncate 兜底 */
const PANEL_NARROW =
  'absolute right-0 top-full z-40 mt-1.5 max-h-[60vh] w-28 min-w-fit overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg'

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
        active ? 'bg-brand-50 font-medium text-brand-600' : danger ? 'text-danger-600' : 'text-slate-600'
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
  const { isEnabled } = useModuleFlags()
  const toast = useToast()
  const [menu, setMenu] = useState<'member' | 'more' | 'feed' | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)
  /** 玻璃顶栏：0 = 未滚动（通透），1 = 已滚动（加深底色 + 顶部高光渐显） */
  const [glassProgress, setGlassProgress] = useState(0)
  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        setGlassProgress(Math.min(1, window.scrollY / 40))
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

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
          { to: '/dining', label: '干饭', emoji: '🍚' },
          ...(ENABLE_FRIENDS ? [{ to: '/couple', label: '互动', emoji: '💞' }] : []),
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
      ? `Hi, ${memberName || '她'}👋`
      : adminName

  /** 当前命中的 tab 序号：液滴滑块的位移依据；匹配不到（如管理页过渡）时停在原位 */
  const activeTabIndex = tabs.findIndex((t) => t.to === pathname)

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

  const confirm = useConfirm()
  const doLogout = async () => {
    if (!(await confirm('确定退出登录吗？'))) return
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
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-brand-50/40 pb-20 pt-[56px]">
      {/* 液态玻璃顶栏：固定在设备顶部始终可见（高度 54px 内容 + 1px 分隔线 = 55px，容器留 56px 顶部内边距）。
          未滚动时通透贴近内容，滚动后底色加深并显出一道顶部品牌高光——高光随滚动位移渐显，深浅色自动适配 */}
      <header
        className={`glass fixed inset-x-0 top-0 z-30 mx-auto max-w-md border-b border-brand-100 backdrop-blur-md transition-[background-color,box-shadow] duration-300 ${
          glassProgress > 0.15 ? 'shadow-[0_8px_24px_-16px_rgb(0_0_0/0.18)]' : ''
        }`}
        style={{
          backgroundColor: `rgb(255 255 255 / ${0.95 - glassProgress * 0.15})`,
          '--glass-edge': glassProgress,
        } as React.CSSProperties}
      >
        {/* 边缘高光：随滚动渐显的一道 1px 品牌光线 */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-300 to-transparent"
          style={{ opacity: glassProgress }}
        />
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
            <p className="truncate text-2xs leading-tight text-slate-400">{subtitle}</p>
          </div>
          <TogetherStatus />

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
                  <span className="badge absolute -right-1.5 -top-1.5 text-center">
                    {unread.feedUnread > 99 ? '99+' : unread.feedUnread}
                  </span>
                )}
              </button>
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
                    <div className="px-3 pb-1 pt-1.5 text-2xs text-slate-400">切换到她的视角</div>
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
                <div className={PANEL_NARROW}>
                  {role === 'me' && (
                    <MenuItem onClick={() => run(enableBell)}>开启推送通知</MenuItem>
                  )}
                  {isAdmin && role === 'me' && (
                    <>
                      <MenuItem onClick={() => run(() => navigate('/admin'))}>🗂 管理总览</MenuItem>
                      <MenuItem onClick={() => run(() => navigate('/admin/feed'))}>📸 饭圈动态管理</MenuItem>
                      <MenuItem onClick={() => run(() => navigate('/admin/couple-data'))}>💞 互动数据管理</MenuItem>
                      <MenuItem onClick={() => run(() => navigate('/admin/couple-questions'))}>❓ 同步抉择题库</MenuItem>
                      <MenuItem onClick={() => run(() => navigate('/admin/modules'))}>🧩 模块管理</MenuItem>
                      <MenuItem onClick={() => run(() => navigate('/admin/friendships'))}>🤝 好友关系管理</MenuItem>
                    </>
                  )}
                  <MenuItem onClick={() => run(() => setProfileOpen(true))}>个人资料</MenuItem>
                  <MenuItem onClick={() => run(() => setThemeOpen(true))}>一键换肤</MenuItem>
                  {isEnabled('changelog') && <MenuItem onClick={() => run(openChangelog)}>更新日志</MenuItem>}
                  {isEnabled('about') && (
                    <MenuItem onClick={() => run(() => navigate('/about'))}>关于我们</MenuItem>
                  )}
                  <MenuItem danger onClick={() => run(doLogout)}>
                    退出登录
                  </MenuItem>
                </div>
              )}
            </div>
          </div>

          {/* 铃铛面板挂在整宽头部容器上，避免窄屏时被左侧按钮挤出屏幕 */}
          {menu === 'feed' && <FeedNotifyPanel identity={feedIdentity} onClose={() => setMenu(null)} />}

          {menu && <div className="fixed inset-0 z-30" onClick={() => setMenu(null)} />}
        </div>
      </header>

      {isAdmin && role === 'her' && memberId && (
        <div className="mx-3 mt-2 flex animate-fade-down items-center gap-2 rounded-xl bg-brand-50 px-3 py-1.5 text-2xs text-brand-700">
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
        <div className="m-4 rounded-xl border border-warn-200 bg-warn-50 p-3 text-xs text-warn-700">
          还没配置 Supabase：复制 <code>.env.example</code> 为 <code>.env</code> 填入 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 后重启。
        </div>
      )}

      {/* key 让每次切页都重新播一次入场动画；Suspense 放在 Outlet 外层，
          这样按需加载新页面时导航栏和顶栏不消失，只有内容区出骨架 */}
      <main key={pathname} className="flex-1 px-4 py-4">
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
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

      {themeOpen && <ThemePicker onClose={() => setThemeOpen(false)} />}

      {/* 液滴底部导航：选中的胶囊像一滴水滑过去——滑块平移到当前 tab，切换瞬间回弹一下先「到」再「稳住」 */}
      <nav className="glass pb-safe fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md border-t border-brand-100 backdrop-blur">
        {/* 液滴滑块：宽 = 1/N，位移 = index × 自身宽 */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-1 left-0 rounded-full bg-brand-100/80"
          style={{ width: `${100 / tabs.length}%`, transform: `translateX(${Math.max(0, activeTabIndex) * 100}%)`, transition: 'transform 300ms cubic-bezier(.34,1.4,.64,1)' }}
        >
          <span
            key={activeTabIndex}
            className="block h-full w-full animate-nav-drop rounded-full"
          />
        </span>
        {tabs.map((t) => {
          const active = pathname === t.to
          return (
            <NavLink
              key={t.to}
              to={t.to}
              className={`relative z-10 flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors duration-200 ${
                active ? 'text-brand-600' : 'text-slate-400'
              }`}
            >
              <span className={`text-lg leading-none transition-transform duration-200 ${active ? 'scale-110' : ''}`}>
                {t.emoji}
              </span>
              <span>{t.label}</span>
              {!!t.badge && t.badge > 0 && (
                <span className="badge absolute right-[22%] top-1">
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
