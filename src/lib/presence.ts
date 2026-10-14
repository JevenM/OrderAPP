import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { deduped, scheduleSync } from './net'

/**
 * 好友在线状态检测（轻量，纯 REST 轮询，不依赖 wss / Presence）
 *
 * 原理：members.last_active_at 记录每个成员最近一次活跃时间（App 内动作 / 切页会刷新该字段）；
 * 判断「最近 5 分钟内有活动 → 在线」。
 * 客户端 30s 拉一次该字段（走统一调度器：后台不跑、回前台补拉；并与其他订阅者共享同一次请求）。
 *
 * 用于：互动游戏里「对方在线 → 只弹窗提示、离线 → 写铃铛」的分支。
 */

const ACTIVITY_TTL = 5 * 60_000 // 5 分钟内有活动视为在线
const POLL_MS = 30_000

type Listener = (peerOnline: boolean) => void

const lastActive = new Map<string, number>()
const activeSubs = new Map<string, Set<Listener>>()

function isPeerOnlineNow(peerId: string | null | undefined): boolean {
  if (!peerId) return false
  const ts = lastActive.get(peerId) ?? 0
  return ts > 0 && Date.now() - ts < ACTIVITY_TTL
}

function notifyAll() {
  activeSubs.forEach((set, peerId) => {
    const online = isPeerOnlineNow(peerId)
    set.forEach((l) => l(online))
  })
}

async function pull() {
  try {
    // 只取两个字段、且同一时刻多处订阅只发一次请求
    const rows = await deduped('presence:active', POLL_MS - 5_000, async () => {
      const { data } = await supabase.from('members').select('id, last_active_at')
      return (data ?? []) as { id: string; last_active_at: string | null }[]
    })
    lastActive.clear()
    for (const row of rows) {
      lastActive.set(row.id, row.last_active_at ? new Date(row.last_active_at).getTime() : 0)
    }
    notifyAll()
  } catch {
    // 网络不通 / 表无该列，保持旧值
  }
}

let cancelPolling: (() => void) | undefined

function ensurePolling() {
  if (cancelPolling) return
  cancelPolling = scheduleSync('presence', POLL_MS, () => void pull())
  void pull()
}

function stopPollingIfIdle() {
  if (activeSubs.size > 0 || !cancelPolling) return
  cancelPolling()
  cancelPolling = undefined
}

/** 标记当前成员活跃：本地立即生效 + 节流写库（每 30s 一次） */
const lastFlush = new Map<string, number>()
export function markActive(memberId: string | null | undefined): void {
  if (!memberId) return
  lastActive.set(memberId, Date.now())
  const last = lastFlush.get(memberId) ?? 0
  if (Date.now() - last < POLL_MS) return
  lastFlush.set(memberId, Date.now())
  void supabase
    .from('members')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', memberId)
    .then(() => {})
}

/**
 * 订阅「某成员是否在线」，返回当前状态。
 * 组件卸载时自动退订。
 */
export function useIsPeerOnline(peerId: string | null | undefined, myId?: string | null): boolean {
  const [online, setOnline] = useState(() => isPeerOnlineNow(peerId))

  useEffect(() => {
    if (!peerId) {
      setOnline(false)
      return
    }
    if (myId) markActive(myId) // 顺手把自己的活跃时间刷一下
    let set: Set<Listener> | undefined = activeSubs.get(peerId)
    if (!set) {
      set = new Set()
      activeSubs.set(peerId, set)
      ensurePolling()
    }
    const listener: Listener = (o) => setOnline(o)
    set.add(listener)
    setOnline(isPeerOnlineNow(peerId))
    return () => {
      set!.delete(listener)
      if (set!.size === 0) activeSubs.delete(peerId)
      stopPollingIfIdle()
    }
  }, [peerId, myId])

  return online
}
