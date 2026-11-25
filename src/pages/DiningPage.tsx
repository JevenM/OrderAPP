import { Suspense, lazy, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

/*
 * 「干饭」整合页：把 点菜 / 三餐 / 饭圈 三个一级入口收进一张页，
 * 用顶部分段Tab切换，tab 状态同步到 URL（?tab=order|meals|feed），
 * 旧链接 / 深链（通知跳转）通过 App.tsx 的重定向无损到达。
 */
const OrderPage = lazy(() => import('./OrderPage'))
const MealLogPage = lazy(() => import('./MealLogPage'))
const FeedPage = lazy(() => import('./FeedPage'))

const TABS = [
  { id: 'order', label: '点菜', emoji: '🧾', hint: '想吃什么点起来' },
  { id: 'meals', label: '三餐', emoji: '🍚', hint: '按时打卡吃饭' },
  { id: 'feed', label: '饭圈', emoji: '📸', hint: '你们的美食动态' },
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
        <div className="seg mx-auto max-w-md">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => switchTab(t.id)}
              className={`seg-btn ${
                t.id === tab ? 'bg-white font-semibold text-brand-600 shadow-sm' : 'text-slate-400'
              }`}
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
      </Suspense>
    </div>
  )
}
