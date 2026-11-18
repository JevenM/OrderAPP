import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { fetchCoupleSnakeBest, submitCoupleSnakeBest } from '../lib/db'
import { sfx } from '../lib/sfx'
import { useJoystick } from './game/useJoystick'

/* ============================== 贪食蛇大作战（单机） ==============================
 * 参考 根目录 deepseek_html_20261117_70a3d8.html 移植：
 * - 吃光点变长得分、按住冲刺 ×1.9 速度（耗长度 + 能量条）
 * - 冲刺撞对手身体：自身长度 ≥ 对手 70% → 反杀吞食其一半长度；否则自己死
 * - 死亡掉落成食物，翻盘资源；实时排行榜 top6，目标登顶
 * - 桌面：鼠标转向 + 空格冲刺；触屏：左摇杆转向 + 右侧按住冲刺（全屏横屏最佳）
 * ========================================================================== */

const W = 820
const H = 600
const WORLD = 2800
const FOOD_COUNT = 420
const AI_COUNT = 12
const BASE_SPEED = 215
const BOOST_MULT = 1.9
const HEAD_R = 14

const SKINS = [
  { name: '青蛇', body: '#06d6a0' },
  { name: '赤焰', body: '#ef476f' },
  { name: '蓝电', body: '#4cc9f0' },
  { name: '金鳞', body: '#ffd166' },
  { name: '紫魅', body: '#8338ec' },
  { name: '橙光', body: '#f78c6b' },
  { name: '银白', body: '#e0e0e0' },
]
const AI_COLORS = ['#ef476f', '#06d6a0', '#118ab2', '#ffd166', '#8338ec', '#f78c6b', '#4cc9f0']
const AI_NAMES = ['闪电', '幽灵', '狂蟒', '小蛇', '巨蟒', '夜影', '疾风', '毒牙', '青龙', '烈焰', '寒冰', '雷霆']

interface Pt {
  x: number
  y: number
}
interface Food extends Pt {
  r: number
  color: string
  wob: number
  eaten?: boolean
}
interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  r: number
  color: string
}
interface FloatText {
  x: number
  y: number
  text: string
  color: string
  life: number
  maxLife: number
  vy: number
}
interface Snake {
  body: Pt[]
  color: string
  isPlayer: boolean
  alive: boolean
  angle: number
  targetLen: number
  boost: boolean
  aiTimer: number
  name: string
  kills: number
  hitFlash: number
}
interface World {
  player: Snake
  snakes: Snake[]
  foods: Food[]
  particles: Particle[]
  floats: FloatText[]
  camera: Pt
  mouse: Pt
  score: number
  kills: number
  boostEnergy: number
  gameOver: boolean
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

function makeSnake(x: number, y: number, color: string, isPlayer: boolean, name?: string): Snake {
  const body: Pt[] = []
  for (let i = 0; i < 12; i++) body.push({ x, y })
  return {
    body,
    color,
    isPlayer,
    alive: true,
    angle: rand(0, Math.PI * 2),
    targetLen: 12,
    boost: false,
    aiTimer: 0,
    name: isPlayer ? '你' : (name ?? 'AI'),
    kills: 0,
    hitFlash: 0,
  }
}

function shade(hex: string, p: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.round(Math.min(255, Math.max(0, ((n >> 16) & 255) + 255 * p)))
  const g = Math.round(Math.min(255, Math.max(0, ((n >> 8) & 255) + 255 * p)))
  const b = Math.round(Math.min(255, Math.max(0, (n & 255) + 255 * p)))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

const BEST_KEY = 'snakeBestLen'
const SKIN_KEY = 'snakeSkin'

export default function SnakeBattle({ myId, friendId, friendName }: { myId: string; friendId: string; friendName: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const wRef = useRef<World | null>(null)
  // 高性能摇杆：move 只记坐标，换算与滑块写入收敛到 rAF 每帧一次（详见 useJoystick）
  const { setBaseEl: setJoyBaseEl, thumbRef: joyThumbRef, vectorRef: joyVecRef } = useJoystick()
  const sprintTouchRef = useRef(false)
  const sprintMouseRef = useRef(false)
  const spaceRef = useRef(false)
  const skinRef = useRef(0)

  const [phase, setPhase] = useState<'intro' | 'playing'>('intro')
  const [fullscreen, setFullscreen] = useState(false)
  const [fsHint, setFsHint] = useState(false)
  const [skinIdx, setSkinIdx] = useState(() => {
    try {
      const v = parseInt(localStorage.getItem(SKIN_KEY) ?? '0', 10)
      return Number.isFinite(v) ? Math.min(SKINS.length - 1, Math.max(0, v)) : 0
    } catch {
      return 0
    }
  })
  const [best, setBest] = useState(() => {
    try {
      return parseInt(localStorage.getItem(BEST_KEY) ?? '0', 10) || 0
    } catch {
      return 0
    }
  })
  const [hud, setHud] = useState({ len: 12, kills: 0, score: 0, rank: '-' })
  const [dead, setDead] = useState<{ len: number; kills: number; score: number; reason: string } | null>(null)
  const [isTouch] = useState(() => typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0))

  /* ------------------------------ 情侣得分排行榜 ------------------------------ */

  /** 双方各自的历史最高分（云端 couple_snake_best，一人一列） */
  const [coupleBoard, setCoupleBoard] = useState<{ myBest: number; friendBest: number } | null>(null)

  const loadCoupleBoard = useCallback(async () => {
    if (!myId || !friendId) return
    try {
      const row = await fetchCoupleSnakeBest(myId, friendId)
      if (!row) {
        setCoupleBoard(null)
        return
      }
      const iAmA = myId < friendId // 与 db.couplePair 的有序对规则一致
      setCoupleBoard({
        myBest: iAmA ? row.best_a : row.best_b,
        friendBest: iAmA ? row.best_b : row.best_a,
      })
    } catch {
      // 网络抖动静默重试（下一轮轮询会再拉）
    }
  }, [myId, friendId])

  // 挂载即拉一次 + 每 15 秒轮询：对方破纪录后这边自动跟上（realtime 是回合制基建，这里轮询足够）
  useEffect(() => {
    void loadCoupleBoard()
    const timer = window.setInterval(() => void loadCoupleBoard(), 15000)
    return () => window.clearInterval(timer)
  }, [loadCoupleBoard])

  skinRef.current = skinIdx

  /* ------------------------------ 全屏（仿回声洞窟） ------------------------------ */

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {})
      return
    }
    const el = stageRef.current
    if (!el) return
    void el.requestFullscreen().catch(() => {})
    if (isTouch) {
      setFsHint(true)
      window.setTimeout(() => setFsHint(false), 4000)
    }
    try {
      void (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape')
    } catch {
      // 不支持方向锁定：忽略，全屏本身已生效
    }
  }, [isTouch])

  /** 监听常驻：任何进入/退出（含 Esc）都同步 state，杜绝假全屏 */
  useEffect(() => {
    const onFs = () => {
      const fs = Boolean(document.fullscreenElement)
      setFullscreen(fs)
      if (!fs) setFsHint(false)
      else {
        // 进入全屏重置摇杆残留状态（摇杆元素随条件渲染重挂载，监听由 Hook 自动重接）
        joyVecRef.current = { x: 0, y: 0, len: 0 }
        if (joyThumbRef.current) joyThumbRef.current.style.transform = 'translate(0px, 0px)'
      }
    }
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  /** 返回开始页时顺带退出全屏 */
  useEffect(() => {
    if (phase !== 'intro') return
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
  }, [phase])

  /* ------------------------------ 开局 ------------------------------ */

  const startGame = useCallback(() => {
    const player = makeSnake(WORLD / 2, WORLD / 2, SKINS[skinRef.current].body, true)
    const w: World = {
      player,
      snakes: [player],
      foods: [],
      particles: [],
      floats: [],
      camera: { x: WORLD / 2, y: WORLD / 2 },
      mouse: { x: W / 2, y: H / 2 },
      score: 0,
      kills: 0,
      boostEnergy: 1,
      gameOver: false,
    }
    for (let i = 0; i < FOOD_COUNT; i++) {
      w.foods.push({ x: rand(50, WORLD - 50), y: rand(50, WORLD - 50), r: rand(4, 7), color: AI_COLORS[Math.floor(Math.random() * AI_COLORS.length)], wob: Math.random() * 6.28 })
    }
    for (let i = 0; i < AI_COUNT; i++) {
      let x = 0
      let y = 0
      let tries = 0
      do {
        x = rand(200, WORLD - 200)
        y = rand(200, WORLD - 200)
        tries++
      } while (dist({ x, y }, player.body[0]) < 500 && tries < 30)
      const s = makeSnake(x, y, AI_COLORS[i % AI_COLORS.length], false, AI_NAMES[i % AI_NAMES.length])
      s.targetLen = rand(15, 45)
      w.snakes.push(s)
    }
    wRef.current = w
    sprintTouchRef.current = false
    sprintMouseRef.current = false
    spaceRef.current = false
    setDead(null)
    setHud({ len: 12, kills: 0, score: 0, rank: '-' })
    setPhase('playing')
  }, [])

  /* ------------------------------ 主循环 ------------------------------ */

  useEffect(() => {
    if (phase !== 'playing') return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const burst = (x: number, y: number, color: string, n: number, speed = 180) => {
      const w = wRef.current
      if (!w) return
      for (let i = 0; i < n; i++) {
        const ang = rand(0, Math.PI * 2)
        const spd = rand(40, speed)
        w.particles.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: rand(0.3, 0.8), maxLife: 0.8, r: rand(2, 4), color })
      }
    }
    const floatText = (x: number, y: number, text: string, color: string) => {
      wRef.current?.floats.push({ x, y, text, color, life: 1.2, maxLife: 1.2, vy: -40 })
    }
    const deathDrop = (s: Snake) => {
      const w = wRef.current
      if (!w) return
      for (let i = 0; i < s.body.length; i += 2) {
        const p = s.body[i]
        w.foods.push({ x: p.x + rand(-8, 8), y: p.y + rand(-8, 8), r: rand(4, 7), color: s.color, wob: Math.random() * 6.28 })
      }
    }
    const killSnake = (s: Snake, reason: string | null) => {
      const w = wRef.current
      if (!w || !s.alive) return
      s.alive = false
      deathDrop(s)
      burst(s.body[0].x, s.body[0].y, s.color, 30, 300)
      if (s.isPlayer) {
        const len = Math.round(s.targetLen)
        setBest((b) => {
          if (len > b) {
            try {
              localStorage.setItem(BEST_KEY, String(len))
            } catch {
              // ignore
            }
            return len
          }
          return b
        })
        w.gameOver = true
        setDead({ len, kills: w.kills, score: Math.floor(w.score), reason: reason ?? '你死了' })
        sfx.lose()
        // 成绩上云（超过历史最高才写入）：对方 15 秒内轮询到新纪录
        if (myId && friendId) {
          void submitCoupleSnakeBest(myId, friendId, myId, Math.floor(w.score))
            .catch(() => {})
            .finally(() => window.setTimeout(() => void loadCoupleBoard(), 600))
        }
      }
    }

    const update = (dt: number) => {
      const w = wRef.current
      if (!w || w.gameOver) return

      w.camera.x += (w.player.body[0].x - w.camera.x) * Math.min(1, dt * 6)
      w.camera.y += (w.player.body[0].y - w.camera.y) * Math.min(1, dt * 6)

      /* 转向：触屏摇杆优先（向量每帧由摇杆 rAF 刷新，连续变向即时生效），桌面鼠标（画布中心为基准） */
      const joy = joyVecRef.current
      if (joy.len >= 0.12) {
        w.player.angle = Math.atan2(joy.y, joy.x)
      } else {
        const dx = w.mouse.x - W / 2
        const dy = w.mouse.y - H / 2
        if (Math.hypot(dx, dy) > 8) w.player.angle = Math.atan2(dy, dx)
      }

      /* 冲刺能量 */
      const wantBoost = spaceRef.current || sprintTouchRef.current || sprintMouseRef.current
      w.player.boost = wantBoost && w.player.targetLen > 10 && w.boostEnergy > 0.05
      if (w.player.boost) {
        w.boostEnergy = Math.max(0, w.boostEnergy - dt * 0.45)
        if (w.boostEnergy <= 0) w.player.boost = false
      } else {
        w.boostEnergy = Math.min(1, w.boostEnergy + dt * 0.18)
      }

      /* 每条蛇推进 */
      for (const s of w.snakes) {
        if (!s.alive) continue

        if (!s.isPlayer) {
          s.aiTimer -= dt
          if (s.aiTimer <= 0) {
            s.aiTimer = rand(0.15, 0.6)
            let target: Food | null = null
            let bestD = Infinity
            for (const f of w.foods) {
              const d = dist(s.body[0], f)
              if (d < 380 && d < bestD) {
                bestD = d
                target = f
              }
            }
            let danger: Pt | null = null
            let minD = 130
            for (const other of w.snakes) {
              if (other === s || !other.alive) continue
              for (let i = 0; i < other.body.length; i += 3) {
                const d = dist(s.body[0], other.body[i])
                if (d < minD) {
                  minD = d
                  danger = other.body[i]
                }
              }
            }
            if (danger) s.angle = Math.atan2(s.body[0].y - danger.y, s.body[0].x - danger.x)
            else if (target) s.angle = Math.atan2(target.y - s.body[0].y, target.x - s.body[0].x)
            else s.angle = Math.atan2(WORLD / 2 - s.body[0].y, WORLD / 2 - s.body[0].x)
          }
        }

        if (s.boost && s.targetLen > 10) {
          s.targetLen = Math.max(10, s.targetLen - 8 * dt)
          if (s.isPlayer && Math.random() < 0.3) {
            const tail = s.body[s.body.length - 1]
            burst(tail.x, tail.y, s.color, 1, 60)
          }
        }

        const speed = BASE_SPEED * (s.boost ? BOOST_MULT : 1)
        const head = s.body[0]
        const nx = head.x + Math.cos(s.angle) * speed * dt
        const ny = head.y + Math.sin(s.angle) * speed * dt
        s.body.unshift({ x: nx, y: ny })

        while (s.body.length > s.targetLen) s.body.pop()
        if (s.body.length < s.targetLen) {
          const tail = s.body[s.body.length - 1]
          s.body.push({ x: tail.x, y: tail.y })
        }

        const m = 10
        if (head.x < m || head.x > WORLD - m || head.y < m || head.y > WORLD - m) {
          killSnake(s, s.isPlayer ? '撞墙了' : null)
          continue
        }

        if (s.hitFlash > 0) s.hitFlash -= dt
      }

      /* 吃食物 */
      for (const f of w.foods) {
        f.wob += dt * 3
        for (const s of w.snakes) {
          if (!s.alive) continue
          if (dist(s.body[0], f) < HEAD_R + f.r + 2) {
            f.eaten = true
            s.targetLen = Math.min(200, s.targetLen + 1)
            if (s.isPlayer) {
              w.score += 2
              sfx.eat()
            }
            burst(f.x, f.y, f.color, 3, 80)
            break
          }
        }
      }
      w.foods = w.foods.filter((f) => !f.eaten)
      while (w.foods.length < FOOD_COUNT) {
        w.foods.push({ x: rand(50, WORLD - 50), y: rand(50, WORLD - 50), r: rand(4, 7), color: AI_COLORS[Math.floor(Math.random() * AI_COLORS.length)], wob: Math.random() * 6.28 })
      }

      /* 碰撞：冲刺撞身可反杀（长度 ≥ 对手 70%），否则撞身者死 */
      for (const s of w.snakes) {
        if (!s.alive) continue
        const head = s.body[0]
        let died = false
        for (const other of w.snakes) {
          if (other === s || !other.alive) continue
          for (let i = 4; i < other.body.length; i += 2) {
            if (dist(head, other.body[i]) < HEAD_R + 6) {
              const canCharge = s.boost && s.targetLen > other.targetLen * 0.7
              if (canCharge) {
                const gained = Math.min(60, other.targetLen * 0.5)
                s.targetLen = Math.min(200, s.targetLen + gained)
                if (s.isPlayer) {
                  w.kills++
                  w.score += Math.floor(other.targetLen * 8)
                  floatText(other.body[0].x, other.body[0].y, `+${Math.floor(other.targetLen * 8)}`, '#ffd166')
                  sfx.kill()
                }
                other.kills++
                killSnake(other, s.isPlayer ? `${s.name} 冲刺撞死了你` : null)
                s.hitFlash = 0.3
              } else {
                other.kills++
                if (s.isPlayer) {
                  killSnake(s, `你撞上了 ${other.name}`)
                } else {
                  if (other.isPlayer) {
                    w.kills++
                    w.score += Math.floor(s.targetLen * 6)
                    floatText(s.body[0].x, s.body[0].y, `+${Math.floor(s.targetLen * 6)}`, '#ffd166')
                  }
                  killSnake(s, null)
                }
              }
              died = true
              break
            }
          }
          if (died) break
        }
      }

      w.snakes = w.snakes.filter((s) => s.alive || s.isPlayer)
      while (w.snakes.filter((s) => !s.isPlayer && s.alive).length < AI_COUNT) {
        const s = makeSnake(rand(200, WORLD - 200), rand(200, WORLD - 200), AI_COLORS[Math.floor(Math.random() * AI_COLORS.length)], false, AI_NAMES[Math.floor(Math.random() * AI_NAMES.length)])
        s.targetLen = rand(15, 45)
        w.snakes.push(s)
      }

      for (let i = w.particles.length - 1; i >= 0; i--) {
        const p = w.particles[i]
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.vx *= 0.94
        p.vy *= 0.94
        p.life -= dt
        if (p.life <= 0) w.particles.splice(i, 1)
      }
      for (let i = w.floats.length - 1; i >= 0; i--) {
        const t = w.floats[i]
        t.y += t.vy * dt
        t.vy *= 0.96
        t.life -= dt
        if (t.life <= 0) w.floats.splice(i, 1)
      }
    }

    const draw = () => {
      const w = wRef.current
      if (!w) return
      ctx.fillStyle = '#06060c'
      ctx.fillRect(0, 0, W, H)

      const ox = W / 2 - w.camera.x
      const oy = H / 2 - w.camera.y
      ctx.save()
      ctx.translate(ox, oy)

      // 边界 + 网格
      ctx.strokeStyle = 'rgba(255,80,80,.35)'
      ctx.lineWidth = 5
      ctx.strokeRect(0, 0, WORLD, WORLD)
      ctx.strokeStyle = 'rgba(255,255,255,.025)'
      ctx.lineWidth = 1
      for (let x = 0; x <= WORLD; x += 100) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, WORLD)
        ctx.stroke()
      }
      for (let y = 0; y <= WORLD; y += 100) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(WORLD, y)
        ctx.stroke()
      }

      for (const f of w.foods) {
        const wob = Math.sin(f.wob) * 1.5
        ctx.fillStyle = f.color
        ctx.beginPath()
        ctx.arc(f.x, f.y, f.r + wob, 0, Math.PI * 2)
        ctx.fill()
      }

      for (const p of w.particles) {
        const a = Math.max(0, p.life / p.maxLife)
        ctx.globalAlpha = a
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r * a, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      // 蛇
      for (const s of w.snakes) {
        if (!s.alive) continue
        const bodyLen = s.body.length
        for (let i = bodyLen - 1; i >= 0; i--) {
          const p = s.body[i]
          const t = i / bodyLen
          const r = HEAD_R - t * 4
          ctx.fillStyle = s.color
          ctx.globalAlpha = 0.45 + (1 - t) * 0.55
          ctx.beginPath()
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.globalAlpha = 1

        const h = s.body[0]
        if (s.boost) {
          const glow = ctx.createRadialGradient(h.x, h.y, 4, h.x, h.y, HEAD_R * 2.5)
          glow.addColorStop(0, `${s.color}99`)
          glow.addColorStop(1, `${s.color}00`)
          ctx.fillStyle = glow
          ctx.beginPath()
          ctx.arc(h.x, h.y, HEAD_R * 2.5, 0, Math.PI * 2)
          ctx.fill()
        }
        const g = ctx.createRadialGradient(h.x - 4, h.y - 4, 2, h.x, h.y, HEAD_R)
        g.addColorStop(0, '#fff')
        g.addColorStop(0.4, s.color)
        g.addColorStop(1, shade(s.color, -0.3))
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(h.x, h.y, HEAD_R, 0, Math.PI * 2)
        ctx.fill()

        if (s.hitFlash > 0) {
          ctx.strokeStyle = `rgba(255,255,255,${s.hitFlash * 3})`
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.arc(h.x, h.y, HEAD_R + 6, 0, Math.PI * 2)
          ctx.stroke()
        }

        const ex = Math.cos(s.angle + 0.5) * 6
        const ey = Math.sin(s.angle + 0.5) * 6
        const ex2 = Math.cos(s.angle - 0.5) * 6
        const ey2 = Math.sin(s.angle - 0.5) * 6
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.arc(h.x + ex, h.y + ey, 3.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(h.x + ex2, h.y + ey2, 3.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#000'
        ctx.beginPath()
        ctx.arc(h.x + ex * 1.2, h.y + ey * 1.2, 1.8, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(h.x + ex2 * 1.2, h.y + ey2 * 1.2, 1.8, 0, Math.PI * 2)
        ctx.fill()

        if (s.body.length > 6) {
          ctx.fillStyle = 'rgba(255,255,255,.85)'
          ctx.font = 'bold 12px system-ui'
          ctx.textAlign = 'center'
          ctx.fillText(s.name, h.x, h.y - 24)
        }
      }

      for (const t of w.floats) {
        const a = Math.max(0, t.life / t.maxLife)
        ctx.globalAlpha = a
        ctx.fillStyle = t.color
        ctx.font = 'bold 20px system-ui'
        ctx.textAlign = 'center'
        ctx.fillText(t.text, t.x, t.y)
      }
      ctx.globalAlpha = 1

      ctx.restore()

      // 排行榜 top6（画在画布右上，全屏同样可见）
      const sorted = w.snakes.filter((s) => s.alive).sort((a, b) => b.targetLen - a.targetLen).slice(0, 6)
      const LBW = 150
      const LBH = 24 + sorted.length * 18
      ctx.fillStyle = 'rgba(0,0,0,.55)'
      ctx.beginPath()
      ctx.roundRect(W - LBW - 14, 14, LBW, LBH, 10)
      ctx.fill()
      ctx.fillStyle = '#ffd166'
      ctx.font = 'bold 12px system-ui'
      ctx.textAlign = 'left'
      ctx.fillText('排行榜', W - LBW - 2, 30)
      sorted.forEach((s, i) => {
        const y = 48 + i * 18
        ctx.fillStyle = s.isPlayer ? '#00e5ff' : '#bbb'
        ctx.font = s.isPlayer ? 'bold 12px system-ui' : '12px system-ui'
        const nm = s.isPlayer ? '你' : s.name
        ctx.fillText(`${i + 1}. ${nm}`, W - LBW - 2, y)
        ctx.textAlign = 'right'
        ctx.fillText(String(Math.round(s.targetLen)), W - 16, y)
        ctx.textAlign = 'left'
      })

      // 冲刺能量条（底部居中）
      const BW = 180
      const bx = W / 2 - BW / 2
      const by = H - 24
      ctx.fillStyle = 'rgba(255,255,255,.12)'
      ctx.beginPath()
      ctx.roundRect(bx, by, BW, 8, 4)
      ctx.fill()
      const bg = ctx.createLinearGradient(bx, 0, bx + BW, 0)
      bg.addColorStop(0, '#06d6a0')
      bg.addColorStop(1, '#4cc9f0')
      ctx.fillStyle = bg
      ctx.beginPath()
      ctx.roundRect(bx, by, Math.max(2, BW * w.boostEnergy), 8, 4)
      ctx.fill()

      // 小地图：紧跟在排行榜面板下方（排行榜高度随行数变化，硬编码偏移会被遮挡）
      const MM = 120
      const mmx = W - MM - 14
      const mmy = 14 + 24 + sorted.length * 18 + 10
      ctx.fillStyle = 'rgba(0,0,0,.5)'
      ctx.fillRect(mmx, mmy, MM, MM)
      ctx.strokeStyle = 'rgba(255,255,255,.2)'
      ctx.strokeRect(mmx, mmy, MM, MM)
      for (const s of w.snakes) {
        if (!s.alive) continue
        const h = s.body[0]
        ctx.fillStyle = s.isPlayer ? '#fff' : s.color
        ctx.beginPath()
        ctx.arc(mmx + (h.x / WORLD) * MM, mmy + (h.y / WORLD) * MM, s.isPlayer ? 3 : 2, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    let raf = 0
    let last = performance.now()
    let hudAcc = 0
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      update(dt)
      draw()
      // HUD 5Hz 进 React（画布内的排行榜/能量条每帧自绘）
      hudAcc += dt
      if (hudAcc > 0.2) {
        hudAcc = 0
        const w = wRef.current
        if (w && !w.gameOver) {
          const sorted = w.snakes.filter((s) => s.alive).sort((a, b) => b.targetLen - a.targetLen)
          setHud({
            len: Math.round(w.player.targetLen),
            kills: w.kills,
            score: Math.floor(w.score),
            rank: `${sorted.indexOf(w.player) + 1}/${sorted.length}`,
          })
        }
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [phase])

  /* ------------------------------ 输入 ------------------------------ */

  // 键盘：空格冲刺
  useEffect(() => {
    if (phase !== 'playing') return
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        spaceRef.current = true
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceRef.current = false
    }
    const blur = () => {
      spaceRef.current = false
      sprintTouchRef.current = false
      sprintMouseRef.current = false
      joyVecRef.current = { x: 0, y: 0, len: 0 }
      if (joyThumbRef.current) joyThumbRef.current.style.transform = 'translate(0px, 0px)'
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // 画布鼠标：转向（按 CSS 缩放换算成画布内部坐标）+ 按住左键冲刺。
  // 只认 mouse 指针：全屏触屏时手指划过画布若也写 mouse，摇杆回到死区会
  // 立刻切到这条陈旧鼠标基准，方向乱跳（竖屏摇杆在画布外所以没这个问题）
  const canvasPointer = {
    onPointerMove: (e: RPointerEvent) => {
      if (e.pointerType !== 'mouse') return
      const canvas = canvasRef.current
      const w = wRef.current
      if (!canvas || !w) return
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0) return
      w.mouse.x = ((e.clientX - rect.left) * W) / rect.width
      w.mouse.y = ((e.clientY - rect.top) * H) / rect.height
    },
    onPointerDown: (e: RPointerEvent) => {
      if (e.pointerType === 'mouse') sprintMouseRef.current = true
    },
    onPointerUp: () => {
      sprintMouseRef.current = false
    },
    onPointerCancel: () => {
      sprintMouseRef.current = false
    },
  }

  /* ------------------------------ 渲染 ------------------------------ */

  const pickSkin = (i: number) => {
    setSkinIdx(i)
    try {
      localStorage.setItem(SKIN_KEY, String(i))
    } catch {
      // ignore
    }
    const w = wRef.current
    if (w && w.player.alive) w.player.color = SKINS[i].body
  }

  if (phase === 'intro') {
    return (
      <div className="space-y-4">
        <div>
          <div className="mb-1.5 text-xs font-medium text-slate-500">选个皮肤</div>
          <div className="flex flex-wrap gap-2">
            {SKINS.map((s, i) => (
              <button
                key={s.name}
                type="button"
                title={s.name}
                onClick={() => pickSkin(i)}
                className={`h-9 w-9 rounded-lg transition ${i === skinIdx ? 'ring-2 ring-slate-700 ring-offset-2' : 'ring-1 ring-slate-200'}`}
                style={{ background: s.body }}
              />
            ))}
          </div>
        </div>
        {coupleBoard && (
          <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">💞 情侣排行榜 · 历史最高分</span>
              <span className="text-[10px] text-slate-400">自动刷新</span>
            </div>
            <div className="space-y-1.5">
              {(
                [
                  { name: '我', score: coupleBoard.myBest, me: true },
                  { name: friendName || 'TA', score: coupleBoard.friendBest, me: false },
                ] as Array<{ name: string; score: number; me: boolean }>
              )
                .sort((a, b) => b.score - a.score)
                .map((entry, idx) => (
                  <div key={entry.name} className="flex items-center justify-between text-xs">
                    <span className={entry.me ? 'font-semibold text-emerald-600' : 'text-slate-500'}>
                      {idx === 0 ? '🥇' : '🥈'} {entry.name}
                    </span>
                    <span className={`tabular-nums ${entry.me ? 'font-semibold text-emerald-600' : 'text-slate-500'}`}>{entry.score}</span>
                  </div>
                ))}
            </div>
          </div>
        )}
        <button type="button" className="w-full rounded-xl bg-emerald-500 py-3 font-semibold text-white transition active:bg-emerald-600" onClick={startGame}>
          开始游戏
        </button>
        <p className="text-center text-[11px] leading-relaxed text-slate-400">
          桌面：鼠标转向 · 空格冲刺
          <br />
          手机：点 ⛶ 横屏全屏，左下摇杆转向 · 按住右半屏冲刺{best > 0 ? ` · 历史最长 ${best}` : ''}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* HUD（非全屏） */}
      {!fullscreen && (
        <div className="flex flex-wrap items-center justify-between gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs">
          <div className="flex items-center gap-3 font-medium">
            <span className="text-emerald-600">🐍 长度 {hud.len}</span>
            <span className="text-slate-500">击杀 {hud.kills}</span>
            <span className="text-slate-500">分数 {hud.score}</span>
            <span className="text-slate-500">排名 {hud.rank}</span>
            {best > 0 && <span className="text-slate-400">最佳 {best}</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-500 transition active:bg-slate-100" onClick={toggleFullscreen} title="横屏全屏">
              ⛶
            </button>
            <button type="button" className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-500 transition active:bg-slate-100" onClick={() => setPhase('intro')}>
              退出
            </button>
          </div>
        </div>
      )}

      {/* 舞台 */}
      <div
        ref={stageRef}
        className={
          fullscreen ? 'fixed inset-0 z-[60] flex items-center justify-center bg-black' : 'relative overflow-hidden rounded-2xl bg-black ring-1 ring-emerald-400/20'
        }
      >
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="block cursor-crosshair touch-none select-none"
          style={fullscreen ? { aspectRatio: `${W} / ${H}`, width: `min(100vw, calc(100vh * ${W / H}))` } : { aspectRatio: `${W} / ${H}`, width: '100%' }}
          {...canvasPointer}
        />

        {/* 全屏顶部：退出按钮（排行榜在右上画布内，✕ 放左上） */}
        {fullscreen && (
          <button
            type="button"
            className="absolute left-2 top-2 z-10 rounded-md border border-white/20 bg-black/60 px-2 py-1 text-slate-200 transition active:bg-slate-700/60"
            onClick={toggleFullscreen}
            title="退出全屏"
          >
            ✕
          </button>
        )}

        {/* 全屏触屏：左下摇杆 + 右半屏按住冲刺（无实体按钮） */}
        {isTouch && fullscreen && (
          <>
            <div
              ref={setJoyBaseEl}
              className="absolute bottom-4 left-4 flex h-28 w-28 touch-none select-none items-center justify-center rounded-full border border-white/20 bg-slate-900/50"
            >
              <span className="pointer-events-none absolute text-[10px] text-white/30">转向</span>
              <div ref={joyThumbRef} className="pointer-events-none h-12 w-12 rounded-full border border-white/30 bg-white/25 shadow-inner" />
            </div>
            <div
              className="absolute inset-y-0 right-0 w-1/2 touch-none select-none"
              onPointerDown={(e) => {
                e.preventDefault()
                sprintTouchRef.current = true
                e.currentTarget.setPointerCapture(e.pointerId)
              }}
              onPointerUp={() => {
                sprintTouchRef.current = false
              }}
              onPointerCancel={() => {
                sprintTouchRef.current = false
              }}
            >
              <span className="pointer-events-none absolute bottom-5 right-6 text-[11px] tracking-widest text-white/25">按住冲刺</span>
            </div>
          </>
        )}

        {/* 全屏横屏提示 */}
        {fullscreen && fsHint && (
          <div className="pointer-events-none absolute left-1/2 top-12 -translate-x-1/2 whitespace-nowrap rounded-lg bg-black/70 px-3 py-1.5 text-[11px] text-amber-200 ring-1 ring-amber-400/40">
            建议打开手机「自动旋转」并横过来玩，摇杆与冲刺区已就位
          </div>
        )}

        {/* 死亡结算：必须在舞台内部——全屏时只有全屏元素的后代才会渲染在全屏层，
            放外面的话全屏下弹窗被挡住，退出全屏才看得到 */}
        {dead && (
          <div className="absolute inset-0 z-30 flex touch-none items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="animate-slide-up w-full max-w-xs space-y-3 rounded-2xl border border-emerald-400/30 bg-slate-900 p-5 text-center shadow-xl">
              <div className="text-4xl">💀</div>
              <p className="font-bold tracking-widest text-emerald-200">{dead.reason}</p>
              <div className="tabular-nums text-xs text-slate-400">
                长度 {dead.len} · 击杀 {dead.kills} · 分数 {dead.score}
                <br />
                历史最长：{best}
                {coupleBoard && (
                  <>
                    <br />
                    情侣榜 · 我 {coupleBoard.myBest} · {friendName || 'TA'} {coupleBoard.friendBest}
                  </>
                )}
              </div>
              <button type="button" className="w-full rounded-lg border border-emerald-400/40 bg-emerald-500/15 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/25" onClick={startGame}>
                再来一局
              </button>
              <button type="button" className="btn-ghost w-full py-2 text-xs" onClick={() => setPhase('intro')}>
                返回开始页
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 触屏非全屏：摇杆 + 冲刺放画面下方，不遮挡 */}
      {isTouch && !fullscreen && (
        <div className="flex items-center justify-between gap-4 px-2">
          <div
            ref={setJoyBaseEl}
            className="relative flex h-24 w-24 touch-none select-none items-center justify-center rounded-full border border-emerald-300/60 bg-emerald-50"
          >
            <span className="pointer-events-none absolute text-[10px] text-emerald-300">转向</span>
            <div ref={joyThumbRef} className="pointer-events-none h-10 w-10 rounded-full border border-emerald-300 bg-emerald-200/70 shadow-inner" />
          </div>
          <button
            type="button"
            className="flex h-20 w-20 touch-none select-none items-center justify-center rounded-full border border-cyan-400/60 bg-cyan-500/15 text-xs font-bold tracking-widest text-cyan-600 transition active:bg-cyan-500/35"
            onPointerDown={(e) => {
              e.preventDefault()
              sprintTouchRef.current = true
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerUp={(e) => {
              e.preventDefault()
              sprintTouchRef.current = false
            }}
            onPointerCancel={() => {
              sprintTouchRef.current = false
            }}
          >
            冲刺
          </button>
        </div>
      )}

    </div>
  )
}
