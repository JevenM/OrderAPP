import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useSession } from '../store/session'
import { reportActivity, setActivityActor } from '../lib/activity'

/**
 * 全局行为打点（挂在已登录的 Shell 内）：
 * - 每次带登录态进入应用记 1 次登录（同一次页面会话只记一次）
 * - 页面/模块打开记 1 次使用（互动模块另由 CouplePage 打点，带具体模块 key）
 * - 页面可见状态下每 60 秒记 1 分钟在线时长，切后台不计时
 */
export default function ActivityTracker() {
  const { entered, isAdmin, memberId, memberName } = useSession()
  const location = useLocation()
  const loginRef = useRef<string | null>(null)

  const actorId = isAdmin ? 'admin' : (memberId ?? '')
  const actorName = isAdmin ? '管理端（我）' : (memberName || '她')

  useEffect(() => {
    if (!entered || !actorId) return
    setActivityActor(actorId, actorName)
    if (loginRef.current !== actorId) {
      loginRef.current = actorId
      reportActivity({ login: true })
    }
  }, [entered, actorId, actorName])

  useEffect(() => {
    if (!entered || !actorId) return
    reportActivity({ module: `path:${location.pathname}${location.search}` })
  }, [location.pathname, location.search, entered, actorId])

  useEffect(() => {
    if (!entered || !actorId) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') reportActivity({ durationSec: 60 })
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [entered, actorId])

  return null
}
