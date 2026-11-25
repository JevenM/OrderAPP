import { Suspense, lazy, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

/*
 * 「干饭」整合页：把 点菜 / 三餐 / 饭圈 / 订单 四个一级入口收进一张页，
 * 用顶部分段Tab切换，tab 状态同步到 URL（?tab=order|meals|feed|orders），
 * 旧链接 / 深链（通知跳转）通过 App.tsx 的重定向无损到达。
 */
const OrderPage = lazy(() => import('./OrderPage'))
const MealLogPage = lazy(() => import('./MealLogPage'))
const FeedPage = lazy(() => import('./FeedPage'))
const OrdersPage = lazy(() => import('./OrdersPage'))

const TABS = [
  { id: 'order', label: '点菜', emoji: '🧾', hint: '想吃什么点起来' },
  { id: 'meals', label: '三餐', emoji: '🍚', hint: '按时打卡吃饭' },
  { id: 'feed', label: '饭圈', emoji: '📸', hint: '你们的美食动态' },
  { id: 'orders', label: '订单', emoji: '📦', hint: '双方订单与进度' },
] as const

type TabId = (typeof TABS)[number]['id']

const isTab = (v: string | null): v is TabId => TABS.some((t) => t.id === v)

function TabFallback() {
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

export default function DiningPage() {
  const [params, setParams] = useSearchParams()
  const tabRaw = params.get('tab')
  // 三餐打卡使用频率最高，作为默认落地页；旧链接 / 深链带了 ?tab= 的仍按原样打开
  const tab: TabId = isTab(tabRaw) ? tabRaw : 'meals'

  const switchTab = (id: TabId) => {
    const next = new URLSearchParams(params)
    next.set('tab', id)
    setParams(next, { replace: true })
  }

  const activeTab = useMemo(() => TABS.find((t) => t.id === tab)!, [tab])

  return (
    <div className="pb-4">
      {/* 分段控制：粘性吸顶避让 55px 顶栏（top-0 会被固定顶栏遮住半条） */}
      <div className="sticky top-[55px] z-10 -mx-4 mb-3 border-b border-brand-100 bg-white/95 px-4 pb-2 pt-3 backdrop-blur">
        <div className="seg relative mx-auto max-w-md">
          {/* 滑动高亮：白色胶囊平滑滑到当前 tab（宽度 = 1/N 减去左右内边距），切换不再跳变 */}
          <span
            aria-hidden
            className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/4)] rounded-lg bg-white shadow-sm transition-transform duration-300 ease-out"
            style={{ transform: `translateX(${TABS.findIndex((t) => t.id === tab) * 100}%)` }}
          />
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => switchTab(t.id)}
              className={`seg-btn relative z-10 ${t.id === tab ? 'font-semibold text-brand-600' : 'text-slate-400'}`}
            >
              <span className={`text-base leading-none transition-transform duration-200 ${t.id === tab ? 'scale-110' : ''}`}>{t.emoji}</span>
              {t.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-center text-2xs text-slate-300">{activeTab.hint}</p>
      </div>

      <Suspense fallback={<TabFallback />}>
        {tab === 'order' && <OrderPage />}
        {tab === 'meals' && <MealLogPage />}
        {tab === 'feed' && <FeedPage />}
        {tab === 'orders' && <OrdersPage />}
      </Suspense>
    </div>
  )
}
