import { toDayStr } from './date'

/**
 * 爱心树的成长模型。
 *
 * 两条线，分工明确：
 * - **树的大小与阶段** = 累计浇水次数。只增不减，断签也不缩回去 ——
 *   一起攒出来的树不会因为断一天就变回种子，阶段名必须反映树的真实年纪。
 * - **繁茂程度（叶 / 花 / 果）** = 连续共同打卡天数。断签就往下掉，
 *   但留一个由累计浇水撑起来的下限，所以大树是「掉了大半叶子」而不是「光杆」。
 */

/** 连续共同打卡天数 → 繁茂度 0~1（断签会往下掉） */
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

/**
 * 累计浇水次数 → 树的大小 0~1（只增不减）。
 * 阶段门槛也用这条轴的阈值，所以最高阶段的门槛必须 <= 2 * LOVE_TREE_LOOKBACK，
 * 否则回溯窗口不够长，那个阶段永远达不到。
 */
const SIZE_CURVE: [number, number][] = [
  [0, 0],
  [2, 0.12],
  [8, 0.3],
  [16, 0.46],
  [30, 0.62],
  [50, 0.76],
  [80, 0.88],
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

/** 树的整体大小：树干高度/粗细、枝条级数。只由累计浇水决定 */
export const treeSizeOf = (water: number): number => interp(SIZE_CURVE, water)

/**
 * 繁茂度：主力是连续天数，断签就往下掉。
 * 用累计浇水撑一个下限（0.22），长成的大树断签后是「掉了大半叶子」而不是「光杆」——
 * 不然视觉上会和「树已经长出来了」矛盾。
 */
export const canopyGrowthOf = (streak: number, water: number): number =>
  Math.max(interp(CANOPY_CURVE, streak), treeSizeOf(water) * 0.22)

export interface LoveTreeStage {
  /** 进入这个阶段所需的**累计浇水次数** */
  min: number
  name: string
  emoji: string
  hint: string
}

export const LOVE_TREE_STAGES: LoveTreeStage[] = [
  { min: 0, name: '沉睡的种子', emoji: '🌰', hint: '两人都打完今天的三餐，就能浇上第一滴水' },
  { min: 2, name: '破土嫩芽', emoji: '🌱', hint: '继续一起打卡，嫩芽会长成小树苗' },
  { min: 6, name: '小小树苗', emoji: '🌿', hint: '再攒一些水，树上就会冒出第一片爱心叶' },
  { min: 16, name: '爱心小树', emoji: '🍃', hint: '树冠长稳之后，枝条会越来越舒展' },
  { min: 30, name: '枝繁叶茂', emoji: '🌳', hint: '浇到 50 次，树上会开满花' },
  { min: 50, name: '满树繁花', emoji: '🌸', hint: '再浇 30 次，会结出红红的爱心果' },
  { min: 80, name: '爱心结果', emoji: '💗', hint: '再浇 40 次，它就是你们的永恒爱心树' },
  { min: 120, name: '永恒爱心树', emoji: '✨', hint: '已经长到最高阶段，继续陪它长下去吧' },
]

/** 以下四个都以**累计浇水次数**为轴：阶段名反映的是树的年纪，不是当前的连续天数 */
export const loveTreeStageIndex = (water: number): number => {
  let index = 0
  for (let i = 0; i < LOVE_TREE_STAGES.length; i += 1) if (water >= LOVE_TREE_STAGES[i].min) index = i
  return index
}

export const loveTreeStage = (water: number): LoveTreeStage => LOVE_TREE_STAGES[loveTreeStageIndex(water)]

/** 距离下一阶段还差几次水；已是最后阶段返回 null */
export const loveTreeNextGap = (water: number): number | null => {
  const index = loveTreeStageIndex(water)
  if (index >= LOVE_TREE_STAGES.length - 1) return null
  return LOVE_TREE_STAGES[index + 1].min - water
}

/** 下一个阶段；已是最后阶段返回 null */
export const loveTreeNextStage = (water: number): LoveTreeStage | null => {
  const index = loveTreeStageIndex(water)
  if (index >= LOVE_TREE_STAGES.length - 1) return null
  return LOVE_TREE_STAGES[index + 1]
}

/** 当前阶段内的进度 0~1（最后阶段恒为 1） */
export const loveTreeStageProgress = (water: number): number => {
  const index = loveTreeStageIndex(water)
  if (index >= LOVE_TREE_STAGES.length - 1) return 1
  const from = LOVE_TREE_STAGES[index].min
  const to = LOVE_TREE_STAGES[index + 1].min
  return Math.min(1, Math.max(0, (water - from) / (to - from)))
}

/** 树已经长起来了，但连续中断：叶子大半掉了，树还在 */
export const isDormantTree = (streak: number, water: number): boolean => streak === 0 && water > 0

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
