import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  listOrderItemsByOrderIds,
  listPairDishRatings,
  listPairOrders,
} from '../../lib/db'
import {
  buildDishRank,
  recommendDishes,
  rollDish,
  type DishRank,
  type DishStat,
} from '../../lib/dishRank'
import { POLL, useRealtime } from '../../lib/realtime'
import { SLOT_LABEL, type MealSlot } from '../../lib/types'
import { EmptyState, SkeletonList } from '../States'
import { useToast } from '../Toast'

/**
 * 我们的常点榜。
 *
 * 数据只来自 orders + order_items（近 180 天、不含已取消）：
 * 只有这里记录了「点」这个动作，而且 dish_name 是下单时的快照，
 * 菜品改名/下架后历史统计依然成立。
 *
 * 榜单分带时间衰减（越近的偏好权重越高），推荐分不带衰减但要排除最近三天吃过的，
 * 所以「常点 + 好吃 + 最近没吃」才会被推上来。
 */

const TABS: { key: MealSlot | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'breakfast', label: SLOT_LABEL.breakfast },
  { key: 'lunch', label: SLOT_LABEL.lunch },
  { key: 'dinner', label: SLOT_LABEL.dinner },
  { key: 'snack', label: SLOT_LABEL.snack },
]

/** 排名徽章色阶：只写前三是彩色，其余灰掉，避免一屏五颜六色 */
function rankCls(i: number): string {
  if (i === 0) return 'bg-amber-100 text-amber-700'
  if (i === 1) return 'bg-slate-200 text-slate-600'
  if (i === 2) return 'bg-orange-100 text-orange-700'
  return 'bg-slate-100 text-slate-400'
}

export default function DishRankBoard({
  memberId,
  friendId,
  friendName,
}: {
  memberId: string | null
  friendId: string | null
  myName: string
  friendName: string
}) {
  const toast = useToast()
  const pair = useMemo(
    () => (memberId && friendId ? ([memberId, friendId] as const) : null),
    [memberId, friendId]
  )

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<{ rank: DishRank; now: Date } | null>(null)
  const [slot, setSlot] = useState<MealSlot | 'all'>('all')
  const [rolled, setRolled] = useState<DishStat | null>(null)

  const load = useCallback(async () => {
    if (!pair) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      // 180 天窗口：再长就全是半年不吃的菜，榜单会失去参考意义
      const sinceIso = new Date(Date.now() - 179 * 86_400_000).toISOString()
      const orders = await listPairOrders(pair[0], pair[1], sinceIso)
      const items = await listOrderItemsByOrderIds(orders.map((o) => o.id))
      // 评分表可能还没建（迁移没跑）：榜单照样能看，只是没有星级
      const ratings = await listPairDishRatings(pair[0], pair[1], sinceIso).catch(() => [])
      const now = new Date()
      setData({ rank: buildDishRank(orders, items, ratings, now, pair), now })
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '加载常点榜失败', 'err')
    } finally {
      setLoading(false)
    }
  }, [pair, toast])

  useEffect(() => {
    void load()
  }, [load])

  useRealtime(
    useMemo(() => `dish-rank:${pair ? pair.join(':') : 'none'}`, [pair]),
    [
      { table: 'orders', on: () => void load() },
      { table: 'couple_dish_ratings', on: () => void load() },
    ],
    { enabled: !!pair, pollMs: POLL.cool, pair, onPoll: () => void load() }
  )

  const list = useMemo(() => {
    if (!data) return []
    return slot === 'all' ? data.rank.all : data.rank.bySlot[slot]
  }, [data, slot])

  const picks = useMemo(() => {
    if (!data) return []
    return recommendDishes(data.rank, slot, data.now, 3, 3)
  }, [data, slot])

  const topCount = list[0]?.count ?? 1
  const shown = list.slice(0, 20)

  return (
    <section id="couple-active-module" className="card space-y-4">
      <div>
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold">🔥 我们的常点榜</h3>
            <p className="mt-1 truncate text-xs text-slate-400">
              近 180 天 · 不含已取消 · 共 {list.length} 种
            </p>
          </div>
          <button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => void load()} disabled={loading}>
            {loading ? '刷新中…' : '↻ 刷新'}
          </button>
        </div>
      </div>

      <div className="seg">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`seg-btn text-xs ${
              slot === t.key ? 'bg-white font-semibold text-brand-600 shadow-sm' : 'text-slate-400'
            }`}
            onClick={() => {
              setSlot(t.key)
              setRolled(null)
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <SkeletonList rows={5} />
      ) : shown.length === 0 ? (
        <EmptyState
          icon="🔥"
          title={slot === 'all' ? '还没有点过菜' : `还没有在${SLOT_LABEL[slot]}点过菜`}
          hint="去「点菜」下几单，这里会自动生成你们的常点榜"
        />
      ) : (
        <>
          {/* 推荐区：先给三个候选，再给一个「摇一个」——选择困难时最有用的一步 */}
          <div className="space-y-2 rounded-2xl bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="shrink-0 text-xs font-semibold text-slate-600">今晚吃什么</span>
              <span className="truncate text-2xs text-slate-400">按你们的习惯挑，跳过最近吃过的</span>
            </div>
            {/* 用 flex 而不是 grid-cols-3：候选只有一两个时不会左边挤着一格、右边空两格 */}
            <div className="flex gap-2">
              {picks.map((d) => (
                <div
                  key={d.key}
                  className="flex min-h-[64px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl bg-white p-2"
                >
                  <span className="text-lg leading-none" aria-hidden>
                    {d.emoji}
                  </span>
                  <span className="w-full truncate text-center text-2xs text-slate-600">{d.name}</span>
                </div>
              ))}
              {picks.length === 0 && (
                <p className="w-full py-2 text-center text-2xs text-slate-400">这个餐次还没有点过菜</p>
              )}
            </div>
            <button
              type="button"
              className="btn-primary w-full"
              onClick={() => setRolled(rollDish(list))}
              disabled={list.length === 0}
            >
              🎲 摇一个
            </button>
            {rolled && (
              <p className="truncate text-center text-sm font-semibold text-brand-600">
                {rolled.emoji} {rolled.name}
              </p>
            )}
          </div>

          <div className="space-y-1">
            {shown.map((d, i) => (
              <div key={d.key} className="flex items-center gap-2 rounded-xl bg-white px-2 py-2">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-2xs font-semibold ${rankCls(i)}`}
                >
                  {i + 1}
                </span>
                <span className="shrink-0 text-base leading-none" aria-hidden>
                  {d.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm text-slate-700">{d.name}</span>
                    {d.avgRating !== null && (
                      <span className="shrink-0 text-2xs text-amber-500">
                        ★ {d.avgRating.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-rose-400 to-orange-400 transition-all duration-500"
                      style={{ width: `${Math.max(6, Math.round((d.count / topCount) * 100))}%` }}
                    />
                  </div>
                </div>
                <span className="w-8 shrink-0 text-right text-2xs tabular-nums text-slate-400">×{d.count}</span>
              </div>
            ))}
          </div>

          <p className="text-2xs leading-relaxed text-slate-400">
            「×」是点过的订单数，同一单点两份只算一次；★ 是你们给这道菜打分的平均分。
            {friendName ? `和 ${friendName} 一起点过的都算在里面。` : ''}
          </p>
        </>
      )}
    </section>
  )
}
