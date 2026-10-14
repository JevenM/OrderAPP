/**
 * 统一网络调度层
 *
 * 之前每个 store 各自 setInterval 轮询（9 个定时器、间隔 5s~30s 不等），
 * 结果是两个人各开一个页面时，每分钟有几十次 REST 请求，其中大量是在重复拉
 * members / friendships / app_settings 这类几乎不变的数据。
 *
 * 这里收拢成两件事：
 * 1. scheduleSync —— 全站只有 1 个定时器（5 秒心跳），各订阅按「到期时间」排队触发；
 *    页面切到后台直接不跑，回到前台立刻补一次，避免切回来看到旧数据。
 * 2. deduped —— 相同 key 的请求在 TTL 内复用同一个 Promise（含正在飞的那一个），
 *    多处同时拉同一张表时只产生 1 次网络请求。
 */

/* ------------------------------ 调度器 ------------------------------ */

type SyncTask = {
  key: string
  /** 轮询间隔（毫秒）；<=0 表示不参与轮询，只靠手动 runNow */
  intervalMs: number
  run: () => void
  nextDue: number
}

/** 心跳粒度：所有任务的实际触发误差控制在 ±5 秒内，比各自开定时器省 CPU 也省电 */
const TICK_MS = 5_000
/** 回到前台后错峰补拉的间隔，避免十几个请求同一瞬间打出去被限流 */
const RESUME_STAGGER_MS = 400

const tasks = new Map<string, SyncTask>()
let ticker: number | undefined
let resuming = false

function visible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible'
}

function runTask(task: SyncTask) {
  task.nextDue = Date.now() + task.intervalMs
  try {
    task.run()
  } catch {
    // 单次轮询失败不影响后续调度
  }
}

function tick() {
  if (!visible()) return
  const now = Date.now()
  for (const task of tasks.values()) {
    if (task.intervalMs > 0 && now >= task.nextDue) runTask(task)
  }
}

function ensureTicker() {
  if (ticker || typeof window === 'undefined') return
  ticker = window.setInterval(tick, TICK_MS)
  document.addEventListener('visibilitychange', onVisibility)
}

/** 回到前台：立刻补一轮到期任务（错峰），保证切回来看到的是新数据 */
function onVisibility() {
  if (!visible() || resuming) return
  resuming = true
  const due = [...tasks.values()].filter((t) => t.intervalMs > 0)
  let delay = 0
  for (const task of due) {
    window.setTimeout(() => {
      if (visible()) runTask(task)
    }, delay)
    delay += RESUME_STAGGER_MS
  }
  window.setTimeout(() => {
    resuming = false
  }, delay + 50)
}

/**
 * 注册一个周期性同步任务。
 * @returns 取消函数（组件卸载 / effect 重跑时调用）
 */
export function scheduleSync(key: string, intervalMs: number, run: () => void): () => void {
  const existing = tasks.get(key)
  if (existing) {
    existing.intervalMs = intervalMs
    existing.run = run
  } else {
    tasks.set(key, { key, intervalMs, run, nextDue: Date.now() + intervalMs })
  }
  ensureTicker()
  return () => {
    tasks.delete(key)
    if (tasks.size === 0 && ticker) {
      window.clearInterval(ticker)
      ticker = undefined
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }
}

/** 手动立刻跑某个任务（例如用户点了「刷新」或本地刚写完数据） */
export function runSyncNow(key: string): void {
  const task = tasks.get(key)
  if (task) runTask(task)
}

/** 当前参与轮询的任务数（供「同步调度」诊断面板展示） */
export function syncTaskKeys(): string[] {
  return [...tasks.keys()]
}

/* ------------------------------ 请求去重 ------------------------------ */

type CacheSlot<T> = { at: number; value?: T; promise?: Promise<T> }
const cache = new Map<string, CacheSlot<unknown>>()
/** 缓存条目上限，防止长时间挂着页面时缓存本身无限增长 */
const CACHE_MAX = 64

function evictIfNeeded() {
  if (cache.size <= CACHE_MAX) return
  const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0]
  if (oldest) cache.delete(oldest[0])
}

/**
 * 相同 key 的请求在 ttlMs 内只真正发一次：
 * - 已有结果且未过期 → 直接复用
 * - 请求在飞 → 复用同一个 Promise（并发动作不重复打网络）
 * 失败不写缓存，下次调用会真的重发。
 */
export function deduped<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const slot = cache.get(key) as CacheSlot<T> | undefined
  if (slot) {
    if (slot.value !== undefined && now - slot.at < ttlMs) return Promise.resolve(slot.value)
    if (slot.promise) return slot.promise
  }

  const promise = fetcher().then(
    (value) => {
      cache.set(key, { at: Date.now(), value })
      evictIfNeeded()
      return value
    },
    (error) => {
      cache.delete(key)
      throw error
    }
  )
  cache.set(key, { at: now, promise })
  return promise
}

/** 本地写完数据后让相关缓存立刻失效（按前缀匹配） */
export function invalidateDedupe(prefix: string): void {
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) cache.delete(key)
  }
}

/** 退出登录时清空全部缓存，避免上一位用户的私密数据被复用 */
export function clearDedupeCache(): void {
  cache.clear()
}
