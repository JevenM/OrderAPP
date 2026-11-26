import { describe, expect, it } from 'vitest'
import {
  buildDishRank,
  dishKey,
  normalizeDishName,
  recommendDishes,
  rollDish,
  slotOfHour,
  type RankItemRow,
  type RankOrderRow,
} from './dishRank'
import type { MealSlot, OrderStatus } from './types'

const NOW = new Date(2026, 10, 26, 19, 0)
const PAIR = ['A', 'B'] as const

const order = (
  id: string,
  over: Partial<RankOrderRow> = {}
): RankOrderRow => ({
  id,
  meal_slot: 'dinner',
  status: 'done' as OrderStatus,
  created_at: new Date(2026, 10, 20, 19, 0).toISOString(),
  member_id: 'A',
  ...over,
})

const item = (orderId: string, name: string, over: Partial<RankItemRow> = {}): RankItemRow => ({
  order_id: orderId,
  dish_id: null,
  dish_name: name,
  emoji: '🍽️',
  qty: 1,
  ...over,
})

describe('常点榜聚合', () => {
  it('同一单点两份只算一次订单数，份数照常累加', () => {
    const rank = buildDishRank([order('o1')], [item('o1', '可乐鸡翅'), item('o1', '可乐鸡翅')], [], NOW)
    expect(rank.all).toHaveLength(1)
    expect(rank.all[0].count).toBe(1)
    expect(rank.all[0].qty).toBe(2)
  })

  it('已取消的订单整单不计入', () => {
    const rank = buildDishRank(
      [order('o1', { status: 'cancelled' })],
      [item('o1', '可乐鸡翅')],
      [],
      NOW
    )
    expect(rank.all).toHaveLength(0)
  })

  it('别对情侣的订单不计入（pair 二次校验）', () => {
    const rank = buildDishRank([order('o1', { member_id: 'C' })], [item('o1', '糖醋排骨')], [], NOW, PAIR)
    expect(rank.all).toHaveLength(0)
  })

  it('次数相同时评分高的排前面', () => {
    const orders = [order('o1'), order('o2')]
    const items = [item('o1', 'A 菜'), item('o2', 'B 菜')]
    const rank = buildDishRank(
      orders,
      items,
      [
        { dish_name: 'A 菜', rating: 2 },
        { dish_name: 'B 菜', rating: 5 },
      ],
      NOW
    )
    expect(rank.all.map((d) => d.name)).toEqual(['B 菜', 'A 菜'])
    expect(rank.all[0].avgRating).toBe(5)
    expect(rank.all[1].avgRating).toBe(2)
  })

  it('同样两次，最近点过的排在更前（90 天半衰）', () => {
    const recent = new Date(2026, 10, 25, 19, 0).toISOString()
    const old = new Date(2026, 5, 1, 19, 0).toISOString()
    const rank = buildDishRank(
      [
        order('o1', { created_at: recent }),
        order('o2', { created_at: recent }),
        order('o3', { created_at: old }),
        order('o4', { created_at: old }),
      ],
      [item('o1', '新宠'), item('o2', '新宠'), item('o3', '旧爱'), item('o4', '旧爱')],
      [],
      NOW
    )
    expect(rank.all.map((d) => d.name)).toEqual(['新宠', '旧爱'])
    expect(rank.all[0].count).toBe(rank.all[1].count)
  })

  it('按餐次分桶：早餐只出早餐点过的菜', () => {
    const rank = buildDishRank(
      [order('o1', { meal_slot: 'breakfast' }), order('o2', { meal_slot: 'dinner' })],
      [item('o1', '豆浆油条'), item('o2', '火锅')],
      [],
      NOW
    )
    expect(rank.bySlot.breakfast.map((d) => d.name)).toEqual(['豆浆油条'])
    expect(rank.bySlot.dinner.map((d) => d.name)).toEqual(['火锅'])
    expect(rank.bySlot.lunch).toHaveLength(0)
  })

  it('自定义菜（dish_id 为空）按名称聚合，名称先归一化', () => {
    const rank = buildDishRank(
      [order('o1'), order('o2')],
      [item('o1', '  妈妈  牌红烧肉 '), item('o2', '妈妈 牌红烧肉')],
      [],
      NOW
    )
    expect(rank.all).toHaveLength(1)
    expect(rank.all[0].count).toBe(2)
    expect(rank.all[0].name).toBe('妈妈 牌红烧肉')
    expect(normalizeDishName('  a   b ')).toBe('a b')
    expect(dishKey({ dish_id: 'd1', dish_name: 'x' })).toBe('id:d1')
    expect(dishKey({ dish_id: null, dish_name: ' x ' })).toBe('name:x')
  })
})

describe('今晚吃什么', () => {
  const build = () =>
    buildDishRank(
      [
        order('o1', { created_at: new Date(2026, 10, 25, 19, 0).toISOString() }),
        order('o2'),
        order('o3'),
        order('o4'),
      ],
      [item('o1', '昨天刚吃'), item('o2', '老菜'), item('o3', '老菜'), item('o4', '老菜')],
      [],
      NOW
    )

  it('最近三天吃过的先排除', () => {
    // take=1 时「新鲜池」够用，就不该把昨天刚吃的端上来
    const picks = recommendDishes(build(), 'dinner', NOW, 1, 3)
    expect(picks.map((d) => d.name)).toEqual(['老菜'])
  })

  it('池子不够时不返回空（退回全池）', () => {
    const rank = buildDishRank([order('o1', { created_at: NOW.toISOString() })], [item('o1', '唯一一道')], [], NOW)
    expect(recommendDishes(rank, 'all', NOW, 3, 3).map((d) => d.name)).toEqual(['唯一一道'])
  })

  it('摇一个：空列表返回 null，random 可注入', () => {
    expect(rollDish([])).toBeNull()
    const stat = (name: string) => ({
      key: name,
      name,
      emoji: '🍽️',
      count: 1,
      qty: 1,
      lastAt: '',
      avgRating: null,
      ratingCount: 0,
      slots: { breakfast: 0, lunch: 0, dinner: 1, snack: 0 },
      score: 1,
    })
    const list = [stat('a'), stat('b')]
    expect(rollDish(list, () => 0)?.name).toBe('a')
    expect(rollDish(list, () => 0.99)?.name).toBe('b')
    expect(rollDish(list, () => 1)?.name).toBe('b') // 边界不越界
  })

  it('按小时推断当前餐次', () => {
    const cases: [number, MealSlot][] = [
      [7, 'breakfast'],
      [12, 'lunch'],
      [19, 'dinner'],
      [22, 'snack'],
    ]
    for (const [hour, slot] of cases) expect(slotOfHour(hour)).toBe(slot)
  })
})
