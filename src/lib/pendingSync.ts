/**
 * 断网暂存补传队列：单机小游戏（星尘 2048 / 动物世界消消乐 / 合成大西瓜）局终要写
 * 远端的数据（情侣榜成绩、防沉迷每日进度），在断网 / 请求失败时先落 localStorage，
 * 等恢复联网后自动补传，成绩不再静默丢失。
 *
 * 触发补传的时机：
 * - 进入任一接入了本队列的游戏页面（组件挂载时主动调 flushPendingSync）
 * - 浏览器派发 `online` 事件（Wi-Fi / 流量恢复）
 * - 补传仍有失败时按退避间隔自动重试
 *
 * 数据可靠性取舍：
 * - 成绩逐条保留（同一局一条，失败重试不合并）；2048 同难度当天超 10 条的清理由
 *   addCoupleGameScore 自己负责，补传顺序不影响榜单语义
 * - 每日进度按「用户 + 游戏 + 日期」幂等覆盖，同 key 只保留最新一条，不会越积越多
 * - 队列上限 60 条、最长保留 7 天，超限丢最旧的，防止 localStorage 被撑爆
 */

import { addCoupleGameScore, saveCoupleGameProgress, type CoupleGameKey } from './db'

export interface PendingScoreInput {
  userA: string
  userB: string
  game: CoupleGameKey
  playerId: string
  score: number
  detail: string
}

export interface PendingProgressInput {
  userId: string
  friendId: string
  game: string
  day: string
  progress: Record<string, unknown>
}

interface PendingEntry {
  id: string
  kind: 'score' | 'progress'
  /** progress 类的幂等 key：同 key 只保留最新一条 */
  coalesceKey?: string
  queuedAt: number
  score?: PendingScoreInput
  progress?: PendingProgressInput
}

const STORE_KEY = 'couple-pending-sync'
const MAX_ITEMS = 60
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

let seq = 0
let entries: PendingEntry[] = loadEntries()
let flushing = false
let retryTimer: ReturnType<typeof setTimeout> | null = null
const flushedListeners = new Set<(uploaded: number) => void>()

function loadEntries(): PendingEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? '') as PendingEntry[] | null
    if (!Array.isArray(raw)) return []
    const now = Date.now()
    return raw
      .filter((e) => e && (e.kind === 'score' || e.kind === 'progress') && now - e.queuedAt < MAX_AGE_MS)
      .slice(-MAX_ITEMS)
  } catch {
    return []
  }
}

function persist(): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(entries))
  } catch {
    // 写不进就只在本会话内有效，下次进来重新暂存
  }
}

/** 补传成功后的回调（用于刷新榜单等）；返回取消订阅函数 */
export function onPendingSyncFlushed(cb: (uploaded: number) => void): () => void {
  flushedListeners.add(cb)
  return () => flushedListeners.delete(cb)
}

function scheduleFlush(delayMs: number): void {
  if (retryTimer) return
  retryTimer = setTimeout(() => {
    retryTimer = null
    void flushPendingSync()
  }, delayMs)
}

/**
 * 尝试把暂存的数据逐条补传；返回成功条数。
 * 单条失败不影响其余条目，失败的原样留在队列里等下次触发。
 */
export async function flushPendingSync(): Promise<number> {
  if (flushing || !entries.length) return 0
  flushing = true
  const now = Date.now()
  entries = entries.filter((e) => now - e.queuedAt < MAX_AGE_MS)
  const remaining: PendingEntry[] = []
  let uploaded = 0
  for (const entry of entries) {
    try {
      if (entry.kind === 'score' && entry.score) {
        await addCoupleGameScore(entry.score)
      } else if (entry.kind === 'progress' && entry.progress) {
        await saveCoupleGameProgress(entry.progress)
      } else {
        continue
      }
      uploaded += 1
    } catch {
      remaining.push(entry)
    }
  }
  entries = remaining.slice(-MAX_ITEMS)
  persist()
  flushing = false
  if (uploaded > 0) {
    for (const cb of flushedListeners) {
      try {
        cb(uploaded)
      } catch {
        // 回调异常不影响补传流程
      }
    }
  }
  // 还有没传完的（断网中 / 部分失败）：安排下一轮退避重试
  if (remaining.length) scheduleFlush(30_000)
  return uploaded
}

/** 暂存一条游戏成绩（调用方在 addCoupleGameScore 失败时调用） */
export function queuePendingScore(input: PendingScoreInput): void {
  entries = [
    ...entries.slice(-(MAX_ITEMS - 1)),
    { id: `s${Date.now()}-${seq++}`, kind: 'score', queuedAt: Date.now(), score: input },
  ]
  persist()
  // 当前在线的话大概率是瞬时抖动，稍等片刻就地重试；断网则等 online 事件 / 下次进页面
  if (typeof navigator === 'undefined' || navigator.onLine) scheduleFlush(10_000)
}

/** 暂存一条每日进度（幂等覆盖语义，同 key 只留最新） */
export function queuePendingProgress(input: PendingProgressInput): void {
  const coalesceKey = `${input.userId}|${input.game}|${input.day}`
  entries = [
    ...entries.filter((e) => e.coalesceKey !== coalesceKey),
    { id: `p${Date.now()}-${seq++}`, kind: 'progress', coalesceKey, queuedAt: Date.now(), progress: input },
  ]
  persist()
  if (typeof navigator === 'undefined' || navigator.onLine) scheduleFlush(10_000)
}

// 恢复联网即刻补传；模块只被各游戏组件引入，不会在无关页面产生副作用
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flushPendingSync())
}
