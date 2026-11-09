/**
 * 轻量音效：不引任何音频文件，直接用 WebAudio 合成短音。
 * AudioContext 需要用户手势之后才允许出声，这两个游戏的音效都在
 * 点击 / 滑动回调里触发，天然满足这个条件。
 *
 * 开关状态存 localStorage（`couple-sfx`），两个游戏共用同一个开关。
 */

const KEY = 'couple-sfx-enabled'

let ctx: AudioContext | null = null
let enabled = readEnabled()
const listeners = new Set<() => void>()

function readEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0'
  } catch {
    return true
  }
}

export function sfxEnabled(): boolean {
  return enabled
}

export function setSfxEnabled(value: boolean): void {
  enabled = value
  try {
    localStorage.setItem(KEY, value ? '1' : '0')
  } catch {
    // 隐私模式写不进去就算了，本次会话内开关仍然生效
  }
  listeners.forEach((l) => l())
}

/** 组件订阅开关变化（切开关后按钮图标要跟着变） */
export function subscribeSfx(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function audio(): AudioContext | null {
  if (!enabled) return null
  try {
    if (!ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return null
      ctx = new Ctx()
    }
    // 手机上切后台再回来会挂起，出声前拉一下
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** 单音：freq 起始频率，dur 时长（秒）；glide 是结束频率（滑音），delay 用于排琶音 */
function tone(freq: number, dur: number, opts?: { type?: OscillatorType; vol?: number; glide?: number; delay?: number }) {
  const ac = audio()
  if (!ac) return
  try {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    const t0 = ac.currentTime + (opts?.delay ?? 0)
    osc.type = opts?.type ?? 'sine'
    osc.frequency.setValueAtTime(freq, t0)
    if (opts?.glide) osc.frequency.exponentialRampToValueAtTime(opts.glide, t0 + dur)
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(opts?.vol ?? 0.12, t0 + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(gain).connect(ac.destination)
    osc.start(t0)
    osc.stop(t0 + dur + 0.05)
  } catch {
    // 音效失败不该影响游戏，忽略
  }
}

export const sfx = {
  /** 2048 滑动一步 */
  move: () => tone(300, 0.08, { type: 'triangle', vol: 0.07 }),
  /** 猫猫落子 */
  place: () => tone(520, 0.09, { type: 'triangle', vol: 0.1 }),
  /** 2048 合并成功：音高随方块数值升高，越合越亮 */
  merge: (level = 1) => {
    const base = 440 * Math.pow(1.12, Math.min(level, 10))
    tone(base, 0.12, { type: 'sine', vol: 0.14 })
    tone(base * 1.5, 0.16, { type: 'sine', vol: 0.1, delay: 0.06 })
  },
  /** 猫猫三连合成：叮-咚-叮上行琶音 */
  match: () => {
    tone(660, 0.1, { type: 'sine', vol: 0.14 })
    tone(880, 0.12, { type: 'sine', vol: 0.12, delay: 0.07 })
    tone(1320, 0.18, { type: 'sine', vol: 0.1, delay: 0.14 })
  },
  /** 提示 */
  hint: () => tone(980, 0.1, { type: 'sine', vol: 0.08 }),
  /** 通关 / 合成 2048 */
  win: () => {
    ;[523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, { type: 'sine', vol: 0.13, delay: i * 0.12 }))
  },
  /** 游戏结束 */
  lose: () => {
    tone(330, 0.25, { type: 'sawtooth', vol: 0.07, glide: 160 })
    tone(200, 0.4, { type: 'sawtooth', vol: 0.06, delay: 0.18, glide: 110 })
  },
}
