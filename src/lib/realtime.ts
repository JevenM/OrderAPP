import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { supabase, realtimeUrl, anonKey } from './supabase'
import { scheduleSync } from './net'

export type ChangeEvent = '*' | 'INSERT' | 'UPDATE' | 'DELETE'
export type ChangePayload = RealtimePostgresChangesPayload<{ [key: string]: any }>

export interface Watch {
  table: string
  event?: ChangeEvent
  on: (payload: ChangePayload) => void
}

interface Options {
  enabled?: boolean
  /**
   * 实时连不上时的轮询间隔（毫秒）。
   * 不传则用 POLL.warm（30 秒）：绝大多数数据 30 秒到位完全够，
   * 只有「对局进行中」这类需要即时反馈的场景才显式传 POLL.hot。
   */
  pollMs?: number
  /** 轮询时执行的操作，一般是重新拉列表 */
  onPoll?: () => void
}

/** 轮询频率档位：把「多久能看到对方的动作」这件事收敛成三个明确的选择 */
export const POLL = {
  /** 对局进行中，双方要即时看到彼此动作 */
  hot: 10_000,
  /** 常规业务数据（列表、消息角标） */
  warm: 30_000,
  /** 几乎不变的配置（成员、设置、模块开关）：靠实时推送，轮询只是兜底 */
  cool: 120_000,
} as const

/** 被拦截后多久复测一次（让网络恢复后能自动切回实时通道） */
const RETRY_MS = 300_000
/** 探测超时：3.5 秒内没连上就视为不可用 */
const PROBE_TIMEOUT_MS = 3_500

/**
 * 实时通道探测状态：
 * - 'pending'：应用刚启动，正在用原始 WebSocket 测一次（不牵动 supabase-js 的 socket 重连）
 * - 'ok'：wss 可达，useRealtime 才允许打开 supabase-js 的 channel
 * - 'broken'：被网络拦截 / 项目暂停，useRealtime 一律走轮询、绝不打开 socket
 */
type ProbeState = 'pending' | 'ok' | 'broken'
let probeState: ProbeState = 'pending'
let brokenAt = 0
const listeners = new Set<() => void>()

function setProbeState(s: ProbeState) {
  probeState = s
  if (s === 'broken') brokenAt = Date.now()
  listeners.forEach((l) => l())
}

export function getProbeState(): ProbeState {
  return probeState
}

function onProbeState(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** 实时通道当前是否处于「已知不可用」状态 */
export function isRealtimeBroken(): boolean {
  return probeState === 'broken' && Date.now() - brokenAt < RETRY_MS
}

/**
 * 用【原始 WebSocket】测一次 wss：成功/失败都只产生至多 1 次浏览器报错，
 * 且完全不牵动 supabase-js 内部的 socket 重连逻辑——这是根治「控制台被刷屏 + 一直重连耗资源」的关键。
 */
async function probeRealtimeRaw(): Promise<boolean> {
  if (typeof window === 'undefined' || !realtimeUrl) return false
  return await new Promise<boolean>((resolve) => {
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      try {
        ws.close()
      } catch {
        // 忽略关闭异常
      }
      resolve(ok)
    }
    const ws = new WebSocket(`${realtimeUrl}?apikey=${encodeURIComponent(anonKey)}&vsn=2.0.0`)
    const timer = window.setTimeout(() => finish(false), PROBE_TIMEOUT_MS)
    ws.onopen = () => finish(true)
    ws.onerror = () => finish(false)
  })
}

async function runProbe() {
  const ok = await probeRealtimeRaw()
  setProbeState(ok ? 'ok' : 'broken')
}

// 应用启动即探测（模块加载时，早于 React 子组件 effect，确保首个 useRealtime 也走轮询分支，绝不提前打开 socket）
if (typeof window !== 'undefined' && probeState === 'pending') {
  void runProbe()
}
// 被拦截时定期复测：网络恢复（关掉代理等）后自动切回实时通道
if (typeof window !== 'undefined') {
  window.setInterval(() => {
    if (probeState === 'broken') void runProbe()
  }, RETRY_MS)
}

/**
 * 订阅表变更；若 WebSocket 连不上（网络限制 / 项目没开 realtime），
 * 自动降级为轮询，避免一直重试刷屏。
 * 关键：探测未通过（pending / broken）时一律只轮询，绝不打开 supabase-js 的 socket。
 */
export function useRealtime(channelName: string, watches: Watch[], options: Options = {}): void {
  const { enabled = true, pollMs = POLL.warm, onPoll } = options
  const state = useSyncExternalStore(onProbeState, getProbeState)

  const watchesRef = useRef(watches)
  watchesRef.current = watches
  const pollRef = useRef(onPoll)
  pollRef.current = onPoll

  useEffect(() => {
    if (!enabled) return

    let channel: RealtimeChannel | null = null
    let cancelSync: (() => void) | undefined

    const stopPolling = () => {
      if (cancelSync) {
        cancelSync()
        cancelSync = undefined
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
          setProbeState('ok')
          stopPolling()
          return
        }
        if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
          // 中途掉线：标记不可用并降级为轮询，由模块级定时器定期复测
          setProbeState('broken')
          const c = channel
          channel = null
          if (c) void supabase.removeChannel(c)
          startPolling()
        }
      })
    }

    // 轮询交给全站统一的调度器：后台标签页不跑、回到前台自动错峰补拉，
    // 也避免了「每个订阅各开一个 setInterval」带来的请求堆积
    const startPolling = () => {
      if (cancelSync) return
      cancelSync = scheduleSync(channelName, pollMs, () => pollRef.current?.())
    }

    // 探测未通过（pending 或 broken）一律先轮询：绝不主动打开 supabase-js 的 socket
    if (state === 'ok') subscribe()
    else startPolling()

    return () => {
      stopPolling()
      const c = channel
      channel = null
      if (c) void supabase.removeChannel(c)
    }
  }, [channelName, enabled, pollMs, state])
}
