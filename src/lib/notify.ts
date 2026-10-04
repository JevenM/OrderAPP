import { supabase } from './supabase'

/** 发邮件给“我”（走 Supabase Edge Function + Resend；没配置时静默跳过） */
export async function pushEmail(subject: string, html: string): Promise<void> {
  try {
    await supabase.functions.invoke('notify-email', { body: { subject, html } })
  } catch {
    // 推送失败不影响主流程
  }
}

/** 后台页面弹浏览器/手机通知 */
export function browserNotify(title: string, body: string): void {
  try {
    if (typeof Notification === 'undefined') return
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: './icon.svg' })
    }
  } catch {
    // ignore
  }
}

export async function requestNotifyPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission
  return await Notification.requestPermission()
}

/** 提示音（下单/提交时后台“叮”一下） */
export function ding(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.05)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.55)
  } catch {
    // ignore
  }
}
