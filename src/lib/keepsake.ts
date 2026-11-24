import type { Post } from './types'

/* ============================================================
 * 共同回忆层：备婚沟通台账(C1) / 时光胶囊(F3) / 相册(C3) / 年度回顾(F4)
 * 这里只放「类型 + 纯函数」，不碰 Supabase，方便单测覆盖规则。
 * 台账与胶囊的实体数据存在 couple_wedding.state 的 jsonb 里，
 * 与备婚流程共用同一套乐观锁和 realtime 同步，因此无需新建表。
 * ============================================================ */

/** 备婚沟通台账里的一条议题：把「彩礼 / 定居」这类需要反复谈的事记成结构化记录 */
export interface WeddingTopic {
  id: string
  /** 议题名称，如「彩礼与嫁妆」 */
  title: string
  /** 我的口径 / 想法 */
  mine: string
  /** TA 的口径 / 想法 */
  theirs: string
  /** 谁负责继续跟进 */
  owner: 'me' | 'ta' | 'both'
  /** 约好下次再聊的日期 YYYY-MM-DD，空串表示没约 */
  nextTalk: string
  /** 是否已经谈拢 */
  settled: boolean
  /** 补充细节（双方家长意见、算过的账等） */
  note: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

/** 时光胶囊：写给未来的信，到 openAt 当天零点自动开封，双方可见 */
export interface TimeCapsule {
  id: string
  /** 作者的成员 id */
  author: string
  authorName: string
  title: string
  content: string
  /** 开封日期 YYYY-MM-DD */
  openAt: string
  createdAt: string
}

/** 年度回顾聚合结果：数字全部由 db.loadYearReview 统计，这里只定义形状 */
export interface YearReview {
  year: number
  /** 三餐打卡总次数 */
  meals: number
  /** 有打卡的天数 */
  mealDays: number
  /** 最长连续打卡天数 */
  longestStreak: number
  messages: number
  quizzes: number
  truths: number
  wishes: number
  photos: number
  weddingDone: number
  weddingTotal: number
  capsules: number
  topicsSettled: number
  topicsTotal: number
}

export const EMPTY_YEAR_REVIEW: YearReview = {
  year: new Date().getFullYear(),
  meals: 0, mealDays: 0, longestStreak: 0,
  messages: 0, quizzes: 0, truths: 0, wishes: 0, photos: 0,
  weddingDone: 0, weddingTotal: 0, capsules: 0, topicsSettled: 0, topicsTotal: 0,
}

/** 异地备婚最容易卡住的议题，点一下就能加进台账 */
export const TOPIC_PRESETS: string[] = [
  '彩礼与嫁妆',
  '酒席与宾客名单',
  '定居哪座城市',
  '房子与装修',
  '双方父母赡养',
  '婚礼形式与场地',
  '领证与婚期',
  '婚后财务怎么管',
  '谁先回家乡 / 往返安排',
  '生育计划与节奏',
]

export const TOPIC_OWNER_LABEL: Record<WeddingTopic['owner'], string> = {
  me: '我跟进',
  ta: 'TA 跟进',
  both: '一起跟进',
}

/** 新建议题时给一份空白骨架，避免各处重复写默认值 */
export function blankTopic(id: string, title: string, createdBy: string, now = new Date().toISOString()): WeddingTopic {
  return {
    id, title, mine: '', theirs: '', owner: 'both', nextTalk: '', settled: false, note: '',
    createdBy, createdAt: now, updatedAt: now,
  }
}

export function topicSummary(topics: WeddingTopic[]): { total: number; settled: number; pending: number } {
  const settled = topics.filter((t) => t.settled).length
  return { total: topics.length, settled, pending: topics.length - settled }
}

/** YYYY-MM-DD 按本地时区的当天零点解析（不用 new Date(str)，那是 UTC，会差一天） */
export function localDayStart(date: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return Number.NaN
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
}

/** 胶囊是否已到开封时间 */
export function capsuleUnlocked(openAt: string, now: number = Date.now()): boolean {
  const at = localDayStart(openAt)
  return Number.isFinite(at) && now >= at
}

/** 距离开封还有几天；已开封或日期非法返回 0 */
export function capsuleDaysLeft(openAt: string, now: number = Date.now()): number {
  const at = localDayStart(openAt)
  if (!Number.isFinite(at) || now >= at) return 0
  const DAY = 24 * 60 * 60 * 1000
  const today = new Date(now)
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  return Math.max(1, Math.round((at - todayStart) / DAY))
}

/** 相册按年月分组（posts 需已按时间倒序）；key 形如 2026-11 */
export function groupAlbumByMonth(posts: Post[]): { month: string; label: string; posts: Post[] }[] {
  const groups = new Map<string, Post[]>()
  for (const post of posts) {
    const d = new Date(post.created_at)
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    groups.set(month, [...(groups.get(month) ?? []), post])
  }
  return [...groups.entries()].map(([month, list]) => {
    const [y, m] = month.split('-')
    return { month, label: `${y} 年 ${Number(m)} 月`, posts: list }
  })
}

/** 「我们的第 N 天」：以两人第一张照片当天为第 1 天 */
export function albumDayIndex(createdAt: string, firstAt: string): number {
  const a = new Date(createdAt)
  const b = new Date(firstAt)
  const dayA = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()
  const dayB = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()
  return Math.max(1, Math.floor((dayA - dayB) / (24 * 60 * 60 * 1000)) + 1)
}

/** 最长连续天数：入参是 YYYY-MM-DD 列表，可重复、可乱序 */
export function longestStreak(days: string[]): number {
  const unique = [...new Set(days.map((d) => d.slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort()
  let best = 0
  let run = 0
  let prev = Number.NaN
  const DAY = 24 * 60 * 60 * 1000
  for (const day of unique) {
    const at = localDayStart(day)
    run = Number.isFinite(prev) && at - prev === DAY ? run + 1 : 1
    best = Math.max(best, run)
    prev = at
  }
  return best
}

/** 年度回顾导出成排版好的纯文本（带 BOM 由调用方处理） */
export function buildReviewText(review: YearReview, myName: string, friendName: string): string {
  const lines = [
    `💕 ${myName} × ${friendName} 的 ${review.year} 年度回顾`,
    '════════════════════════════════',
    '',
    '【一起吃饭】',
    `  三餐打卡 ${review.meals} 次，覆盖 ${review.mealDays} 天`,
    `  最长连着打卡 ${review.longestStreak} 天`,
    '',
    '【说过的话】',
    `  甜蜜留言 ${review.messages} 条`,
    `  同步抉择 ${review.quizzes} 题 · 真心话 ${review.truths} 题`,
    `  秘密心愿 ${review.wishes} 个`,
    `  共同相册 ${review.photos} 张照片`,
    '',
    '【一起走的下一步】',
    `  备婚流程 ${review.weddingDone}/${review.weddingTotal} 步`,
    `  沟通台账 ${review.topicsSettled}/${review.topicsTotal} 项已谈拢`,
    `  写给未来的信 ${review.capsules} 封`,
    '',
    '────────────────────────────────',
    `${review.year} 也一起走过来了，明年继续。`,
    `生成时间：${new Date().toLocaleString('zh-CN')}`,
    '',
  ]
  return lines.join('\r\n')
}
