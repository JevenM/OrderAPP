import { toDayStr } from './date'

/**
 * 爱心树的成长模型。
 *
 * 两条独立的成长线，合起来才是「慢慢长大」：
 * - **树干** = 累计浇水次数，只增不减。断签也不消失 —— 你们一起走过的日子不会白费。
 * - **树冠** = 连续共同打卡天数。断签就凋零，重新连续打卡再长回来。
 *
 * 所以断签后看到的是一棵「光秃但粗壮」的树，而不是一夜回到种子。
 */

/**
 * 连续共同打卡天数 → 树冠成长 0~1（断签会凋零）。
 *
 * 最高阶段的门槛必须 <= LOVE_TREE_LOOKBACK，否则回溯窗口不够长，
 * 那个阶段永远达不到（树会卡在次高阶段不动）。
 */
const CANOPY_CURVE: [number, number][] = [
  [0, 0],
  [1, 0.1],
  [3, 0.22],
  [7, 0.38],
  [14, 0.55],
  [25, 0.7],
  [40, 0.85],
  [60, 1],
]

/** 累计浇水次数 → 树干成长 0~1（只增不减） */
const TRUNK_CURVE: [number, number][] = [
  [0, 0],
  [2, 0.14],
  [8, 0.32],
  [20, 0.5],
  [40, 0.66],
  [70, 0.8],
  [120, 1],
]

/** 分段线性插值：让树是平滑长大的，而不是一格一格跳 */
const interp = (curve: [number, number][], x: number): number => {
  if (x <= curve[0][0]) return curve[0][1]
  for (let i = 1; i < curve.length; i += 1) {
    const [x1, y1] = curve[i]
    if (x <= x1) {
      const [x0, y0] = curve[i - 1]
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
    }
  }
  return curve[curve.length - 1][1]
}

export const canopyGrowthOf = (streak: number): number => interp(CANOPY_CURVE, streak)
export const trunkGrowthOf = (water: number): number => interp(TRUNK_CURVE, water)

export interface LoveTreeStage {
  /** 进入这个阶段所需的连续天数 */
  min: number
  name: string
  emoji: string
  hint: string
}

export const LOVE_TREE_STAGES: LoveTreeStage[] = [
  { min: 0, name: '沉睡的种子', emoji: '🌰', hint: '两人都打完今天的三餐，就能浇上第一滴水' },
  { min: 1, name: '破土嫩芽', emoji: '🌱', hint: '连续 3 天，嫩芽会长成小树苗' },
  { min: 3, name: '小小树苗', emoji: '🌿', hint: '连续 7 天，会长出第一片爱心叶' },
  { min: 7, name: '爱心小树', emoji: '🍃', hint: '连续 14 天，树冠会变得枝繁叶茂' },
  { min: 14, name: '枝繁叶茂', emoji: '🌳', hint: '连续 25 天，树上会开满花' },
  { min: 25, name: '满树繁花', emoji: '🌸', hint: '连续 40 天，会结出红红的爱心果' },
  { min: 40, name: '爱心结果', emoji: '💗', hint: '连续 60 天，它就是你们的永恒爱心树' },
  { min: 60, name: '永恒爱心树', emoji: '✨', hint: '已经长到最高阶段，继续陪它长下去吧' },
]

export const loveTreeStageIndex = (streak: number): number => {
  let index = 0
  for (let i = 0; i < LOVE_TREE_STAGES.length; i += 1) if (streak >= LOVE_TREE_STAGES[i].min) index = i
  return index
}

export const loveTreeStage = (streak: number): LoveTreeStage => LOVE_TREE_STAGES[loveTreeStageIndex(streak)]

/** 距离下一阶段还差几天；已是最后阶段返回 null */
export const loveTreeNextGap = (streak: number): number | null => {
  const index = loveTreeStageIndex(streak)
  if (index >= LOVE_TREE_STAGES.length - 1) return null
  return LOVE_TREE_STAGES[index + 1].min - streak
}

/** 下一个阶段；已是最后阶段返回 null */
export const loveTreeNextStage = (streak: number): LoveTreeStage | null => {
  const index = loveTreeStageIndex(streak)
  if (index >= LOVE_TREE_STAGES.length - 1) return null
  return LOVE_TREE_STAGES[index + 1]
}

/** 当前阶段内的进度 0~1（最后阶段恒为 1） */
export const loveTreeStageProgress = (streak: number): number => {
  const index = loveTreeStageIndex(streak)
  if (index >= LOVE_TREE_STAGES.length - 1) return 1
  const from = LOVE_TREE_STAGES[index].min
  const to = LOVE_TREE_STAGES[index + 1].min
  return Math.min(1, Math.max(0, (streak - from) / (to - from)))
}

/** 最近 count 天（含今天）的 day 字符串，从今天往前倒序 */
export function recentDays(count: number): string[] {
  const out: string[] = []
  const base = new Date()
  // 锚在正午，避开跨日 / 夏令时的边界抖动
  base.setHours(12, 0, 0, 0)
  for (let i = 0; i < count; i += 1) {
    const d = new Date(base)
    d.setDate(d.getDate() - i)
    out.push(toDayStr(d))
  }
  return out
}

/**
 * 爱心树的历史部分：**只算到昨天为止**。
 *
 * 今天的那份由页面拿当天的打卡记录实时算出来再加上去 —— 这样两人打完餐的当下树就会长，
 * 不用等下一次拉取。「今天还没打完不算断签」的宽容也是由此自然成立的。
 */
export interface LoveTreeHistory {
  /** 截至昨天，连续「双方都打完三餐」的天数 */
  streak: number
  /** 截至昨天，累计浇水次数（每人打完三餐各算 1 次） */
  water: number
}

/** 爱心树回溯多少天的打卡记录。超过这个天数就按满值算，不影响观感 */
export const LOVE_TREE_LOOKBACK = 60
