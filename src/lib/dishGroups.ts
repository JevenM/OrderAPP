/**
 * 点菜页的菜系大类：菜单里的 category 是自由文本（家常菜 / 奶茶 / 主食…），
 * 直接横向铺开会很长且滑不动，于是收拢成三个大类，点开再展开细分标签。
 *
 * 纯函数，方便单测；新增菜系时优先在 EXPLICIT 里登记，兜底再用关键词猜。
 */
export type DishGroupKey = 'meal' | 'staple' | 'sweet'

export const DISH_GROUPS: { key: DishGroupKey; label: string; emoji: string }[] = [
  { key: 'meal', label: '正餐', emoji: '🍲' },
  { key: 'staple', label: '主食小吃', emoji: '🍜' },
  { key: 'sweet', label: '甜品饮品', emoji: '🍰' },
]

/** 明确登记过的菜系：命中就不必走关键词猜测，避免「牛肉面」被归到正餐这类误判 */
const EXPLICIT: Record<string, DishGroupKey> = {
  家常菜: 'meal',
  荤菜: 'meal',
  素菜: 'meal',
  汤羹: 'meal',
  西餐: 'meal',
  海鲜: 'meal',
  早餐: 'meal',
  凉菜: 'meal',
  主食: 'staple',
  面食: 'staple',
  小吃: 'staple',
  烧烤: 'staple',
  火锅: 'staple',
  粥: 'staple',
  零食: 'staple',
  甜品: 'sweet',
  甜点: 'sweet',
  奶茶: 'sweet',
  饮品: 'sweet',
  饮料: 'sweet',
  咖啡: 'sweet',
  水果: 'sweet',
  蛋糕: 'sweet',
}

/** 兜底关键词：顺序有意义——先判甜品饮品，再判主食小吃，最后落到正餐 */
const RULES: { key: DishGroupKey; words: string[] }[] = [
  { key: 'sweet', words: ['甜', '奶茶', '饮', '咖啡', '果', '蛋糕', '冰', '雪糕', '布丁', '酸奶', '奶昔'] },
  { key: 'staple', words: ['主食', '小吃', '饭', '面', '粉', '粥', '饺', '包', '饼', '烧烤', '火锅', '串', '零食'] },
  { key: 'meal', words: ['菜', '汤', '肉', '鱼', '虾', '鸡', '牛', '素', '家常', '西餐', '海鲜', '凉', '炖', '炒'] },
]

export function dishGroupOf(category: string): DishGroupKey {
  const key = (category ?? '').trim()
  if (!key) return 'meal'
  const hit = EXPLICIT[key]
  if (hit) return hit
  for (const rule of RULES) {
    if (rule.words.some((w) => key.includes(w))) return rule.key
  }
  return 'meal'
}

export type DishGroupBucket<T> = {
  key: DishGroupKey
  label: string
  emoji: string
  /** 该大类下的细分菜系（保持传入顺序），空数组表示这一类暂时没有菜 */
  categories: [string, T[]][]
  count: number
}

/** 把按 category 分好组的菜品重新归拢成三个大类 */
export function bucketByGroup<T>(entries: [string, T[]][]): DishGroupBucket<T>[] {
  const buckets = DISH_GROUPS.map((g) => ({ ...g, categories: [] as [string, T[]][], count: 0 }))
  const byKey = new Map(buckets.map((b) => [b.key, b]))
  for (const [category, list] of entries) {
    const bucket = byKey.get(dishGroupOf(category))
    if (!bucket) continue
    bucket.categories.push([category, list])
    bucket.count += list.length
  }
  return buckets
}
