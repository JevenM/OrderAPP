import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 回声洞窟：全黑暗洞穴探路游戏，纯单机。
 *
 * 核心机制（离屏掩膜 → 按像素到声源的距离决定点亮延迟 → ImageData 累加渲染）：
 * - 屏幕默认纯黑。点击 / 轻触在落点炸开一圈声波，波前以 520px/s 向外扩散；
 *   只有波前真正抵达的洞壁边界单元才会亮起（远处墙壁天然延迟更久才成像，
 *   模拟声波往返的真实时差），亮度按 2.2s 生命周期自然衰减。
 * - 渲染：离屏 canvas 画掩膜并采样成 4px 网格；提取 8 邻域含空的岩石单元作边界；
 *   逐帧对每个边界单元计算「贴身感知 + 各声波的 波前亮带 × 距离能量 × 生命周期衰减」，
 *   累进 240×160 浮点缓冲，3×3 柔性溅射描边带柔光，Uint32 直写 ImageData
 *   后放大绘制（globalCompositeOperation='lighter' + 双线性插值得到柔光）。
 *
 * 信息稀缺带来的张力：发声有代价——560px 内的影警觉、朝声源调查；贴近 210px 转追击。
 * 补偿线索：贴身 128px 墙壁微亮、影隔 1~2s 冒窸窣微光、影被回声扫到显形、
 * 靠近时屏幕暗红警戒 + 低频轰鸣。三条命，被扑掉一条回出生点。
 *
 * 回音球：每层 2 枚，按住蓄力松手甩出——带重力抛物线飞行、撞壁按恢复系数 0.62 反弹、
 * 速度指数衰减，最终在低洼处滚动停下。物理事件自己成为声学事件：撞墙就是一次微型 ping
 * （照明半径 = 140 + 0.8×撞击速度，上限 340），沿飞行路径每 40px 打一个声记点拖出暖色亮带。
 * 球的可视范围刻意小于玩家 ping，引怪半径却更大（×1.6）——球是更好的诱饵，玩家是更好的探照灯。
 *
 * 三层固定布局（背图循环）：浅层洞穴 → 回声回廊 → 深渊核心。
 * 拾尽青色光点即深入下一层；结算给用时与发声次数，最佳纪录存 localStorage。
 * 音效全部 WebAudio 现场合成（含 51Hz 低频轰鸣），界面带静音开关；触屏自动出现方向键。
 */

/* ------------------------------ 世界常量 ------------------------------ */

const W = 960
const H = 640
const CELL = 4 // 掩膜网格单元（px）→ 网格 240×160
const GW = W / CELL
const GH = H / CELL
const SPEED = 520 // 声波扩散 px/s
const LIFE = 2.2 // 回声在墙上停留秒数
const BANDT = 0.2 // 波前亮带宽度（秒）
const MAXP = 24 // 同时存在的声波上限（球沿路打声记点，消耗快）
const WALL_R = 128 // 贴身感知半径
const BORDER = 26 // 洞壁外框厚度
const PING_ALERT_R = 560 // 影被声波惊动的半径
const CHASE_R = 210 // 影贴到这个距离转追击
const PLAYER_SPEED = 172
/* --- 回音球物理：重力抛物线 + 恢复系数反弹 + 指数衰减，撞壁本身就是声学事件 --- */
const BALL_GRAV = 300 // 重力加速度 px/s²（球抛出后沿抛物线坠落，最终滚向洞窟低处停住）
const BALL_REST = 0.62 // 撞壁恢复系数 e
const BALL_REST_MIN = 60 // 撞击速度低于此值不再反弹（直接贴壁滚动，避免抖动）
const BALL_DRAG = 0.8 // 空气阻力（速度指数衰减系数 /s）
const BALL_STOP_SPEED = 16 // 低于该速度视为滚动停下
const BALL_LANTERN_R = 180 // 停下的球作为常亮灯笼的照明半径（暖光）
const THROW_MIN = 240 // 最小蓄力初速
const THROW_MAX = 560 // 满蓄力初速（用力甩球照得更远）
const THROW_CHARGE_MS = 1100 // 蓄力到满所需时间
const TRAIL_GAP = 40 // 声记点间距 px
const TRAIL_MIN_SPEED = 70 // 低于该速度不再打声记（滚动时安静）
const TRAIL_R = 150 // 声记点照明半径
const BALLS_PER_LEVEL = 2
const DANGER_R = 250 // 暗红警戒触发半径

interface CircleRock {
  t: 'c'
  x: number
  y: number
  r: number
}
interface RectRock {
  t: 'r'
  x: number
  y: number
  w: number
  h: number
}
type Rock = CircleRock | RectRock

interface LevelDef {
  key: string
  name: string
  desc: string
  start: [number, number]
  rocks: Rock[]
  orbs: Array<[number, number]>
  shadows: Array<[number, number]>
}

/* ------------------------------ 三层固定布局 ------------------------------ */

const LEVELS: LevelDef[] = [
  {
    key: 'shallow',
    name: '浅层洞穴',
    desc: '六块散落岩石，空间开阔 · 1 只影',
    start: [78, 560],
    rocks: [
      { t: 'c', x: 330, y: 190, r: 58 },
      { t: 'c', x: 620, y: 300, r: 66 },
      { t: 'r', x: 140, y: 330, w: 150, h: 70 },
      { t: 'c', x: 810, y: 170, r: 48 },
      { t: 'r', x: 400, y: 470, w: 200, h: 56 },
      { t: 'c', x: 760, y: 500, r: 52 },
    ],
    orbs: [
      [250, 120],
      [700, 120],
      [480, 340],
      [860, 560],
    ],
    shadows: [[520, 580]],
  },
  {
    key: 'gallery',
    name: '回声回廊',
    desc: '长墙与圆岩交错，逼你贴边走 · 2 只影',
    start: [78, 560],
    rocks: [
      { t: 'r', x: 150, y: 140, w: 90, h: 330 },
      { t: 'c', x: 430, y: 170, r: 62 },
      { t: 'r', x: 380, y: 300, w: 320, h: 60 },
      { t: 'c', x: 820, y: 250, r: 70 },
      { t: 'c', x: 300, y: 520, r: 58 },
      { t: 'r', x: 620, y: 470, w: 230, h: 70 },
      { t: 'c', x: 170, y: 570, r: 46 },
    ],
    orbs: [
      [110, 90],
      [350, 240],
      [600, 200],
      [890, 430],
      [480, 580],
    ],
    shadows: [
      [700, 130],
      [250, 590],
    ],
  },
  {
    key: 'abyss',
    name: '深渊核心',
    desc: '双柱十字纵深，安全区狭小 · 3 只影',
    start: [78, 80],
    rocks: [
      { t: 'c', x: 300, y: 200, r: 70 },
      { t: 'c', x: 620, y: 200, r: 70 },
      { t: 'r', x: 420, y: 120, w: 60, h: 260 },
      { t: 'r', x: 120, y: 380, w: 300, h: 60 },
      { t: 'c', x: 560, y: 480, r: 76 },
      { t: 'r', x: 760, y: 100, w: 60, h: 300 },
      { t: 'c', x: 200, y: 560, r: 54 },
      { t: 'r', x: 700, y: 480, w: 200, h: 60 },
    ],
    orbs: [
      [150, 200],
      [510, 72],
      [850, 560],
      [350, 520],
      [160, 480],
    ],
    shadows: [
      [400, 590],
      [880, 300],
      [620, 585],
    ],
  },
]

/* ------------------------------ 共享画布（只建一次） ------------------------------ */

let shared: {
  maskCtx: CanvasRenderingContext2D
  echoCv: HTMLCanvasElement
  echoCtx: CanvasRenderingContext2D
  echoImg: ImageData
  echo32: Uint32Array
  acc: Float32Array
  /** 暖色能量缓冲（球撞击的暖色回声），与 acc 按比例混色 */
  warm: Float32Array
} | null = null

function getShared(): typeof shared {
  if (shared) return shared
  const mc = document.createElement('canvas')
  mc.width = W
  mc.height = H
  const maskCtx = mc.getContext('2d', { willReadFrequently: true })
  const echoCv = document.createElement('canvas')
  echoCv.width = GW
  echoCv.height = GH
  const echoCtx = echoCv.getContext('2d')
  if (!maskCtx || !echoCtx) return null
  const echoImg = echoCtx.createImageData(GW, GH)
  shared = {
    maskCtx,
    echoCv,
    echoCtx,
    echoImg,
    echo32: new Uint32Array(echoImg.data.buffer),
    acc: new Float32Array(GW * GH),
    warm: new Float32Array(GW * GH),
  }
  return shared
}

/* ------------------------------ 世界状态 ------------------------------ */

interface Pulse {
  x: number
  y: number
  t0: number
  power: number
  /** 照明半径上限：波前超过该距离不再点亮墙壁（玩家 ping 560 / 球撞击 140~340） */
  maxD: number
  /** 暖色占比 0~1：0=玩家 ping 的锐利青蓝，1=球撞击的柔和暖色 */
  warm: number
}

interface Shadow {
  x: number
  y: number
  r: number
  vx: number
  vy: number
  wx: number
  wy: number
  alert: number
  chase: boolean
  ax: number
  ay: number
  /** 窸窣微光强度（0~1，随时间衰减） */
  glow: number
  skitter: number
}

/** 回音球：蓄力甩出，带重力抛物线飞行、撞壁反弹（恢复系数 0.62）、速度指数衰减，
 *  撞壁本身就是一次微型 ping（半径随撞击速度），沿飞行路径每 40px 打一个声记点 */
interface EchoBall {
  x: number
  y: number
  vx: number
  vy: number
  bornAt: number
  /** 距上个声记点的累计飞行距离 */
  dist: number
}

interface World {
  state: 'play' | 'clear' | 'over'
  solid: Uint8Array
  edges: { xs: Float32Array; ys: Float32Array; idx: Int32Array; n: number }
  pulses: Pulse[]
  balls: EchoBall[]
  ballsLeft: number
  orbs: Array<{ x: number; y: number; taken: boolean; ph: number }>
  shadows: Shadow[]
  player: { x: number; y: number; vx: number; vy: number; r: number; inv: number }
  hearts: number
  pingsUsed: number
  runTime: number
  danger: number
}

function blocked(solid: Uint8Array, x: number, y: number, r: number): boolean {
  const pts: Array<[number, number]> = [
    [x - r, y],
    [x + r, y],
    [x, y - r],
    [x, y + r],
  ]
  for (const [px, py] of pts) {
    if (px < 0 || py < 0 || px >= W || py >= H) return true
    const gx = (px / CELL) | 0
    const gy = (py / CELL) | 0
    if (solid[gy * GW + gx]) return true
  }
  return false
}

/** 关卡构建：画掩膜 → 采样网格 → 提取边界单元（8 邻域含空的岩石单元） */
function buildWorld(level: LevelDef): World {
  const s = getShared()
  let solid = new Uint8Array(GW * GH)
  let edges = { xs: new Float32Array(0), ys: new Float32Array(0), idx: new Int32Array(0), n: 0 }
  if (s) {
    const { maskCtx } = s
    maskCtx.fillStyle = '#000'
    maskCtx.fillRect(0, 0, W, H)
    maskCtx.fillStyle = '#fff'
    maskCtx.fillRect(0, 0, W, BORDER)
    maskCtx.fillRect(0, H - BORDER, W, BORDER)
    maskCtx.fillRect(0, 0, BORDER, H)
    maskCtx.fillRect(W - BORDER, 0, BORDER, H)
    for (const r of level.rocks) {
      maskCtx.beginPath()
      if (r.t === 'c') maskCtx.arc(r.x, r.y, r.r, 0, Math.PI * 2)
      else maskCtx.rect(r.x, r.y, r.w, r.h)
      maskCtx.fill()
    }
    const data = maskCtx.getImageData(0, 0, W, H).data
    for (let gy = 0; gy < GH; gy++) {
      for (let gx = 0; gx < GW; gx++) {
        const sy = gy * CELL + (CELL >> 1)
        const sx = gx * CELL + (CELL >> 1)
        solid[gy * GW + gx] = data[(sy * W + sx) * 4] > 128 ? 1 : 0
      }
    }
    // 提取边界——跳过最外一圈，保证 8 邻域索引安全
    const ex: number[] = []
    const ey: number[] = []
    const ei: number[] = []
    for (let gy = 1; gy < GH - 1; gy++) {
      for (let gx = 1; gx < GW - 1; gx++) {
        const k = gy * GW + gx
        if (!solid[k]) continue
        if (
          !solid[k - 1] ||
          !solid[k + 1] ||
          !solid[k - GW] ||
          !solid[k + GW] ||
          !solid[k - GW - 1] ||
          !solid[k - GW + 1] ||
          !solid[k + GW - 1] ||
          !solid[k + GW + 1]
        ) {
          ex.push(gx * CELL + CELL / 2)
          ey.push(gy * CELL + CELL / 2)
          ei.push(k)
        }
      }
    }
    edges = { xs: new Float32Array(ex), ys: new Float32Array(ey), idx: new Int32Array(ei), n: ei.length }
  }
  return {
    state: 'play',
    solid,
    edges,
    pulses: [],
    balls: [],
    ballsLeft: BALLS_PER_LEVEL,
    orbs: level.orbs.map(([x, y]) => ({ x, y, taken: false, ph: Math.random() * 6.28 })),
    shadows: level.shadows.map(([x, y]) => ({
      x,
      y,
      r: 16,
      vx: 0,
      vy: 0,
      wx: 0,
      wy: 0,
      alert: 0,
      chase: false,
      ax: x,
      ay: y,
      glow: 0,
      skitter: 0.5 + Math.random(),
    })),
    player: { x: level.start[0], y: level.start[1], vx: 0, vy: 0, r: 11, inv: 0 },
    hearts: 3,
    pingsUsed: 0,
    runTime: 0,
    danger: 0,
  }
}

/* ------------------------------ 最佳纪录 ------------------------------ */

interface BestRec {
  timeSec: number
  pings: number
}

const BEST_KEY = 'couple-echocavern-best'

function loadBests(): Record<string, BestRec> {
  try {
    const raw = JSON.parse(localStorage.getItem(BEST_KEY) ?? '') as Record<string, BestRec> | null
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

const fmtClock = (sec: number): string => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

/* ------------------------------ 组件 ------------------------------ */

export default function EchoCavern() {
  const [phase, setPhase] = useState<'intro' | 'playing'>('intro')
  const [levelIdx, setLevelIdx] = useState(0)
  /** 每次开局 +1：同关卡重开时强制重启主循环 effect（否则闭包还拿着旧世界） */
  const [session, setSession] = useState(0)
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem('couple-echocavern-muted') === '1'
    } catch {
      return false
    }
  })
  const [hud, setHud] = useState({ hearts: 3, orbs: 0, total: 0, timeSec: 0, pings: 0, balls: BALLS_PER_LEVEL })
  const [bests, setBests] = useState(() => loadBests())
  const [result, setResult] = useState<{
    kind: 'clear' | 'over'
    timeSec: number
    pings: number
    newBest: boolean
    isLast: boolean
  } | null>(null)
  const [isTouch] = useState(() => typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0))
  /** 横屏全屏模式（进入对局后可一键开启，手机上同时锁定横屏） */
  const [fullscreen, setFullscreen] = useState(false)
  /** 全屏后提示手机打开自动旋转 / 横过来玩（几秒后自动消失） */
  const [fsHint, setFsHint] = useState(false)

  const worldRef = useRef<World | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const keysRef = useRef(new Set<string>())
  /** 虚拟摇杆模拟量：[-1,1]，支持斜向与半速 */
  const joyRef = useRef({ x: 0, y: 0, active: false })
  const joyBaseRef = useRef<HTMLDivElement>(null)
  const joyThumbRef = useRef<HTMLDivElement>(null)
  /** 回音球蓄力起始时间（按住 E / 按钮期间非空，松手时按持有时长换算力度） */
  const chargeAtRef = useRef<number | null>(null)
  /** 蓄力进度镜像（0~1），供按钮指示条直接操作 DOM */
  const chargeRef = useRef(0)
  const ballBarRef = useRef<HTMLDivElement>(null)
  /** 触屏投掷盘的环形力度反馈（conic-gradient 由主循环驱动） */
  const ballRingRef = useRef<HTMLDivElement>(null)
  /** 竖屏下方「扔球」按钮的蓄力条 */
  const ballBar2Ref = useRef<HTMLDivElement>(null)
  const facingRef = useRef({ x: 0, y: -1 })
  const audioRef = useRef<AudioContext | null>(null)
  const droneGainRef = useRef<GainNode | null>(null)
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  const hudRef = useRef(hud)
  hudRef.current = hud
  /** 主循环闭包里读 bests 用镜像：避免过关后 state 未触发 effect 重启导致拿到旧值 */
  const bestsRef = useRef(bests)
  bestsRef.current = bests

  /* ------------------------------ 音效（WebAudio 现场合成） ------------------------------ */

  /** 首次交互时创建 AudioContext + 常驻低频轰鸣（danger 驱动音量） */
  const ensureAudio = useCallback((): AudioContext | null => {
    if (audioRef.current) {
      if (audioRef.current.state === 'suspended') void audioRef.current.resume()
      return audioRef.current
    }
    try {
      const c = new AudioContext()
      const o = c.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = 51
      const f = c.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = 190
      const g = c.createGain()
      g.gain.value = 0
      o.connect(f)
      f.connect(g)
      g.connect(c.destination)
      o.start()
      audioRef.current = c
      droneGainRef.current = g
      return c
    } catch {
      return null
    }
  }, [])

  /** 声波：1150Hz 滑到 240Hz 的短促音 */
  const playPing = useCallback((vol = 0.1, dur = 0.45) => {
    const c = audioRef.current
    if (!c || mutedRef.current) return
    const t = c.currentTime
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(1150, t)
    o.frequency.exponentialRampToValueAtTime(240, t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05)
    o.connect(g)
    g.connect(c.destination)
    o.start(t)
    o.stop(t + dur + 0.1)
  }, [])

  /** 短音（拾取 / 过关 / 回音球撞墙） */
  const playTone = useCallback((freq: number, dur: number, vol: number) => {
    const c = audioRef.current
    if (!c || mutedRef.current) return
    const t = c.currentTime
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = 'triangle'
    o.frequency.setValueAtTime(freq, t)
    o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g)
    g.connect(c.destination)
    o.start(t)
    o.stop(t + dur + 0.05)
  }, [])

  /** 被扑住：低通噪声 */
  const playHit = useCallback(() => {
    const c = audioRef.current
    if (!c || mutedRef.current) return
    const t = c.currentTime
    const len = Math.floor(c.sampleRate * 0.6)
    const buf = c.createBuffer(1, len, c.sampleRate)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len)
    const src = c.createBufferSource()
    src.buffer = buf
    const f = c.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 400
    const g = c.createGain()
    g.gain.setValueAtTime(0.5, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6)
    src.connect(f)
    f.connect(g)
    g.connect(c.destination)
    src.start(t)
  }, [])

  /* ------------------------------ 发声 / 回音球 ------------------------------ */

  /**
   * 发出声波。maxD 决定照明半径（波前超过即不再点亮），warm>0 渲染为球撞击的柔和暖色，
   * alertR 为引怪半径（球撞击刻意更大 = 更好的诱饵）。回音球的声波不计入「我的发声」。
   */
  const doEmit = useCallback((x: number, y: number, power: number, maxD: number, warm = 0, alertR = PING_ALERT_R, fromBall = false) => {
    const w = worldRef.current
    if (!w || w.state !== 'play') return
    x = Math.max(4, Math.min(W - 4, x))
    y = Math.max(4, Math.min(H - 4, y))
    w.pulses.push({ x, y, t0: performance.now() / 1000, power, maxD, warm })
    if (w.pulses.length > MAXP) w.pulses.shift()
    if (!fromBall) w.pingsUsed += 1
    for (const s of w.shadows) {
      const d = Math.hypot(s.x - x, s.y - y)
      if (d < alertR) {
        s.alert = 5.0
        s.chase = false
        s.ax = x
        s.ay = y
        s.glow = Math.max(s.glow, 0.5)
      }
    }
  }, [])

  const pingAt = useCallback(
    (x: number, y: number) => {
      // 玩家 ping：锐利、亮、硬朗的波前，照明与引怪半径同为 560
      doEmit(x, y, 1.0, PING_ALERT_R, 0, PING_ALERT_R)
      playPing()
    },
    [doEmit, playPing]
  )

  /** 按蓄力程度（0~1）甩出回音球：用力越大初速越快，撞击声波越强、照得越远 */
  const throwBall = useCallback(
    (charge: number) => {
      const w = worldRef.current
      if (!w || w.state !== 'play' || w.ballsLeft <= 0) return
      w.ballsLeft -= 1
      const f = facingRef.current
      const len = Math.hypot(f.x, f.y) || 1
      const speed = THROW_MIN + (THROW_MAX - THROW_MIN) * Math.max(0, Math.min(1, charge))
      w.balls.push({
        x: w.player.x,
        y: w.player.y,
        vx: (f.x / len) * speed,
        vy: (f.y / len) * speed,
        bornAt: performance.now() / 1000,
        dist: 0,
      })
      playTone(980, 0.18, 0.07)
    },
    [playTone]
  )

  /** 结束蓄力并按持有时长换算力度甩球（键盘松开 / 按钮松手共用） */
  const releaseBallCharge = useCallback(() => {
    const start = chargeAtRef.current
    chargeAtRef.current = null
    chargeRef.current = 0
    if (start !== null) {
      const charge = Math.max(0.08, Math.min(1, (performance.now() - start) / THROW_CHARGE_MS))
      throwBall(charge)
    }
  }, [throwBall])

  /** 脚下轻声发声（空格 / 竖屏下方「发声」按钮共用）：比点击 ping 更轻、范围更小 */
  const footPing = useCallback(() => {
    const w = worldRef.current
    if (!w || w.state !== 'play') return
    doEmit(w.player.x, w.player.y, 0.85, 440, 0, 440)
    playPing(0.08)
  }, [doEmit, playPing])

  const onCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (phase !== 'playing') return
    ensureAudio()
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) * (W / rect.width)
    const y = (e.clientY - rect.top) * (H / rect.height)
    pingAt(x, y)
  }

  /* ------------------------------ 开局 / 收尾 ------------------------------ */

  const startLevel = useCallback(
    (idx: number) => {
      worldRef.current = buildWorld(LEVELS[idx])
      setLevelIdx(idx)
      setSession((v) => v + 1)
      setResult(null)
      setPhase('playing')
      setHud({ hearts: 3, orbs: 0, total: LEVELS[idx].orbs.length, timeSec: 0, pings: 0, balls: BALLS_PER_LEVEL })
      ensureAudio()
    },
    [ensureAudio]
  )

  const toggleMute = () => {
    setMuted((m) => {
      try {
        localStorage.setItem('couple-echocavern-muted', m ? '0' : '1')
      } catch {
        // ignore
      }
      return !m
    })
  }

  /* ------------------------------ 键盘 ------------------------------ */

  useEffect(() => {
    if (phase !== 'playing') return
    const DIRS: Record<string, string> = {
      ArrowUp: 'up',
      KeyW: 'up',
      ArrowDown: 'down',
      KeyS: 'down',
      ArrowLeft: 'left',
      KeyA: 'left',
      ArrowRight: 'right',
      KeyD: 'right',
    }
    const down = (e: KeyboardEvent) => {
      ensureAudio()
      const d = DIRS[e.code]
      if (d) {
        e.preventDefault()
        keysRef.current.add(d)
        return
      }
      if (e.code === 'Space' || e.code === 'KeyR' || e.code === 'KeyE') e.preventDefault()
      if (e.repeat) return
      if (e.code === 'Space') {
        // 空格：在脚下发声（比点击的 ping 更轻、照明与引怪范围也更小）
        footPing()
      } else if (e.code === 'KeyE') {
        // 按住 E 蓄力，松手甩出
        if (chargeAtRef.current === null) chargeAtRef.current = performance.now()
      } else if (e.code === 'KeyR') {
        startLevel(levelIdx)
      }
    }
    const up = (e: KeyboardEvent) => {
      const d = DIRS[e.code]
      if (d) keysRef.current.delete(d)
      else if (e.code === 'KeyE') releaseBallCharge()
    }
    const blur = () => {
      keysRef.current.clear()
      // 失焦时不误甩，只取消蓄力
      chargeAtRef.current = null
      chargeRef.current = 0
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      keysRef.current.clear()
    }
  }, [phase, levelIdx, footPing, releaseBallCharge, startLevel, ensureAudio])

  /* ------------------------------ 主循环 ------------------------------ */

  useEffect(() => {
    if (phase !== 'playing') return
    const canvas = canvasRef.current
    const s = getShared()
    if (!canvas || !s) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { echoCv, echoCtx, echoImg, echo32, acc, warm } = s
    let raf = 0
    let lastT = performance.now() / 1000

    /** 更新 HUD：与上次快照比较，有变化才 setState（避免 60fps 重渲染） */
    const syncHud = (w: World) => {
      const got = w.orbs.filter((o) => o.taken).length
      const next = {
        hearts: w.hearts,
        orbs: got,
        total: w.orbs.length,
        timeSec: Math.floor(w.runTime),
        pings: w.pingsUsed,
        balls: w.ballsLeft,
      }
      const prev = hudRef.current
      if (
        prev.hearts !== next.hearts ||
        prev.orbs !== next.orbs ||
        prev.total !== next.total ||
        prev.timeSec !== next.timeSec ||
        prev.pings !== next.pings ||
        prev.balls !== next.balls
      ) {
        hudRef.current = next
        setHud(next)
      }
    }

    const frame = (ms: number) => {
      raf = requestAnimationFrame(frame)
      const w = worldRef.current
      if (!w) return
      const tNow = ms / 1000
      let dt = tNow - lastT
      lastT = tNow
      if (dt > 0.05) dt = 0.05

      if (w.state === 'play') {
        w.runTime += dt

        /* --- 玩家移动（速度平滑 + 分轴滑动碰撞；摇杆为模拟量，支持斜向与半速） --- */
        let ix = 0
        let iy = 0
        if (keysRef.current.has('left')) ix -= 1
        if (keysRef.current.has('right')) ix += 1
        if (keysRef.current.has('up')) iy -= 1
        if (keysRef.current.has('down')) iy += 1
        ix += joyRef.current.x
        iy += joyRef.current.y
        const mag = Math.hypot(ix, iy)
        if (mag > 1) {
          ix /= mag
          iy /= mag
        }
        const tvx = ix * PLAYER_SPEED
        const tvy = iy * PLAYER_SPEED
        w.player.vx += (tvx - w.player.vx) * Math.min(1, dt * 14)
        w.player.vy += (tvy - w.player.vy) * Math.min(1, dt * 14)
        if (ix !== 0 || iy !== 0) {
          const fl = Math.hypot(ix, iy) || 1
          facingRef.current.x = ix / fl
          facingRef.current.y = iy / fl
        }
        if (!blocked(w.solid, w.player.x + w.player.vx * dt, w.player.y, w.player.r)) w.player.x += w.player.vx * dt
        else w.player.vx = 0
        if (!blocked(w.solid, w.player.x, w.player.y + w.player.vy * dt, w.player.r)) w.player.y += w.player.vy * dt
        else w.player.vy = 0
        if (w.player.inv > 0) w.player.inv -= dt

        /* --- 光点 --- */
        let left = 0
        for (const o of w.orbs) {
          if (o.taken) continue
          left += 1
          if (Math.hypot(o.x - w.player.x, o.y - w.player.y) < w.player.r + 11) {
            o.taken = true
            playTone(880 + Math.random() * 200, 0.35, 0.09)
          }
        }
        if (left === 0) {
          // 拾尽光点 → 本层探明
          w.state = 'clear'
          playTone(1320, 0.5, 0.1)
          window.setTimeout(() => playTone(1760, 0.6, 0.08), 130)
          const prevBest = bestsRef.current[LEVELS[levelIdx].key]
          const timeSec = w.runTime
          const newBest = !prevBest || timeSec < prevBest.timeSec
          if (newBest) {
            const next = { ...bestsRef.current, [LEVELS[levelIdx].key]: { timeSec, pings: w.pingsUsed } }
            setBests(next)
            try {
              localStorage.setItem(BEST_KEY, JSON.stringify(next))
            } catch {
              // ignore
            }
          }
          setResult({ kind: 'clear', timeSec, pings: w.pingsUsed, newBest, isLast: levelIdx === LEVELS.length - 1 })
        }

        /* --- 影 --- */
        w.danger = 0
        for (const sh of w.shadows) {
          const dp = Math.hypot(w.player.x - sh.x, w.player.y - sh.y)

          if (sh.alert > 0) {
            sh.alert -= dt
            if (dp < CHASE_R) sh.chase = true
            const tx = sh.chase ? w.player.x : sh.ax
            const ty = sh.chase ? w.player.y : sh.ay
            const dx = tx - sh.x
            const dy = ty - sh.y
            const l = Math.hypot(dx, dy) || 1
            const sp = sh.chase ? 152 : 120
            sh.vx += ((dx / l) * sp - sh.vx) * Math.min(1, dt * 3.2)
            sh.vy += ((dy / l) * sp - sh.vy) * Math.min(1, dt * 3.2)
            if (!sh.chase && Math.hypot(sh.ax - sh.x, sh.ay - sh.y) < 34) sh.alert = Math.min(sh.alert, 0.6)
          } else {
            sh.chase = false
            if (Math.random() < dt * 0.8) {
              const a = Math.random() * Math.PI * 2
              sh.wx = Math.cos(a)
              sh.wy = Math.sin(a)
            }
            sh.vx += (sh.wx * 54 - sh.vx) * Math.min(1, dt * 1.4)
            sh.vy += (sh.wy * 54 - sh.vy) * Math.min(1, dt * 1.4)
          }

          // 移动 + 撞墙反弹
          const nx = sh.x + sh.vx * dt
          const ny = sh.y + sh.vy * dt
          if (!blocked(w.solid, nx, sh.y, sh.r)) sh.x = nx
          else {
            sh.vx *= -0.6
            sh.wx *= -1
          }
          if (!blocked(w.solid, sh.x, ny, sh.r)) sh.y = ny
          else {
            sh.vy *= -0.6
            sh.wy *= -1
          }

          // 窸窣微光：隔 0.9~2.4s 冒一下
          sh.skitter -= dt
          if (sh.skitter <= 0) {
            sh.skitter = 0.9 + Math.random() * 1.5
            sh.glow = Math.max(sh.glow, 0.42)
          }
          if (sh.glow > 0) sh.glow = Math.max(0, sh.glow - dt * 1.6)

          if (dp < DANGER_R) w.danger = Math.max(w.danger, 1 - dp / DANGER_R)

          // 命中
          if (dp < w.player.r + sh.r - 4 && w.player.inv <= 0) {
            w.hearts -= 1
            w.player.inv = 2.6
            playHit()
            for (const o of w.shadows) {
              o.alert = 0
              o.chase = false
              o.vx *= -1.4
              o.vy *= -1.4
            }
            if (w.hearts <= 0) {
              w.state = 'over'
              setResult({ kind: 'over', timeSec: w.runTime, pings: w.pingsUsed, newBest: false, isLast: false })
            } else {
              w.player.x = LEVELS[levelIdx].start[0]
              w.player.y = LEVELS[levelIdx].start[1]
              w.player.vx = 0
              w.player.vy = 0
              w.pulses = []
              w.balls = []
            }
          }
        }

        /* --- 回音球：重力抛物线 + 恢复系数反弹 + 指数衰减；撞壁本身是一次微型 ping --- */
        const ballImpact = (b: EchoBall, impact: number) => {
          if (impact < 30) return // 轻触不算声学事件
          // 撞击半径由速度映射：r = 140 + 0.8·|v|，上限 340；引怪半径 ×1.6（球是更好的诱饵）
          const r = Math.max(140, Math.min(340, 140 + 0.8 * impact))
          doEmit(b.x, b.y, 0.45 + Math.min(0.45, impact / 900), r, 1, r * 1.6, true)
          playTone(240 + impact * 0.5, 0.16, 0.05)
        }
        for (const b of w.balls) {
          // 重力 + 指数空气阻力
          b.vy += BALL_GRAV * dt
          const drag = Math.exp(-BALL_DRAG * dt)
          b.vx *= drag
          b.vy *= drag
          let sp = Math.hypot(b.vx, b.vy)
          if (sp < BALL_STOP_SPEED) {
            // 滚动停下：不再发出声音，转为常亮灯笼（暖光照亮周围一圈洞壁），直到本层结束
            b.vx = 0
            b.vy = 0
            sp = 0
          }
          if (sp <= 0) continue
          const nx = b.x + b.vx * dt
          if (!blocked(w.solid, nx, b.y, 4)) b.x = nx
          else {
            const impact = Math.abs(b.vx)
            b.vx = impact > BALL_REST_MIN ? -b.vx * BALL_REST : 0
            ballImpact(b, impact)
          }
          const ny = b.y + b.vy * dt
          if (!blocked(w.solid, b.x, ny, 4)) b.y = ny
          else {
            const impact = Math.abs(b.vy)
            b.vy = impact > BALL_REST_MIN ? -b.vy * BALL_REST : 0
            ballImpact(b, impact)
          }
          // 声记点：沿飞行路径每 40px 打一个静止小声源 → 拖出连续晕开的暖色亮带
          b.dist += sp * dt
          if (b.dist >= TRAIL_GAP && sp > TRAIL_MIN_SPEED) {
            b.dist = 0
            doEmit(b.x, b.y, 0.22, TRAIL_R, 0.8, 0, true)
            playPing(0.03, 0.22)
          }
        }

        /* --- 声波生命周期 --- */
        for (let i = w.pulses.length - 1; i >= 0; i--) {
          const p = w.pulses[i]
          if ((tNow - p.t0) * SPEED > 1180 + LIFE * SPEED) w.pulses.splice(i, 1)
        }
      }

      /* ---------------- 低频轰鸣：danger² 驱动 ---------------- */
      if (droneGainRef.current) droneGainRef.current.gain.value = mutedRef.current ? 0 : w.danger * w.danger * 0.075

      /* ---------------- 蓄力指示：直接驱动按钮进度条 / 投掷盘力度环（绕过 React 渲染） ---------------- */
      if (chargeAtRef.current !== null) {
        chargeRef.current = Math.min(1, (performance.now() - chargeAtRef.current) / THROW_CHARGE_MS)
      }
      if (ballBarRef.current) ballBarRef.current.style.width = `${(chargeRef.current * 100).toFixed(1)}%`
      if (ballBar2Ref.current) ballBar2Ref.current.style.width = `${(chargeRef.current * 100).toFixed(1)}%`
      if (ballRingRef.current) {
        ballRingRef.current.style.background =
          chargeRef.current > 0.005
            ? `conic-gradient(rgba(255,185,80,0.95) ${(chargeRef.current * 360).toFixed(0)}deg, rgba(255,255,255,0.12) 0deg)`
            : 'rgba(255,255,255,0.12)'
      }

      /* ================= 渲染 ================= */
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = '#03050b'
      ctx.fillRect(0, 0, W, H)

      /* --- 回声层：边界单元逐环渲染（核心） --- */
      acc.fill(0)
      warm.fill(0)
      const { xs: edgeX, ys: edgeY, idx: edgeI, n } = w.edges
      for (let k = 0; k < n; k++) {
        const x = edgeX[k]
        const y = edgeY[k]
        let v = 0
        let wv = 0

        // 1) 贴身感知：离玩家越近，墙壁微微发亮（触觉）
        const pdx = x - w.player.x
        const pdy = y - w.player.y
        const pd = Math.sqrt(pdx * pdx + pdy * pdy)
        if (pd < WALL_R) v += 0.34 * (1 - pd / WALL_R)

        // 1.5) 停下的回音球 = 常亮灯笼：暖光持续照亮周围一圈洞壁（无延迟、不消退）
        for (const b of w.balls) {
          if (b.vx !== 0 || b.vy !== 0) continue
          const bdx = x - b.x
          const bdy = y - b.y
          const bd = Math.sqrt(bdx * bdx + bdy * bdy)
          if (bd < BALL_LANTERN_R) {
            const lv = 0.3 * (1 - bd / BALL_LANTERN_R)
            v += lv
            wv += lv
          }
        }

        // 2) 声波回声：按「到声源的距离」决定点亮时刻（远处延迟更久才成像），
        //    抵达后波前亮带 + 距离能量衰减 + 生命周期淡出；maxD 之外一概不亮
        for (const p of w.pulses) {
          const waveR = (tNow - p.t0) * SPEED
          if (waveR <= 0) continue
          const dx = x - p.x
          const dy = y - p.y
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d > waveR || d > p.maxD) continue // 波还没到 / 超出照明半径 → 仍然是黑的
          const since = (waveR - d) / SPEED // 被照亮了多久
          if (since > LIFE) continue // 早已消退
          const fade = 1 - since / LIFE
          const energy = 1 / (1 + d / 470) // 距离能量衰减
          const band = 0.55 + 0.45 * Math.exp(-(since / BANDT) * (since / BANDT)) // 波前最亮
          const c = fade * energy * band * p.power
          v += c
          if (p.warm > 0) wv += c * p.warm
        }

        if (v < 0.014) continue

        // 3) 3×3 柔性溅射 → 描边带柔光
        const i = edgeI[k]
        acc[i] += v
        acc[i - 1] += v * 0.45
        acc[i + 1] += v * 0.45
        acc[i - GW] += v * 0.45
        acc[i + GW] += v * 0.45
        if (wv > 0) {
          warm[i] += wv
          warm[i - 1] += wv * 0.45
          warm[i + 1] += wv * 0.45
          warm[i - GW] += wv * 0.45
          warm[i + GW] += wv * 0.45
        }
      }

      // 4) 写入 ImageData（玩家 ping=青蓝锐利 / 球撞击=琥珀暖色，按暖色占比混色，高亮处转白），Uint32 直写
      for (let i = 0, len = acc.length; i < len; i++) {
        const v = acc[i]
        if (v <= 0.0015) {
          echo32[i] = 0
          continue
        }
        const c = v > 1.6 ? 1.6 : v
        const k = c > 1 ? 1 : c
        // 暖色占比：该像素被球回声照到的能量份额
        const wr = Math.max(0, Math.min(1, warm[i] / v))
        let r = k * (72 + 165 * wr)
        let g = k * (240 - 85 * wr)
        let b = k * (215 - 135 * wr)
        if (c > 0.85) {
          const t = Math.min(1, (c - 0.85) / 0.6)
          r = r * (1 - t) + 205 * t
          g = g * (1 - t) + 255 * t
          b = b * (1 - t) + 255 * t
        }
        echo32[i] = (0xff000000 | ((b | 0) << 16) | ((g | 0) << 8) | (r | 0)) >>> 0
      }
      echoCtx.putImageData(echoImg, 0, 0)
      ctx.globalCompositeOperation = 'lighter'
      ctx.imageSmoothingEnabled = true
      ctx.drawImage(echoCv, 0, 0, W, H)

      /* --- 自由空间的波前细环（声波到哪儿了；球的是暖色拖尾感） --- */
      for (const p of w.pulses) {
        const waveR = (tNow - p.t0) * SPEED
        if (waveR <= 0 || waveR > p.maxD) continue
        const a = Math.max(0, 0.16 * (1 - waveR / p.maxD)) * p.power
        if (a <= 0.004) continue
        ctx.strokeStyle =
          p.warm > 0 ? `rgba(255,190,120,${a * 0.9})` : `rgba(90,220,235,${a})`
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.arc(p.x, p.y, waveR, 0, Math.PI * 2)
        ctx.stroke()
      }

      /* --- 光点 --- */
      for (const o of w.orbs) {
        if (o.taken) continue
        const pulse = 0.72 + 0.28 * Math.sin(tNow * 2.6 + o.ph)
        const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, 34)
        g.addColorStop(0, `rgba(190,255,255,${0.85 * pulse})`)
        g.addColorStop(0.22, `rgba(70,230,240,${0.4 * pulse})`)
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(o.x, o.y, 34, 0, Math.PI * 2)
        ctx.fill()
      }

      /* --- 回音球：飞行中亮暖光；停下后转为常亮灯笼（呼吸脉动） --- */
      for (const b of w.balls) {
        const stopped = b.vx === 0 && b.vy === 0
        const breath = stopped ? 0.5 + 0.12 * Math.sin(tNow * 2.2) : 0.75
        const gr = stopped ? 30 : 16
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, gr)
        g.addColorStop(0, `rgba(255,200,130,${breath})`)
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(b.x, b.y, gr, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = stopped ? '#ffe9c8' : '#fff2dd'
        ctx.beginPath()
        ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2)
        ctx.fill()
      }

      /* --- 玩家光晕 + 小人（暖色，与青色光点区分） --- */
      {
        const pg = ctx.createRadialGradient(w.player.x, w.player.y, 0, w.player.x, w.player.y, 92)
        pg.addColorStop(0, 'rgba(255,206,140,0.22)')
        pg.addColorStop(0.35, 'rgba(255,170,90,0.08)')
        pg.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = pg
        ctx.beginPath()
        ctx.arc(w.player.x, w.player.y, 92, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'
      {
        const blink = w.player.inv > 0 && Math.floor(tNow * 12) % 2 === 0
        const a = blink ? 0.3 : 0.95
        const px = w.player.x
        const py = w.player.y
        // 走动时双腿摆动，静止时立正
        const moving = Math.hypot(w.player.vx, w.player.vy) > 12
        const swing = moving ? Math.sin(tNow * 11) * 2.4 : 0
        ctx.strokeStyle = `rgba(255,206,140,${a})`
        ctx.fillStyle = `rgba(255,220,170,${a})`
        ctx.lineWidth = 2.2
        ctx.lineCap = 'round'
        // 头
        ctx.beginPath()
        ctx.arc(px, py - 6.2, 3.4, 0, Math.PI * 2)
        ctx.fill()
        // 身体 + 双臂 + 双腿
        ctx.beginPath()
        ctx.moveTo(px, py - 2.2)
        ctx.lineTo(px, py + 3.6)
        ctx.moveTo(px - 4.4, py + 0.4)
        ctx.lineTo(px, py - 1)
        ctx.lineTo(px + 4.4, py + 0.4)
        ctx.moveTo(px, py + 3.6)
        ctx.lineTo(px - 3.2, py + 9 + swing)
        ctx.moveTo(px, py + 3.6)
        ctx.lineTo(px + 3.2, py + 9 - swing)
        ctx.stroke()
        // 脚下淡淡的暖色定位点（黑暗里更容易找到自己）
        const fg = ctx.createRadialGradient(px, py + 11, 0, px, py + 11, 8)
        fg.addColorStop(0, `rgba(255,190,110,${0.28 * a})`)
        fg.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = fg
        ctx.beginPath()
        ctx.arc(px, py + 11, 8, 0, Math.PI * 2)
        ctx.fill()
        // 蓄力环：正在蓄力时绕玩家画一圈进度弧，直观显示当前力度
        if (chargeAtRef.current !== null && chargeRef.current > 0.02) {
          ctx.strokeStyle = 'rgba(255,185,80,0.9)'
          ctx.lineWidth = 2.6
          ctx.beginPath()
          ctx.arc(px, py - 2, 14, -Math.PI / 2, -Math.PI / 2 + chargeRef.current * Math.PI * 2)
          ctx.stroke()
        }
      }

      /* --- 影：被回声扫到 / 靠近 / 窸窣时才显形 --- */
      for (const sh of w.shadows) {
        let vis = 0
        for (const p of w.pulses) {
          const waveR = (tNow - p.t0) * SPEED
          const d = Math.hypot(sh.x - p.x, sh.y - p.y)
          const since = (waveR - d) / SPEED
          if (since >= 0 && since < 1.0) vis = Math.max(vis, (1 - since) * 0.62 * p.power)
        }
        const dp = Math.hypot(sh.x - w.player.x, sh.y - w.player.y)
        vis = Math.max(vis, Math.max(0, 1 - dp / 150) * 0.3, sh.glow)
        if (vis <= 0.025) continue

        const g = ctx.createRadialGradient(sh.x, sh.y, 0, sh.x, sh.y, sh.r * 2.4)
        g.addColorStop(0, `rgba(200,140,255,${0.52 * vis})`)
        g.addColorStop(0.45, `rgba(120,40,180,${0.3 * vis})`)
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(sh.x, sh.y, sh.r * 2.4, 0, Math.PI * 2)
        ctx.fill()
        if (sh.chase) {
          ctx.fillStyle = 'rgba(255,120,120,0.9)'
          ctx.fillRect(sh.x - 5, sh.y - 2.5, 3, 3)
          ctx.fillRect(sh.x + 2, sh.y - 2.5, 3, 3)
        }
      }

      /* --- 危险暗角 --- */
      if (w.danger > 0.02) {
        const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28, W / 2, H / 2, Math.max(W, H) * 0.62)
        g.addColorStop(0, 'rgba(0,0,0,0)')
        g.addColorStop(1, `rgba(190,20,60,${0.42 * w.danger * w.danger})`)
        ctx.fillStyle = g
        ctx.fillRect(0, 0, W, H)
      }

      syncHud(w)
    }

    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      // 退出对局时关掉低频轰鸣，避免回声残留
      if (droneGainRef.current) droneGainRef.current.gain.value = 0
    }
    // bests / levelIdx 的最新值通过 worldRef 与闭包外的 ref 读取，这里只响应开局重启
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, levelIdx, session, playTone, playPing, playHit, doEmit])

  /* ------------------------------ 横屏全屏 ------------------------------ */

  /** 进入 / 退出全屏；手机上顺带锁定横屏（不支持的环境静默跳过） */
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {})
      return
    }
    const el = stageRef.current
    if (!el) return
    void el.requestFullscreen().catch(() => {})
    // 锁横屏在 iOS 等环境常不可用：提示用户手动打开自动旋转后横过来
    if (isTouch) {
      setFsHint(true)
      window.setTimeout(() => setFsHint(false), 4000)
    }
    try {
      const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
      void so.lock?.('landscape').catch(() => {})
    } catch {
      // 桌面端或不支持方向锁定的浏览器：忽略即可，全屏本身已生效
    }
  }, [isTouch])

  useEffect(() => {
    if (phase !== 'playing') return
    const onFs = () => {
      const fs = Boolean(document.fullscreenElement)
      setFullscreen(fs)
      if (!fs) setFsHint(false)
    }
    document.addEventListener('fullscreenchange', onFs)
    return () => {
      document.removeEventListener('fullscreenchange', onFs)
      // 退出对局时若还在全屏里，一并退出
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    }
  }, [phase])

  /* ------------------------------ 虚拟摇杆（触屏） ------------------------------ */

  /** 把指针位置换算成摇杆模拟量，并直接挪动滑块（绕过 React 状态，避免 60fps 重渲染） */
  const joyApply = (e: React.PointerEvent) => {
    const base = joyBaseRef.current
    if (!base) return
    const rect = base.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const R = rect.width / 2
    const range = R * 0.62 // 滑块最大偏移
    let dx = e.clientX - cx
    let dy = e.clientY - cy
    const len = Math.hypot(dx, dy)
    if (len > range) {
      dx = (dx / len) * range
      dy = (dy / len) * range
    }
    joyRef.current.x = dx / range
    joyRef.current.y = dy / range
    if (joyThumbRef.current) joyThumbRef.current.style.transform = `translate(${dx}px, ${dy}px)`
  }

  const joyReset = () => {
    joyRef.current.x = 0
    joyRef.current.y = 0
    joyRef.current.active = false
    if (joyThumbRef.current) joyThumbRef.current.style.transform = 'translate(0px, 0px)'
  }

  const joyHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault()
      ensureAudio()
      joyRef.current.active = true
      e.currentTarget.setPointerCapture(e.pointerId)
      joyApply(e)
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (joyRef.current.active) joyApply(e)
    },
    onPointerUp: joyReset,
    onPointerCancel: joyReset,
  }

  /* ------------------------------ 投掷盘（触屏，右下角） ------------------------------ */

  /** 与 HUD 小按钮同一套蓄力逻辑，但触控目标 112px，且环形力度反馈直接由主循环驱动 */
  const ballPadHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault()
      ensureAudio()
      const w = worldRef.current
      if (!w || w.state !== 'play' || w.ballsLeft <= 0) return
      chargeAtRef.current = performance.now()
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.preventDefault()
      releaseBallCharge()
    },
    onPointerCancel: releaseBallCharge,
  }

  /* ------------------------------ 竖屏下方按钮（触屏非全屏时） ------------------------------ */

  /** 方向按钮复用键盘输入通道：按下往 keysRef 加键、松手删键，主循环无需感知来源 */
  const padDir = (dir: 'up' | 'down' | 'left' | 'right') => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault()
      ensureAudio()
      keysRef.current.add(dir)
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.preventDefault()
      keysRef.current.delete(dir)
    },
    onPointerLeave: () => keysRef.current.delete(dir),
    onPointerCancel: () => keysRef.current.delete(dir),
  })

  /** 退出全屏时摇杆 / 下方按钮随之卸载，清掉可能残留的按住状态 */
  useEffect(() => {
    if (!fullscreen) {
      keysRef.current.clear()
      joyReset()
    }
  }, [fullscreen, joyReset])

  /* ------------------------------ 关卡选择页 ------------------------------ */

  if (phase === 'intro') {
    return (
      <div className="space-y-3">
        <div className="space-y-2 rounded-xl bg-slate-900 p-4 text-slate-300 shadow-inner ring-1 ring-slate-700">
          <p className="text-sm font-bold text-cyan-300">🕳️ 全黑之中，你唯一的信息是回声</p>
          <ul className="space-y-1 text-[11px] leading-relaxed text-slate-400">
            <li>· 点击 / 轻触任意处发出声波，波前触壁便会短暂描出轮廓，几秒后消退；远处的墙要等更久才成像</li>
            <li>· 暖色小人是你，青色光点是目标：WASD / 方向键移动，空格在脚下发声，R 重开本层</li>
            <li>· 手机竖屏玩：画面下方按钮移动 / 发声 / 蓄力扔球，不遮挡画面；点右上 ⛶ 全屏并横过来，改用更顺手的摇杆 + 投掷盘</li>
            <li>· 拾尽青色光点即可深入下一层；每层 3 颗心，被影扑掉一颗回出生点</li>
            <li>· 每层 2 枚「回音球」：按住 E / 右下投掷盘蓄力、松手甩出——球沿抛物线飞出、撞墙反弹，撞得多重照得多远；停下后转为常亮灯笼，持续照亮周围一圈，当地标或诱饵都行（它的响动比你的 ping 更引影）</li>
            <li>· 注意：你的每一次发声，也会把 560 内的游走的影引过来；它贴近 210 就会追你</li>
            <li>· 贴身 128 内的墙有触觉微亮；影隔 1~2s 冒一下窸窣微光；靠近时屏幕泛暗红、低频轰鸣变响</li>
            <li>· 三层布局固定，第二遍走会明显更快——闭着眼也知道墙在哪</li>
          </ul>
        </div>

        <div className="space-y-2">
          {LEVELS.map((lv, i) => {
            const best = bests[lv.key]
            return (
              <button
                key={lv.key}
                type="button"
                className="flex w-full items-center gap-3 rounded-xl bg-white p-3 text-left shadow-sm ring-1 ring-slate-100 transition active:scale-[0.99]"
                onClick={() => startLevel(i)}
              >
                <span className="text-2xl">{['🕳️', '🌀', '🔥'][i]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-700">
                    第{['一', '二', '三'][i]}层·{lv.name}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-slate-400">{lv.desc}</span>
                  {best && (
                    <span className="mt-0.5 block text-[11px] font-medium text-cyan-600">
                      🏅最佳{fmtClock(best.timeSec)}·{best.pings}次发声
                    </span>
                  )}
                </span>
                <span className="text-xs font-semibold text-indigo-600">进入→</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  /* ------------------------------ 对局中 ------------------------------ */

  const level = LEVELS[levelIdx]
  return (
    <div className="space-y-2">
      {/* 舞台：全屏模式下铺满视口居中显示 */}
      <div
        ref={stageRef}
        className={
          fullscreen
            ? 'fixed inset-0 z-[60] flex items-center justify-center bg-black'
            : 'relative overflow-hidden rounded-2xl bg-black ring-1 ring-cyan-400/20'
        }
        style={fullscreen ? undefined : { boxShadow: '0 0 60px -24px rgba(34,211,238,.4)' }}
      >
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="block cursor-crosshair touch-none select-none"
          style={fullscreen ? { aspectRatio: '3 / 2', width: 'min(100vw, calc(100vh * 1.5))' } : { aspectRatio: '3 / 2', width: '100%' }}
          onPointerDown={onCanvasPointerDown}
        />

        {/* 顶部 HUD：叠在画布上 */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-2 text-[12px]">
          <div className="flex items-center gap-2">
            <span className="tabular-nums tracking-wide">
              {Array.from({ length: 3 }).map((_, i) => (
                <span key={i} className={i < hud.hearts ? 'text-rose-400' : 'text-slate-700'}>
                  {i < hud.hearts ? '◆' : '◇'}
                </span>
              ))}
            </span>
            <span className="tabular-nums text-cyan-300/90">
              光点 {hud.orbs}/{hud.total}
            </span>
            <span className="text-slate-500">{level.name}</span>
          </div>
          <div className="pointer-events-auto flex items-center gap-1.5">
            <span className="tabular-nums text-slate-500">
              {fmtClock(hud.timeSec)} · 发声 {hud.pings}
            </span>
            <button
              type="button"
              className="relative overflow-hidden rounded-md border border-slate-600/50 bg-slate-900/60 px-2 py-1 text-slate-200 transition hover:bg-cyan-500/20 disabled:opacity-40"
              disabled={hud.balls <= 0}
              onPointerDown={(e) => {
                e.preventDefault()
                ensureAudio()
                if (hud.balls > 0) {
                  chargeAtRef.current = performance.now()
                  e.currentTarget.setPointerCapture(e.pointerId)
                }
              }}
              onPointerUp={(e) => {
                e.preventDefault()
                releaseBallCharge()
              }}
              onPointerCancel={releaseBallCharge}
              title="回音球：按住蓄力，松手甩出——甩得越用力撞墙照得越远；停下后转为常亮灯笼（E 键同样按住蓄力）"
            >
              <div
                ref={ballBarRef}
                className="absolute inset-x-0 bottom-0 h-[3px] bg-amber-400"
                style={{ width: '0%' }}
              />
              🎾 {hud.balls}
            </button>
            <button type="button" className="rounded-md border border-slate-600/50 bg-slate-900/60 px-2 py-1 text-slate-200 transition hover:bg-cyan-500/20" onClick={toggleMute} title="音效开关">
              {muted ? '🔇' : '🔊'}
            </button>
            <button type="button" className="rounded-md border border-slate-600/50 bg-slate-900/60 px-2 py-1 text-slate-200 transition hover:bg-cyan-500/20" onClick={toggleFullscreen} title={fullscreen ? '退出全屏' : '横屏全屏'}>
              {fullscreen ? '✕' : '⛶'}
            </button>
            <button type="button" className="rounded-md border border-slate-600/50 bg-slate-900/60 px-2 py-1 text-slate-200 transition hover:bg-cyan-500/20" onClick={() => startLevel(levelIdx)} title="重开本层（R 键）">
              重来
            </button>
            <button type="button" className="rounded-md border border-slate-600/50 bg-slate-900/60 px-2 py-1 text-slate-200 transition hover:bg-cyan-500/20" onClick={() => setPhase('intro')}>
              出洞
            </button>
          </div>
        </div>

        {/* 摇杆：仅横屏全屏时显示（竖屏用画面下方的按钮，不遮挡画面） */}
        {isTouch && fullscreen && (
          <div
            ref={joyBaseRef}
            className="absolute bottom-4 left-4 flex h-28 w-28 touch-none select-none items-center justify-center rounded-full border border-white/20 bg-white/10 backdrop-blur-sm"
            {...joyHandlers}
          >
            <span className="pointer-events-none absolute text-[10px] text-white/30">移动</span>
            <div
              ref={joyThumbRef}
              className="pointer-events-none h-12 w-12 rounded-full border border-white/30 bg-white/25 shadow-inner"
            />
          </div>
        )}

        {/* 投掷盘：仅横屏全屏时显示，右下角，按住蓄力（环形力度反馈） */}
        {isTouch && fullscreen && (
          <div
            className={`absolute bottom-4 right-4 flex h-28 w-28 touch-none select-none items-center justify-center rounded-full border border-white/20 bg-white/10 backdrop-blur-sm transition ${hud.balls <= 0 ? 'opacity-40' : ''}`}
            {...ballPadHandlers}
          >
            <div ref={ballRingRef} className="pointer-events-none absolute inset-0 rounded-full" style={{ background: 'rgba(255,255,255,0.12)' }} />
            <span className="pointer-events-none relative text-3xl">🎾</span>
            <span className="pointer-events-none absolute bottom-1.5 text-[10px] text-white/40">{hud.balls > 0 ? '按住蓄力' : '已用完'}</span>
          </div>
        )}

        {/* 全屏横屏提示：锁屏方向不可用时的引导 */}
        {fullscreen && fsHint && (
          <div className="pointer-events-none absolute left-1/2 top-12 -translate-x-1/2 whitespace-nowrap rounded-lg bg-black/70 px-3 py-1.5 text-[11px] text-amber-200 ring-1 ring-amber-400/40">
            建议打开手机「自动旋转」并横过来玩，摇杆与投掷盘已就位
          </div>
        )}

        {/* 结算弹窗：渲染在舞台内部——全屏模式下也能正常弹出（全屏顶层会盖住 portal 到 body 的弹窗） */}
        {result && (
          <div className="absolute inset-0 z-20 flex touch-none items-center justify-center overscroll-contain bg-black/70 p-4 backdrop-blur-sm">
            <div className="animate-fade w-full max-w-xs space-y-3 rounded-2xl border border-cyan-400/30 bg-slate-900 p-5 text-center shadow-xl">
              <div className="text-4xl">{result.kind === 'clear' ? (result.isLast ? '🏆' : '🧭') : '🌑'}</div>
              <p className="font-bold tracking-widest text-cyan-200">
                {result.kind === 'clear' ? (result.isLast ? '洞窟尽头' : '洞窟已探明') : '被影吞没'}
              </p>
              <div className="tabular-nums text-xs text-slate-400">
                {level.name} · 用时 {result.timeSec.toFixed(1)} 秒 · 发声 {result.pings} 次
                {result.kind === 'clear' && result.newBest && <span className="ml-1 font-semibold text-amber-400">🏆 新纪录！</span>}
                {result.kind === 'clear' && !result.newBest && bests[level.key] && (
                  <div className="mt-0.5 text-[11px] text-slate-500">最佳 {fmtClock(bests[level.key].timeSec)} · {bests[level.key].pings} 次发声</div>
                )}
              </div>
              {result.kind === 'clear' ? (
                <div className="space-y-2">
                  {!result.isLast && (
                    <button type="button" className="w-full rounded-lg border border-cyan-400/40 bg-cyan-500/15 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/25" onClick={() => startLevel(levelIdx + 1)}>
                      继续深入 · {LEVELS[levelIdx + 1].name}
                    </button>
                  )}
                  {result.isLast && (
                    <p className="text-[11px] leading-relaxed text-slate-400">三层洞窟全部探明。黑暗不再是失去视力，而是一种需要练习的器官。</p>
                  )}
                  <button type="button" className="btn-ghost w-full py-2 text-xs" onClick={() => startLevel(levelIdx)}>
                    再走一遍这层
                  </button>
                  <button type="button" className="btn-ghost w-full py-2 text-xs" onClick={() => setPhase('intro')}>
                    返回关卡选择
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <button type="button" className="w-full rounded-lg border border-cyan-400/40 bg-cyan-500/15 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/25" onClick={() => startLevel(levelIdx)}>
                    再来一次
                  </button>
                  <button type="button" className="btn-ghost w-full py-2 text-xs" onClick={() => setPhase('intro')}>
                    返回关卡选择
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 竖屏触屏：画面下方按钮排，不遮挡游戏画面 */}
      {isTouch && !fullscreen && (
        <div className="flex items-end justify-between gap-3 px-0.5">
          <div className="grid grid-cols-3 gap-1.5">
            <span />
            <button type="button" className="flex h-12 w-12 touch-none select-none items-center justify-center rounded-xl border border-slate-600/50 bg-slate-800/70 text-lg leading-none text-cyan-200 transition active:bg-cyan-500/30" {...padDir('up')}>
              ▲
            </button>
            <span />
            <button type="button" className="flex h-12 w-12 touch-none select-none items-center justify-center rounded-xl border border-slate-600/50 bg-slate-800/70 text-lg leading-none text-cyan-200 transition active:bg-cyan-500/30" {...padDir('left')}>
              ◀
            </button>
            <button type="button" className="flex h-12 w-12 touch-none select-none items-center justify-center rounded-xl border border-slate-600/50 bg-slate-800/70 text-lg leading-none text-cyan-200 transition active:bg-cyan-500/30" {...padDir('down')}>
              ▼
            </button>
            <button type="button" className="flex h-12 w-12 touch-none select-none items-center justify-center rounded-xl border border-slate-600/50 bg-slate-800/70 text-lg leading-none text-cyan-200 transition active:bg-cyan-500/30" {...padDir('right')}>
              ▶
            </button>
          </div>
          <div className="flex items-end gap-2">
            <button
              type="button"
              className="flex h-12 touch-none select-none items-center rounded-xl border border-slate-600/50 bg-slate-800/70 px-3 text-xs font-semibold text-cyan-200 transition active:bg-cyan-500/30"
              onClick={footPing}
            >
              📢 发声
            </button>
            <button
              type="button"
              className={`relative flex h-12 touch-none select-none items-center overflow-hidden rounded-xl border border-slate-600/50 bg-slate-800/70 px-3 text-xs font-semibold text-amber-200 transition active:bg-amber-500/25 ${hud.balls <= 0 ? 'opacity-40' : ''}`}
              onPointerDown={(e) => {
                e.preventDefault()
                ensureAudio()
                const w = worldRef.current
                if (w && w.state === 'play' && w.ballsLeft > 0) {
                  chargeAtRef.current = performance.now()
                  e.currentTarget.setPointerCapture(e.pointerId)
                }
              }}
              onPointerUp={(e) => {
                e.preventDefault()
                releaseBallCharge()
              }}
              onPointerCancel={releaseBallCharge}
            >
              <div ref={ballBar2Ref} className="absolute inset-x-0 bottom-0 h-1 bg-amber-400" style={{ width: '0%' }} />
              🎾 蓄力 {hud.balls}
            </button>
          </div>
        </div>
      )}

      {!fullscreen && (
        <p className="text-center text-[11px] leading-relaxed text-slate-400">
          点屏幕发声音探路 ·
          {isTouch ? ' 下方按钮移动 / 发声 / 扔球 · 顶部 ⛶ 全屏后用摇杆更顺手' : ' WASD / 方向键移动 · 空格脚下发声'} · R 重开
        </p>
      )}

    </div>
  )
}
