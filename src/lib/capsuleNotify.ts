import { capsuleUnlocked, type TimeCapsule } from './keepsake'
import { browserNotify } from './notify'

const NOTIFY_PREFIX = 'capsule-opened-notified-'
const WEEK = 7 * 24 * 60 * 60 * 1000

/**
 * 检查「最近一周内已到开封日」的信，弹一次浏览器通知。
 * 每封信用 localStorage 标记，避免每次进页面重复打扰；纯前端实现，无需后台定时任务。
 * 返回本次新提醒的封数，方便调用方决定是否要为「已开封」做别的处理。
 */
export function notifyOpenedCapsules(capsules: TimeCapsule[], now = Date.now()): number {
  const fresh = capsules.filter((c) => {
    if (!capsuleUnlocked(c.openAt, now)) return false
    const at = new Date(`${c.openAt}T00:00:00`).getTime()
    if (now - at > WEEK) return false
    try {
      return !localStorage.getItem(NOTIFY_PREFIX + c.id)
    } catch {
      return false
    }
  })
  if (!fresh.length) return 0
  for (const c of fresh) {
    try { localStorage.setItem(NOTIFY_PREFIX + c.id, '1') } catch { /* 隐私模式下忽略 */ }
  }
  browserNotify(
    '💌 有一封时光胶囊开封了',
    fresh.length === 1 ? fresh[0].title : `有 ${fresh.length} 封信到约定之日了，去看看吧`
  )
  return fresh.length
}
