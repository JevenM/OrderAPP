import type { Meal, MealSlot, MealStatus } from './types'
import { SLOT_LABEL } from './types'

/**
 * 三餐周期总结报告（纯函数层）。
 *
 * 隔离口径：meals / posts / orders 没有情侣对字段，唯一归属依据是 member_id。
 * 这里再按 [本人, 对方] 过滤一遍并排除空值，作为数据层之外的第二道保险——
 * 即使上游查询漏了条件，也不会把别对情侣的记录算进报告。
 */

export type ReportKind = 'month' | 'half' | 'year'

export interface ReportPeriod {
  kind: ReportKind
  /** 稳定业务键：2026-11 / 2026-H2 / 2026，用于「只推一次」去重 */
  key: string
  label: string
  /** 含 */
  start: string
  /** 不含 */
  end: string
  days: number
  /** 周期是否已完结（end 不晚于今天） */
  closed: boolean
}

export interface TasteStat {
  key: string
  label: string
  count: number
}

export interface MealReport {
  period: ReportPeriod
  /** 有效打卡条数（属于本对情侣） */
  total: number
  /** 有打卡的天数 */
  days: number
  /** days / 周期天数，0~1 */
  coverage: number
  longestStreak: number
  bySlot: Record<MealSlot, number>
  byStatus: Record<MealStatus, number>
  /** 早餐记录条数 */
  breakfastCount: number
  /** 照片数 */
  photoCount: number
  /** 按首次写入时间估算的按时记录率，0~1；加餐不计入分母 */
  onTimeRate: number
  /** 高频食物词 */
  topFoods: { name: string; count: number }[]
  /** 品类 / 口味倾向（可重叠计数） */
  tastes: TasteStat[]
  suggestions: string[]
  /** 因 member_id 为空而无法归属、被排除的记录数 */
  unattributed: number
}

const DAY_MS = 24 * 60 * 60 * 1000

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** 用本地年月日拼出 YYYY-MM-DD，避免 toISOString 的 UTC 偏移 */
export function dateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 按 UTC 日历算天数差，避开夏令时导致的 23/25 小时 */
function daysBetween(start: string, end: string): number {
  const [sy, sm, sd] = start.split('-').map(Number)
  const [ey, em, ed] = end.split('-').map(Number)
  return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / DAY_MS)
}

function makePeriod(kind: ReportKind, year: number, halfIndex: number, monthIndex: number, today: string): ReportPeriod {
  let start: Date
  let end: Date
  let key: string
  let label: string
  if (kind === 'year') {
    start = new Date(year, 0, 1)
    end = new Date(year + 1, 0, 1)
    key = String(year)
    label = `${year} 年`
  } else if (kind === 'half') {
    const m = halfIndex === 0 ? 0 : 6
    start = new Date(year, m, 1)
    end = new Date(year, m + 6, 1)
    key = `${year}-H${halfIndex + 1}`
    label = `${year} 年${halfIndex === 0 ? '上' : '下'}半年`
  } else {
    start = new Date(year, monthIndex, 1)
    end = new Date(year, monthIndex + 1, 1)
    key = `${year}-${pad(monthIndex + 1)}`
    label = `${year} 年 ${monthIndex + 1} 月`
  }
  const startStr = dateStr(start)
  const endStr = dateStr(end)
  return {
    kind,
    key,
    label,
    start: startStr,
    end: endStr,
    days: daysBetween(startStr, endStr),
    closed: endStr <= today,
  }
}

/**
 * 生成可切换的周期列表（从当前周期往前倒推，含当前未完结周期）。
 * month 给 12 个、half 给 6 个、year 给 5 个。
 */
export function listPeriods(kind: ReportKind, count: number, now = new Date()): ReportPeriod[] {
  const today = dateStr(now)
  const year = now.getFullYear()
  const month = now.getMonth()
  const out: ReportPeriod[] = []
  for (let i = 0; i < count; i += 1) {
    if (kind === 'year') {
      out.push(makePeriod('year', year - i, 0, 0, today))
    } else if (kind === 'half') {
      // 当前半年 index = 0/1，往前每退一格切换半年并借位到上一年
      const currentHalf = month < 6 ? 0 : 1
      const absolute = currentHalf - i
      const y = year + Math.floor(absolute / 2)
      const h = ((absolute % 2) + 2) % 2
      out.push(makePeriod('half', y, h, 0, today))
    } else {
      const absolute = month - i
      const y = year + Math.floor(absolute / 12)
      const m = ((absolute % 12) + 12) % 12
      out.push(makePeriod('month', y, 0, m, today))
    }
  }
  return out
}

/** 最近一个已完结的周期：月报=上月、半年报=上一个半年、年报=去年 */
export function lastClosedPeriod(kind: ReportKind, now = new Date()): ReportPeriod {
  const today = dateStr(now)
  const year = now.getFullYear()
  const month = now.getMonth()
  if (kind === 'year') return makePeriod('year', year - 1, 0, 0, today)
  if (kind === 'half') {
    const currentHalf = month < 6 ? 0 : 1
    return currentHalf === 0 ? makePeriod('half', year - 1, 1, 0, today) : makePeriod('half', year, 0, 0, today)
  }
  const absolute = month - 1
  const y = year + Math.floor(absolute / 12)
  const m = ((absolute % 12) + 12) % 12
  return makePeriod('month', y, 0, m, today)
}

/** 最长连续打卡天数：日期去重排序后逐日判断是否相邻 */
export function longestStreak(days: string[]): number {
  const unique = [...new Set(days.map((d) => d.slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort()
  let best = 0
  let run = 0
  let prev = Number.NaN
  for (const day of unique) {
    const [y, m, d] = day.split('-').map(Number)
    const at = Date.UTC(y, m - 1, d)
    run = Number.isFinite(prev) && at - prev === DAY_MS ? run + 1 : 1
    best = Math.max(best, run)
    prev = at
  }
  return best
}

/** 把「小米粥 + 鸡蛋 + 半个肉包」「番茄炒蛋×1、米饭×2」这类自由文本拆成食物词 */
export function splitFoods(content: string): string[] {
  if (!content) return []
  const cleaned = content
    .replace(/[×xX*]\s*\d+(?:\.\d+)?\s*(?:份|个|碗|杯|块|根|片|只|条)?/g, ' ')
    .replace(/[（(][^）)]*[）)]/g, ' ')
  return cleaned
    .split(/[、,，+＋/／|｜\n\r\t\s·•;；。!！~～]+|和|还有|加上|配|以及/g)
    .map((s) => s.trim().replace(/^[一二两三四五六七八九十几半些\d]+(?:个|份|碗|杯|块|根|片|只|条|勺|口|盒|袋|两)?/, '').trim())
    .filter((s) => s.length >= 2 && s.length <= 12 && !/^(没吃|吃得少|吃了|无|随便|一样|其他|外卖一顿)$/.test(s))
}

const TASTE_GROUPS: { key: string; label: string; words: string[] }[] = [
  { key: 'staple', label: '主食', words: ['饭', '面', '粉', '粥', '包', '馒头', '饼', '饺', '馄饨', '米', '麦', '吐司', '面包', '土豆', '红薯', '玉米', '年糕'] },
  { key: 'protein', label: '肉蛋奶豆', words: ['蛋', '肉', '鸡', '牛', '猪', '鱼', '虾', '奶', '豆', '排骨', '火腿', '培根', '鸭', '蟹'] },
  { key: 'veg', label: '蔬菜水果', words: ['菜', '瓜', '果', '沙拉', '菇', '萝卜', '番茄', '西红柿', '黄瓜', '菠菜', '苹果', '香蕉', '橙', '莓', '生菜'] },
  { key: 'soup', label: '汤水饮品', words: ['汤', '粥', '茶', '汁', '豆浆', '咖啡', '可乐', '酸奶', '牛奶', '水'] },
  { key: 'heavy', label: '重口 / 外食', words: ['辣', '炸', '烤', '火锅', '烧烤', '奶茶', '汉堡', '薯条', '外卖', '打包', '餐厅', '食堂', '麻辣', '奶油', '可乐', '香肠'] },
]

/** 常规用餐时段（本地小时）；加餐不参与「按时」判定 */
const SLOT_HOURS: Record<MealSlot, [number, number]> = {
  breakfast: [5, 10],
  lunch: [10, 15],
  dinner: [16, 21],
  snack: [0, 24],
}

function pct(n: number, d: number): number {
  return d > 0 ? Math.min(1, Math.max(0, n / d)) : 0
}

function percentText(ratio: number): string {
  return `${Math.round(ratio * 100)}%`
}

/**
 * 聚合一段周期里的三餐记录，生成偏好、习惯与建议。
 * 传入的 meals 应为整个周期的记录；函数内部再按情侣对过滤一次并剔除无归属数据。
 */
export function analyzeMeals(period: ReportPeriod, raw: Meal[], pair: readonly [string, string]): MealReport {
  const owners = new Set(pair)
  let unattributed = 0
  const meals = raw.filter((m) => {
    if (m.day < period.start || m.day >= period.end) return false
    // 别对情侣的记录静默丢弃：既不能进统计，也不该在提示里暴露它们的存在
    if (m.member_id && !owners.has(m.member_id)) return false
    // member_id 为空的是早期无归属记录，只有这类才需要提示用户可回填
    if (!m.member_id) {
      unattributed += 1
      return false
    }
    return true
  })

  const bySlot: Record<MealSlot, number> = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 }
  const byStatus: Record<MealStatus, number> = { eaten: 0, little: 0, skipped: 0 }
  const daySet = new Set<string>()
  let photoCount = 0
  let onTime = 0
  let onTimeTotal = 0
  const foodCount = new Map<string, number>()
  const tasteCount = new Map<string, number>(TASTE_GROUPS.map((g) => [g.key, 0]))

  for (const m of meals) {
    bySlot[m.slot] = (bySlot[m.slot] ?? 0) + 1
    byStatus[m.status] = (byStatus[m.status] ?? 0) + 1
    daySet.add(m.day.slice(0, 10))
    if (m.photo_url) photoCount += 1
    if (m.slot !== 'snack' && m.created_at) {
      const hour = new Date(m.created_at).getHours()
      const [from, to] = SLOT_HOURS[m.slot]
      onTimeTotal += 1
      if (hour >= from && hour < to) onTime += 1
    }
    const foods = splitFoods(m.content)
    for (const food of foods) foodCount.set(food, (foodCount.get(food) ?? 0) + 1)
    for (const group of TASTE_GROUPS) {
      if (group.words.some((w) => m.content.includes(w))) tasteCount.set(group.key, (tasteCount.get(group.key) ?? 0) + 1)
    }
  }

  const days = daySet.size
  const coverage = pct(days, period.days)
  const onTimeRate = pct(onTime, onTimeTotal)
  const topFoods = [...foodCount.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }))
  const tastes = TASTE_GROUPS.map((g) => ({ key: g.key, label: g.label, count: tasteCount.get(g.key) ?? 0 }))

  const report: MealReport = {
    period,
    total: meals.length,
    days,
    coverage,
    longestStreak: longestStreak([...daySet]),
    bySlot,
    byStatus,
    breakfastCount: bySlot.breakfast,
    photoCount,
    onTimeRate,
    topFoods,
    tastes,
    suggestions: [],
    unattributed,
  }
  report.suggestions = buildSuggestions(report)
  return report
}

/** 规则引擎：按本周期的真实指标给建议，至少 1 条、最多 6 条 */
export function buildSuggestions(r: MealReport): string[] {
  const out: string[] = []
  const regular = r.bySlot.breakfast + r.bySlot.lunch + r.bySlot.dinner

  if (r.total === 0) {
    return ['这段时间还没有属于你们俩的打卡记录。先从每天记一餐开始，攒够一周就能看出习惯啦。']
  }

  if (r.longestStreak >= 14) out.push(`最长连着打卡 ${r.longestStreak} 天，这个节奏很稳，继续保持就好 💪`)
  else if (r.longestStreak >= 7) out.push(`最长连续打卡 ${r.longestStreak} 天，已经形成习惯啦，试试把早餐也固定下来。`)
  else if (r.coverage < 0.5) out.push(`这段 ${r.period.days} 天里只有 ${r.days} 天有记录（覆盖 ${percentText(r.coverage)}），先从「每天至少记一餐」开始，别给自己太大压力。`)

  if (r.days > 0 && r.breakfastCount / r.days < 0.6) {
    out.push(`早餐记录 ${r.breakfastCount} 次 / ${r.days} 个有记录的日子，早餐最容易漏。哪怕一杯牛奶一个鸡蛋，也顺手记一笔。`)
  }
  if (r.byStatus.skipped > 0 && r.byStatus.skipped / r.total >= 0.08) {
    out.push(`有 ${r.byStatus.skipped} 次「没吃」。忙起来容易忘，可以约好互相提醒，或在前一晚备点能随手吃的东西。`)
  }
  if (r.byStatus.little > 0 && r.byStatus.little / r.total >= 0.2) {
    out.push(`「吃得少」出现 ${r.byStatus.little} 次，占比不低。胃口不好时留意是不是作息或压力在影响。`)
  }

  const veg = r.tastes.find((t) => t.key === 'veg')?.count ?? 0
  const heavy = r.tastes.find((t) => t.key === 'heavy')?.count ?? 0
  if (regular > 0) {
    if (veg / regular < 0.25) out.push('记录里蔬菜水果出现得不多，下一周试着每顿加一份青菜或一个水果。')
    if (heavy / regular >= 0.3) out.push('重口 / 外卖类出现得比较频繁，可以给自己定个「一周两天清淡日」的小约定。')
  }

  const top3 = r.topFoods.slice(0, 3).reduce((sum, f) => sum + f.count, 0)
  const allFoods = r.topFoods.reduce((sum, f) => sum + f.count, 0)
  if (allFoods >= 6 && top3 / allFoods >= 0.6) {
    out.push(`吃得最频繁的是 ${r.topFoods.slice(0, 3).map((f) => f.name).join('、')}，选择挺集中。偶尔换点新菜，营养和新鲜感都能兼顾。`)
  }

  if (r.onTimeRate < 0.6 && r.total >= 8) {
    out.push(`按首次提交时间估算，按时记录约 ${percentText(r.onTimeRate)}。不少是事后补记，试试吃完顺手就打卡。`)
  }
  if (r.photoCount === 0 && r.total >= 5) out.push('这段时间一张饭照都没留，下次拍一张，年底回顾会更好看 📸')
  if (r.unattributed > 0) {
    out.push(`另有 ${r.unattributed} 条早期记录没有归属成员，未计入本报告（可用迁移 0048 回填）。`)
  }
  if (!out.length) out.push('三餐记录很规律，也没有明显偏食，保持现状就很好 ❤️')
  return out.slice(0, 6)
}

/** 推送用的一句话摘要（铃铛 / 浏览器通知正文） */
export function reportSummary(r: MealReport): string {
  if (!r.total) return `${r.period.label}还没有打卡记录，新的一期从今天开始吧～`
  return `${r.period.label}：打卡 ${r.total} 次、覆盖 ${r.days} 天，最长连续 ${r.longestStreak} 天。${r.suggestions[0] ?? ''}`
}

/* ------------------------------ 自动推送去重 ------------------------------ */

/** 只补最近 60 天内结束的周期：覆盖月初 / 半年初 / 年初，又不会翻出很久以前的旧报告 */
export const REPORT_PUSH_WINDOW_MS = 60 * 24 * 60 * 60 * 1000
const PUSH_PREFIX = 'meal-report-pushed-'

export function orderedPairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

/** 本机去重键带上情侣对，A 情侣推过不会影响 B 情侣 */
export function mealReportPushKey(memberId: string, friendId: string, kind: ReportKind, periodKey: string): string {
  return `${PUSH_PREFIX}${orderedPairKey(memberId, friendId)}:${kind}:${periodKey}`
}

/** 某个刚结束的周期是否还需要推送（hasPushed 可注入，便于单测） */
export function isMealReportDue(
  memberId: string,
  friendId: string,
  kind: ReportKind,
  now: Date,
  hasPushed: (storageKey: string) => boolean
): boolean {
  const period = lastClosedPeriod(kind, now)
  const endMs = new Date(`${period.end}T00:00:00`).getTime()
  if (now.getTime() - endMs > REPORT_PUSH_WINDOW_MS) return false
  return !hasPushed(mealReportPushKey(memberId, friendId, kind, period.key))
}

/** 排版好的文本文档（带 BOM 由调用方加） */
export function buildMealReportText(r: MealReport, myName: string, friendName: string): string {
  const lines: string[] = [
    `🍚 ${myName} × ${friendName} 的三餐报告 · ${r.period.label}`,
    '════════════════════════════════',
    `统计区间：${r.period.start} ~ ${r.period.end}（不含，共 ${r.period.days} 天）`,
    `导出时间：${new Date().toLocaleString('zh-CN')}`,
    '数据范围：仅统计当前绑定的情侣对，不含其他用户',
    '',
    '【吃饭习惯】',
    `  打卡 ${r.total} 次，覆盖 ${r.days} 天（覆盖率 ${percentText(r.coverage)}）`,
    `  最长连续打卡 ${r.longestStreak} 天`,
    `  餐次：早餐 ${r.bySlot.breakfast} · 午餐 ${r.bySlot.lunch} · 晚餐 ${r.bySlot.dinner} · 加餐 ${r.bySlot.snack}`,
    `  状态：吃了 ${r.byStatus.eaten} · 吃得少 ${r.byStatus.little} · 没吃 ${r.byStatus.skipped}`,
    `  按时记录率 ${percentText(r.onTimeRate)}（按首次提交时间估算，加餐不计）`,
    `  带照片的记录 ${r.photoCount} 条`,
    '',
    '【吃饭偏好】',
  ]
  if (r.topFoods.length) {
    lines.push(`  最常出现：${r.topFoods.map((f) => `${f.name}(${f.count})`).join('、')}`)
  } else {
    lines.push('  最常出现：暂无可识别的食物词')
  }
  lines.push(`  品类倾向：${r.tastes.map((t) => `${t.label} ${t.count}`).join(' · ')}（同一餐可归入多类）`)
  lines.push('', '【给你的建议】')
  r.suggestions.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`))
  if (r.unattributed) lines.push('', `注：另有 ${r.unattributed} 条无归属的早期记录未计入。`)
  lines.push('', '—— 由点菜小屋自动生成')
  return lines.join('\r\n')
}

/** 导出明细 CSV 的行（不含表头） */
export function mealDetailRows(meals: Meal[], pair: readonly [string, string]): (string | number)[][] {
  const owners = new Set(pair)
  return meals
    .filter((m) => !!m.member_id && owners.has(m.member_id))
    .sort((a, b) => a.day.localeCompare(b.day) || a.slot.localeCompare(b.slot))
    .map((m) => [
      m.day,
      SLOT_LABEL[m.slot] ?? m.slot,
      m.status === 'eaten' ? '吃了' : m.status === 'little' ? '吃得少' : '没吃',
      m.content,
      m.note,
      m.photo_url ? '有' : '',
      m.created_at,
    ])
}
