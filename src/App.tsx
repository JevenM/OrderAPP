import { useState } from 'react'
import { HashRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import { APP_TITLE, configured } from './lib/supabase'
import { requestNotifyPermission } from './lib/notify'
import { SessionProvider, useSession } from './store/session'
import { SettingsProvider, useSettings } from './store/settings'
import { UnreadProvider, useUnread } from './store/unread'
import { MembersProvider, useMembers } from './store/members'
import type { Role } from './lib/types'
import Login from './pages/Login'
import OrderPage from './pages/OrderPage'
import MealLogPage from './pages/MealLogPage'
import FeedPage from './pages/FeedPage'
import AdminOrders from './pages/AdminOrders'
import AdminMeals from './pages/AdminMeals'
import AdminDishes from './pages/AdminDishes'
import AdminMembers from './pages/AdminMembers'

const HOME: Record<Role, string> = { her: '/order', me: '/admin/orders' }

export default function App() {
  return (
    <HashRouter>
      <SessionProvider>
        <ToastProvider>
          <SettingsProvider>
            <Shell />
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
    <UnreadProvider enabled={isAdmin}>
      <MembersProvider enabled={isAdmin}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to={HOME[role]} replace />} />
            <Route path="/order" element={<OrderPage />} />
            <Route path="/meals" element={<MealLogPage />} />
            <Route path="/feed" element={<FeedPage />} />
            <Route path="/admin/orders" element={<AdminOrders />} />
            <Route path="/admin/meals" element={<AdminMeals />} />
            <Route path="/admin/dishes" element={<AdminDishes />} />
            <Route path="/admin/members" element={<AdminMembers />} />
            <Route path="*" element={<Navigate to={HOME[role]} replace />} />
          </Route>
        </Routes>
      </MembersProvider>
    </UnreadProvider>
  )
}

function Layout() {
  const { role, setViewMember, isAdmin, memberId, memberName, logout } = useSession()
  const { adminName } = useSettings()
  const { members } = useMembers()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const unread = useUnread()
  const [bell, setBell] = useState<string>('')

  const tabs: { to: string; label: string; emoji: string; badge?: number }[] =
    role === 'her'
      ? [
          { to: '/order', label: '点菜', emoji: '🧾' },
          { to: '/meals', label: '三餐', emoji: '🍚' },
          { to: '/feed', label: '饭圈', emoji: '📸' },
        ]
      : [
          { to: '/admin/orders', label: '订单', emoji: '🧾', badge: unread.orders },
          { to: '/admin/meals', label: '饮食', emoji: '🍚', badge: unread.meals },
          { to: '/admin/dishes', label: '菜单', emoji: '📖', badge: unread.requests },
          { to: '/admin/members', label: '成员', emoji: '👭' },
          { to: '/feed', label: '饭圈', emoji: '📸' },
        ]

  const enableBell = async () => {
    const p = await requestNotifyPermission()
    setBell(p === 'granted' ? '已开启通知' : p === 'unsupported' ? '当前浏览器不支持' : '未授权')
  }

  const doLogout = () => {
    if (!window.confirm('确定退出登录吗？')) return
    navigate('/', { replace: true }) // 清空当前地址，避免下次登录跳到上次的页面
    logout()
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-brand-50/40 pb-20">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-brand-100 bg-white/90 px-4 py-3 backdrop-blur">
        <div>
          <h1 className="text-base font-semibold text-brand-600">{APP_TITLE}</h1>
          <p className="text-xs text-slate-400">
            {role === 'her'
              ? isAdmin
                ? `正在查看：${memberName || '她'}`
                : `嗨，${memberName || '她'} 👋`
              : `我是${adminName} · 她的动态实时同步`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {role === 'me' && (
            <button onClick={enableBell} className="btn-soft text-xs" title="开启浏览器推送">
              🔔 {bell || '通知'}
            </button>
          )}
          {isAdmin && (
            <select
              className="max-w-[9rem] rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600"
              value={role === 'her' ? (memberId ?? '') : ''}
              onChange={(e) => {
                const v = e.target.value
                if (!v) {
                  setViewMember(null)
                  navigate('/admin/orders')
                  return
                }
                const m = members.find((x) => x.id === v)
                if (m) {
                  setViewMember({ id: m.id, name: m.name })
                  navigate('/order')
                }
              }}
            >
              <option value="">我的管理视图</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  查看 {m.name}
                </option>
              ))}
            </select>
          )}
          <button className="btn-ghost text-xs" onClick={doLogout} title="退出登录">
            退出
          </button>
        </div>
      </header>

      {!configured && (
        <div className="m-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
          还没配置 Supabase：复制 <code>.env.example</code> 为 <code>.env</code> 填入 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 后重启。
        </div>
      )}

      <main className="flex-1 px-4 py-4">
        <Outlet />
      </main>

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md border-t border-brand-100 bg-white/95 backdrop-blur">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
              pathname === t.to ? 'text-brand-600' : 'text-slate-400'
            }`}
          >
            <span className="text-lg leading-none">{t.emoji}</span>
            <span>{t.label}</span>
            {!!t.badge && t.badge > 0 && (
              <span className="absolute right-[22%] top-1 min-w-[16px] rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-4 text-white">
                {t.badge > 99 ? '99+' : t.badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
