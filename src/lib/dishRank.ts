import type { MealSlot, OrderStatus } from './types'

/**
 * 常点榜与「今晚吃什么」推荐（纯计算层）。
 *
 * 数据源只能是 orders + order_items：
 * - orders 记录「点」这个动作，meals 只说明「吃了什么」，分不出是点的还是随手记的；
 * - order_items.dish_name 是下单时的名称快照（0001_init.sql），菜改名/下架后历史统计依然正确；
 * - order_items 没有 member_id，归属靠父订单先按 member_id 筛过，所以这里只认 order_id。
 */

const SLOT_KEYS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack']

/** 名称归一化：首尾空格、连续空白合并。评分表与榜单用同一套规则做 key */
export const normalizeDishName = (name: string): string => name.trim().replace(/\s+/g, ' ')

/** 一道菜的稳定标识：有 dish_id 用 id，自定义菜退回名称 */
export function dishKey(item: { dish_id: string | null; dish_name: string }): string {
  return item.dish_id ? `id:${item.dish_id}` : `name:${normalizeDishName(item.dish_name)}`
}

export interface RankOrderRow {
  id: string
  meal_slot: MealSlot
  status: OrderStatus
  created_at: string
  member_id: string | null
}

export interface RankItemRow {
  order_id: string
  dish_id: string | null
  dish_name: string
  emoji: string
  qty: number
}

export interface RankRatingRow {
  dish_name: string
  rating: number
}

export interface DishStat {
  key: string
  name: string
  emoji: string
  /** 出现在多少张订单里（同一单点两份只算一次） */
  count: number
  /** 份数合计 */
  qty: number
  /** 最近一次点它的时间（ISO） */
  lastAt: string
  avgRating: number | null
  ratingCount: number
  slots: Record<MealSlot, number>
  /** 榜单排序分：次数 × 时间衰减 × 评分系数 */
  score: number
}

export interface DishRank {
  all: DishStat[]
  bySlot: Record<MealSlot, DishStat[]>
}

const DAY_MS = 86_400_000
/** 半衰期 90 天：两个月前常点的菜还留在榜上，半年前的慢慢沉下去 */
const HALF_LIFE_DAYS = 90

/**
 * 聚合榜单。
 *
 * @param orders  近 N 天的订单（已按 pair 过滤）
 * @param items   上面这些订单的明细（order_id 关联）
 * @param ratings 本对的全部评分（按 dish_name 归并取平均）
 * @param now     用于算时间衰减，显式注入便于单测
 * @param pair    再校验一次归属，防止上层漏筛
 */
export function buildDishRank(
  orders: RankOrderRow[],
  items: RankItemRow[],
  ratings: RankRatingRow[],
  now: Date,
  pair: readonly [string, string] | null = null
): DishRank {
  const usable = new Map<string, RankOrderRow>()
  for (const o of orders) {
    // 取消的订单会把「点了又取消」算成偏好，必须排除
    if (o.status === 'cancelled') continue
    if (pair && (!o.member_id || (o.member_id !== pair[0] && o.member_id !== pair[1]))) continue
    usable.set(o.id, o)
  }

  const ratingAgg = new Map<string, { sum: number; n: number }>()
  for (const r of ratings) {
    if (!r.rating || r.rating < 1 || r.rating > 5) continue
    const key = normalizeDishName(r.dish_name)
    const cur = ratingAgg.get(key) ?? { sum: 0, n: 0 }
    cur.sum += r.rating
    cur.n += 1
    ratingAgg.set(key, cur)
  }

  const aggregate = (slot: MealSlot | 'all'): DishStat[] => {
    const acc = new Map<
      string,
      {
        name: string
        emoji: string
        orderIds: Set<string>
        qty: number
        lastAt: string
        slots: Record<MealSlot, number>
      }
    >()

    for (const it of items) {
      const order = usable.get(it.order_id)
      if (!order) continue
      if (slot !== 'all' && order.meal_slot !== slot) continue

      const key = dishKey(it)
      const cur =
        acc.get(key) ??
        {
          name: normalizeDishName(it.dish_name),
          emoji: it.emoji || '🍽️',
          orderIds: new Set<string>(),
          qty: 0,
          lastAt: '',
          slots: { breakfast: 0, lunch: 0, dinner: 0, snack: 0 } as Record<MealSlot, number>,
        }

      cur.qty += it.qty > 0 ? it.qty : 1
      if (it.emoji) cur.emoji = it.emoji
      // 同一张订单里点了两份，只在「订单数」和「餐次」里记一次
      if (!cur.orderIds.has(order.id)) {
        cur.orderIds.add(order.id)
        cur.slots[order.meal_slot] = (cur.slots[order.meal_slot] ?? 0) + 1
      }
      if (order.created_at > cur.lastAt) cur.lastAt = order.created_at
      acc.set(key, cur)
    }

    const out: DishStat[] = []
    for (const [key, v] of acc) {
      const count = v.orderIds.size
      const agg = ratingAgg.get(v.name)
      const avgRating = agg && agg.n > 0 ? agg.sum / agg.n : null
      const daysAgo = v.lastAt ? Math.max(0, (now.getTime() - new Date(v.lastAt).getTime()) / DAY_MS) : HALF_LIFE_DAYS * 2
      const decay = 0.5 ** (daysAgo / HALF_LIFE_DAYS)
      // 没人评过给 0.8 的中性偏正，别让新菜被压到底
      const ratingFactor = avgRating === null ? 0.8 : 0.5 + 0.5 * (avgRating / 5)
      out.push({
        key,
        name: v.name,
        emoji: v.emoji,
        count,
        qty: v.qty,
        lastAt: v.lastAt,
        avgRating,
        ratingCount: agg?.n ?? 0,
        slots: v.slots,
        score: count * decay * ratingFactor,
      })
    }

    out.sort((a, b) => b.score - a.score || b.count - a.count || a.name.localeCompare(b.name))
    return out
  }

  return {
    all: aggregate('all'),
    bySlot: {
      breakfast: aggregate('breakfast'),
      lunch: aggregate('lunch'),
      dinner: aggregate('dinner'),
      snack: aggregate('snack'),
    },
  }
}

/**
 * 「今晚吃什么」候选。
 *
 * 用「次数 × 评分」而不是榜单分：榜单分带时间衰减（越近越靠前），
 * 而推荐要的是「常点且好吃、最近刚好没吃」——最近三天吃过的先排除。
 */
export function recommendDishes(
  rank: DishRank,
  slot: MealSlot | 'all',
  now: Date,
  take = 3,
  avoidDays = 3
): DishStat[] {
  const pool = slot === 'all' ? rank.all : rank.bySlot[slot]
  const prefer = (d: DishStat): number => d.count * (0.6 + 0.4 * ((d.avgRating ?? 3.5) / 5))

  const fresh = pool.filter((d) => {
    if (!d.lastAt) return true
    const daysAgo = (now.getTime() - new Date(d.lastAt).getTime()) / DAY_MS
    return daysAgo >= avoidDays
  })

  // 池子太小（比如常点的就那么两道）就退回全池，别让推荐区空着
  const source = fresh.length >= take ? fresh : pool
  return [...source].sort((a, b) => prefer(b) - prefer(a) || b.count - a.count).slice(0, take)
}

/** 摇一个：list 为空返回 null；random 可注入便于单测 */
export function rollDish(list: DishStat[], random: () => number = Math.random): DishStat | null {
  if (list.length === 0) return null
  const i = Math.min(list.length - 1, Math.max(0, Math.floor(random() * list.length)))
  return list[i]
}

/** 当前时段对应的餐次，用于默认选中推荐 tab */
export function slotOfHour(hour: number): MealSlot {
  if (hour < 10) return 'breakfast'
  if (hour < 15) return 'lunch'
  if (hour < 21) return 'dinner'
  return 'snack'
}

export const RANK_SLOTS: MealSlot[] = SLOT_KEYS
