import { useEffect, useRef } from 'react'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type ChangeEvent = '*' | 'INSERT' | 'UPDATE' | 'DELETE'
export type ChangePayload = RealtimePostgresChangesPayload<{ [key: string]: any }>

export interface Watch {
  table: string
  event?: ChangeEvent
  on: (payload: ChangePayload) => void
}

interface Options {
  enabled?: boolean
  /** 实时连不上时的轮询间隔（毫秒） */
  pollMs?: number
  /** 轮询时执行的操作，一般是重新拉列表 */
  onPoll?: () => void
}

/** 连续失败1次即认定实时通道不可用（拦截式网络下立刻降级，避免一直重试刷屏拖垮页面） */
const MAX_ATTEMPTS = 1
/** 判定不可用后，由模块级定时器定期重新探测，不再每个页面各自重试 */
const RETRY_MS = 300_000
/** 探测超时：4 秒还没拿到 SUBSCRIBED 就视为不可用 */
const PROBE_TIMEOUT_MS = 4_000

let broken = false
let brokenAt = 0
let probedAt = 0
let probeTimer: number | undefined

/** 实时通道当前是否处于「已知不可用」状态 */
export function isRealtimeBroken(): boolean {
  return broken && Date.now() - brokenAt < RETRY_MS
}

/**
 * 启动时探测一次实时通道：网络拦截/项目暂停导致 wss 长连接不通时，
 * 全局标记为不可用，所有 useRealtime 直接走轮询，零噪音。
 * 探测成功后网络若中途切换（关闭代理等），仍由 useRealtime 失败回调兜底标记。
 */
export async function probeRealtime(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  // 1 分钟内不复测，避免频繁触发 socket
  if (probedAt && Date.now() - probedAt < 60_000) return !broken
  probedAt = Date.now()
  return await new Promise<boolean>((resolve) => {
    const ch = supabase.channel('__probe_realtime__')
    let done = false
    const finish = (ok: boolean) => {
      if (done) return
      done = true
      window.clearTimeout(timer)
      void supabase.removeChannel(ch)
      broken = !ok
      brokenAt = ok ? 0 : Date.now()
      resolve(ok)
    }
    const timer = window.setTimeout(() => finish(false), PROBE_TIMEOUT_MS)
    ch.subscribe((status) => {
      const s = String(status)
      if (s === 'SUBSCRIBED') finish(true)
      else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') finish(false)
    })
  })
}

// 模块级定时器：定期重新探测，让网络恢复（关掉代理等）后能自动重新启用实时推送
if (typeof window !== 'undefined' && !probeTimer) {
  probeTimer = window.setInterval(() => {
    if (broken) void probeRealtime()
  }, RETRY_MS)
}

/**
 * 订阅表变更；若 WebSocket 连不上（网络限制 / 项目没开 realtime），
 * 自动降级为轮询，避免一直重试刷屏。
 */
export function useRealtime(channelName: string, watches: Watch[], options: Options = {}): void {
  const { enabled = true, pollMs = 10_000, onPoll } = options

  const watchesRef = useRef(watches)
  watchesRef.current = watches
  const pollRef = useRef(onPoll)
  pollRef.current = onPoll

  useEffect(() => {
    if (!enabled) return

    let attempts = 0
    let channel: RealtimeChannel | null = null
    let pollTimer: number | undefined

    const stopPolling = () => {
      if (pollTimer) {
        window.clearInterval(pollTimer)
        pollTimer = undefined
      }
    }

    const subscribe = () => {
      if (channel) return
      const ch = supabase.channel(channelName)
      for (const w of watchesRef.current) {
        ch.on('postgres_changes', { event: w.event ?? '*', schema: 'public', table: w.table }, (p) =>
          w.on(p as ChangePayload)
        )
      }
      channel = ch
      ch.subscribe((status) => {
        const s = String(status)
        if (s === 'SUBSCRIBED') {
          attempts = 0
          broken = false
          brokenAt = 0
          stopPolling()
          return
        }
        if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
          attempts += 1
          if (attempts >= MAX_ATTEMPTS) {
            broken = true
            brokenAt = Date.now()
            const c = channel
            channel = null
            if (c) void supabase.removeChannel(c)
            startPolling()
          }
        }
      })
    }

    const startPolling = () => {
      if (pollTimer) return
      pollTimer = window.setInterval(() => {
        if (document.visibilityState === 'visible') pollRef.current?.()
      }, pollMs)
    }

    if (isRealtimeBroken()) startPolling()
    else subscribe()

    // 页面从后台切换回前台时，主动触发一次轮询/刷新，避免从桌面切回来时数据还是旧的
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        pollRef.current?.()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', onVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', onVisibilityChange)
      stopPolling()
      const c = channel
      channel = null
      if (c) void supabase.removeChannel(c)
    }
  }, [channelName, enabled, pollMs])
}
