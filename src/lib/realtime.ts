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

/** 连续失败几次后认定实时通道不可用 */
const MAX_ATTEMPTS = 2
/** 判定不可用后，隔多久再尝试一次 */
const RETRY_MS = 120_000

let broken = false
let brokenAt = 0

/** 实时通道当前是否处于「已知不可用」状态 */
export function isRealtimeBroken(): boolean {
  return broken && Date.now() - brokenAt < RETRY_MS
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
    let retryTimer: number | undefined

    const stopPolling = () => {
      if (pollTimer) {
        window.clearInterval(pollTimer)
        pollTimer = undefined
      }
      if (retryTimer) {
        window.clearTimeout(retryTimer)
        retryTimer = undefined
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
      // 过一段时间允许再试一次实时连接
      retryTimer = window.setTimeout(() => {
        stopPolling()
        broken = false
        brokenAt = 0
        subscribe()
      }, RETRY_MS)
    }

    if (isRealtimeBroken()) startPolling()
    else subscribe()

    return () => {
      stopPolling()
      const c = channel
      channel = null
      if (c) void supabase.removeChannel(c)
    }
  }, [channelName, enabled, pollMs])
}
