import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { addCoupleGameScore } from '../lib/db'
import { setSfxEnabled, sfx, sfxEnabled, subscribeSfx } from '../lib/sfx'
import GameLeaderboard from './GameLeaderboard'

/**
 * 合成大西瓜：复刻原版玩法的单机小游戏，纯 Canvas + 自写 2D 圆形物理（不引入物理引擎依赖）。
 *
 * 玩法与原版一致：
 * - 顶部有一枚待放水果，点击 / 触屏指定下落位置，水果受重力自由下落
 * - 两个同款水果相碰合成上一级更大的水果，链路：葡萄→樱桃→橙子→柠檬→猕猴桃→
 *   番茄→桃子→菠萝→椰子→西瓜；两个西瓜相碰直接消除并大加分
 * - 水果堆积超过顶部警戒线（静止超过一小段时间）即游戏结束
 *
 * 物理说明（为什么这么做能「柔和且稳定」）：
 * - 固定时间步长（1/60s）积分，帧率波动不影响手感
 * - 碰撞用「位置分离 + 低弹性冲量」求解，弹性系数极低（e≈0.05）所以堆积不弹跳
 * - 每帧对全部接触对迭代求解 3 次，堆叠的水果能稳定收敛、不抽搐
 * - 速度做了上限与阻尼，避免极端穿透
 *
 * 坐标系：逻辑单位 宽 100 × 高 150（y 向下），渲染时线性映射到 Canvas 实际像素，
 * 任何屏幕宽度下物理表现一致。
 */

/* ------------------------------ 基础配置 ------------------------------ */

/** 逻辑画布尺寸（单位与世界一致，y 向下） */
const W = 100
const H = 150

/** 警戒线高度（y 值）：水果静止堆积高于这条线一小段时间即判负 */
const LINE_Y = 18

/** 静止越线判定需要持续的时间（秒）：给下落中的水果留出穿过警戒线的时间 */
const LINE_GRACE = 1.2

/** 重力加速度（逻辑单位 / s²）：柔和不生硬 */
const GRAVITY = 110

/** 碰撞弹性系数：极低，水果落地几乎不弹，堆积稳定 */
const RESTITUTION = 0.05

/** 侧壁 / 地面的反弹衰减 */
const BOUNCE_WALL = 0.2
const BOUNCE_FLOOR = 0.15
const FLOOR_FRICTION = 0.92

/** 单帧物理迭代次数：多迭代几轮让堆叠更稳定 */
const SOLVER_ITERATIONS = 3

/** 释放冷却（秒）：落一枚之后隔一会儿才能放下一枚 */
const DROP_COOLDOWN = 0.55

/** 待放水果只会随机出现前 5 种（葡萄 ~ 猕猴桃），和原版一致 */
const SPAWN_MAX_LEVEL = 5

/** 每级水果：半径（逻辑单位）、颜色、圆心文字、文字颜色 */
const FRUITS = [
  { name: '葡萄', label: '葡', r: 4.2, color: '#a78bfa', textColor: '#ffffff' },
  { name: '樱桃', label: '樱', r: 5.4, color: '#f87171', textColor: '#ffffff' },
  { name: '橙子', label: '橙', r: 6.8, color: '#fb923c', textColor: '#ffffff' },
  { name: '柠檬', label: '柠', r: 8.4, color: '#fde047', textColor: '#92400e' },
  { name: '猕猴桃', label: '猕', r: 10.2, color: '#a3e635', textColor: '#3f6212' },
  { name: '番茄', label: '茄', r: 12.2, color: '#ef4444', textColor: '#ffffff' },
  { name: '桃子', label: '桃', r: 14.4, color: '#f9a8d4', textColor: '#9d174d' },
  { name: '菠萝', label: '菠', r: 16.8, color: '#fbbf24', textColor: '#78350f' },
  { name: '椰子', label: '椰', r: 19.4, color: '#b45309', textColor: '#ffffff' },
  { name: '西瓜', label: '西', r: 22.2, color: '#22c55e', textColor: '#ffffff' },
] as const

/** 场上单个水果 */
interface Fruit {
  id: number
  /** 水果等级（0 = 葡萄 … 9 = 西瓜） */
  level: number
  x: number
  y: number
  vx: number
  vy: number
  /** 半径（逻辑单位），冗余存一份省得每次查表 */
  r: number
  /** 已存在时长（秒）：刚释放的水果穿警戒线不算危险 */
  age: number
}

/** 最高分本地存储 key */
const BEST_KEY = 'couple-watermelon-best'

const loadBest = (): number => {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0
  } catch {
    return 0
  }
}

interface Props {
  myId: string
  friendId: string
  names: Record<string, string>
}

export default function WatermelonGame({ myId, friendId, names }: Props) {
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(loadBest)
  const [over, setOver] = useState(false)
  /** 下一个待放水果的等级（预览用） */
  const [nextLevel, setNextLevel] = useState(0)
  const [sfxOn, setSfxOn] = useState(sfxEnabled)
  const [lbVersion, setLbVersion] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  /* ------------------------- 游戏内可变状态（ref，循环里直接读写） ------------------------- */

  /** 场上全部水果 */
  const fruitsRef = useRef<Fruit[]>([])
  /** 待放水果的横向位置（逻辑单位） */
  const aimRef = useRef(W / 2)
  /** 下一个待放水果等级 */
  const nextLevelRef = useRef(0)
  /** 释放冷却剩余秒数 */
  const cooldownRef = useRef(0)
  /** 分数（循环里累加，变化时同步到 state 触发渲染） */
  const scoreRef = useRef(0)
  /** 结束标记（ref + state 双份：循环里读 ref，弹窗用 state） */
  const overRef = useRef(false)
  /** 静止越线的持续时间（秒） */
  const dangerRef = useRef(0)
  /** 成绩是否已经上报（一局只上报一次） */
  const reportedRef = useRef(false)
  /** 水果 id 发生器 */
  const idSeed = useRef(1)

  /* ------------------------------ 物理求解 ------------------------------ */

  /** 推进一帧物理：积分 → 边界 → 碰撞/合并（多轮迭代） */
  const stepPhysics = useCallback((dt: number) => {
    const fruits = fruitsRef.current

    // 1. 积分：重力 + 阻尼 + 位移；处理四周边界（低弹性反弹 + 地面摩擦）
    for (const f of fruits) {
      f.vy += GRAVITY * dt
      // 阻尼：让运动整体柔和一点
      f.vx *= 0.999
      f.vy *= 0.999
      // 速度上限：防止极端情况穿透（比最大水果直径略小）
      const vmax = 60
      f.vx = Math.max(-vmax, Math.min(vmax, f.vx))
      f.vy = Math.max(-vmax, Math.min(vmax, f.vy))
      f.x += f.vx * dt
      f.y += f.vy * dt
      f.age += dt

      if (f.x < f.r) {
        f.x = f.r
        f.vx = Math.abs(f.vx) * BOUNCE_WALL
      } else if (f.x > W - f.r) {
        f.x = W - f.r
        f.vx = -Math.abs(f.vx) * BOUNCE_WALL
      }
      if (f.y > H - f.r) {
        f.y = H - f.r
        f.vy = -Math.abs(f.vy) * BOUNCE_FLOOR
        f.vx *= FLOOR_FRICTION
      } else if (f.y < f.r) {
        f.y = f.r
        f.vy = Math.abs(f.vy) * BOUNCE_WALL
      }
    }

    // 2. 碰撞：位置分离 + 低弹性冲量；同级水果接触则标记合并
    const mergePairs: Array<[number, number]> = []
    const consumed = new Set<number>()
    for (let iter = 0; iter < SOLVER_ITERATIONS; iter++) {
      for (let i = 0; i < fruits.length; i++) {
        const a = fruits[i]
        for (let j = i + 1; j < fruits.length; j++) {
          const b = fruits[j]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const dist = Math.hypot(dx, dy) || 0.0001
          const min = a.r + b.r
          if (dist >= min) continue

          // 同级相碰 → 合并（每个水果一帧只参与一次合并）
          if (a.level === b.level && iter === 0 && !consumed.has(i) && !consumed.has(j)) {
            consumed.add(i)
            consumed.add(j)
            mergePairs.push([i, j])
            continue
          }

          // 碰撞法线
          const nx = dx / dist
          const ny = dy / dist
          const overlap = min - dist
          // 用半径平方近似质量：大的水果更重，分离时被推得更少
          const ma = a.r * a.r
          const mb = b.r * b.r
          const total = ma + mb
          // 位置分离：只推一部分（0.4），靠多轮迭代收敛，避免一次推满导致抖动
          const push = overlap * 0.4
          a.x -= nx * push * (mb / total)
          a.y -= ny * push * (mb / total)
          b.x += nx * push * (ma / total)
          b.y += ny * push * (ma / total)

          // 法向冲量：相对速度朝向彼此时才施加，弹性极低 → 堆积柔和
          const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny
          if (rel < 0) {
            const impulse = (-(1 + RESTITUTION) * rel) / (1 / ma + 1 / mb)
            a.vx += (impulse / ma) * nx
            a.vy += (impulse / ma) * ny
            b.vx -= (impulse / mb) * nx
            b.vy -= (impulse / mb) * ny
          }
        }
      }
    }

    // 3. 执行合并：新水果出现在两枚的中心，速度取平均（动量近似守恒）
    if (mergePairs.length > 0) {
      const survivors = fruits.filter((_, idx) => !consumed.has(idx))
      const spawned: Fruit[] = []
      for (const [i, j] of mergePairs) {
        const a = fruits[i]
        const b = fruits[j]
        if (a.level === FRUITS.length - 1) {
          // 两个西瓜：整对消除，大加分
          scoreRef.current += 100
          sfx.win()
          continue
        }
        const level = a.level + 1
        const def = FRUITS[level]
        spawned.push({
          id: idSeed.current++,
          level,
          x: (a.x + b.x) / 2,
          // 别让新水果出生在地面以下
          y: Math.min((a.y + b.y) / 2, H - def.r - 0.2),
          vx: (a.vx + b.vx) / 2,
          vy: (a.vy + b.vy) / 2,
          r: def.r,
          age: 0,
        })
        scoreRef.current += level + 1
        sfx.merge(level)
      }
      fruitsRef.current = [...survivors, ...spawned]
      // 统一同步：不管是合出新水果还是消掉两个西瓜，UI 分数都要跟着跳
      setScore(scoreRef.current)
    }
  }, [])

  /** 警戒线判定：有水果（出生 1 秒后）静止停在警戒线上方，持续一段时间即结束 */
  const checkDanger = useCallback(
    (dt: number) => {
      if (overRef.current) return
      let danger = false
      for (const f of fruitsRef.current) {
        if (f.age > 1 && f.y - f.r < LINE_Y && Math.abs(f.vx) < 14 && Math.abs(f.vy) < 14) {
          danger = true
          break
        }
      }
      dangerRef.current = danger ? dangerRef.current + dt : 0
      if (dangerRef.current >= LINE_GRACE) endGame()
    },
    // endGame 在下面定义，用函数声明提升的方式引用
    []
  )

  /** 结束一局：锁状态、播音效、上报情侣榜 */
  function endGame() {
    if (overRef.current) return
    overRef.current = true
    setOver(true)
    sfx.lose()

    // 更新本地最高分
    const final = Math.round(scoreRef.current)
    if (final > loadBest()) {
      try {
        localStorage.setItem(BEST_KEY, String(final))
        setBest(final)
      } catch {
        // ignore
      }
    }

    // 上报成绩（0 分不上、未配对不上）
    if (final <= 0 || !myId || !friendId || reportedRef.current) return
    reportedRef.current = true
    void addCoupleGameScore({
      userA: myId,
      userB: friendId,
      game: 'bigwatermelon',
      playerId: myId,
      score: final,
      detail: '合成大西瓜',
    })
      .then(() => setLbVersion((v) => v + 1))
      .catch(() => {
        // 上传失败不影响游戏
      })
  }

  /* ------------------------------ 游戏循环 ------------------------------ */

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let last = performance.now()
    let acc = 0
    const FIXED = 1 / 60

    const loop = (now: number) => {
      // 帧间隔上限 0.1s：切后台回来不会一次补一大步把物理算炸
      const frame = Math.min(0.1, (now - last) / 1000)
      last = now
      acc += frame
      // 固定步长推进物理；步数封顶防止极端卡顿后的螺旋死亡
      let steps = 0
      while (acc >= FIXED && steps < 5) {
        if (!overRef.current) {
          stepPhysics(FIXED)
          // 释放冷却计时
          cooldownRef.current = Math.max(0, cooldownRef.current - FIXED)
        }
        checkDanger(FIXED)
        acc -= FIXED
        steps += 1
      }
      render(canvas, ctx)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [stepPhysics, checkDanger])

  /** 画布随容器尺寸 / 屏幕像素密度调整，保证在手机上也清晰。
   *  用 ResizeObserver 监听容器宽度：横竖屏切换、布局变化都能及时重算 */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      const width = canvas.clientWidth
      if (!width) return
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(((width * H) / W) * dpr)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  /* ------------------------------ 渲染 ------------------------------ */

  function render(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    const scale = canvas.width / W
    ctx.setTransform(scale, 0, 0, scale, 0, 0)

    // 背景：柔和的瓜田渐变
    const bg = ctx.createLinearGradient(0, 0, 0, H)
    bg.addColorStop(0, '#fef3c7')
    bg.addColorStop(1, '#dcfce7')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)

    // 警戒线：平时浅红虚线，接近判负时加深加粗提示
    const dangerRatio = Math.min(1, dangerRef.current / LINE_GRACE)
    ctx.save()
    ctx.setLineDash([3, 2.5])
    ctx.lineWidth = 0.6 + dangerRatio * 0.9
    ctx.strokeStyle = `rgba(${220 + dangerRatio * 35}, ${60 - dangerRatio * 40}, 60, ${0.5 + dangerRatio * 0.5})`
    ctx.beginPath()
    ctx.moveTo(0, LINE_Y)
    ctx.lineTo(W, LINE_Y)
    ctx.stroke()
    ctx.restore()
    ctx.fillStyle = 'rgba(220, 60, 60, 0.65)'
    ctx.font = '3px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText('警戒线', W - 1.5, LINE_Y - 1)

    // 待放水果虚影：跟随指针，冷却中淡化表示还不能放
    if (!overRef.current) {
      const def = FRUITS[nextLevelRef.current]
      const x = Math.min(Math.max(aimRef.current, def.r + 0.5), W - def.r - 0.5)
      ctx.globalAlpha = cooldownRef.current > 0 ? 0.25 : 0.65
      drawFruit(ctx, nextLevelRef.current, x, Math.max(def.r + 1, LINE_Y - def.r - 1))
      ctx.globalAlpha = 1
    }

    // 场上水果
    ctx.textAlign = 'center'
    for (const f of fruitsRef.current) drawFruit(ctx, f.level, f.x, f.y)
  }

  /** 画一枚水果：实心圆 + 描边 + 中心文字；西瓜额外画深绿条纹增加辨识度 */
  function drawFruit(ctx: CanvasRenderingContext2D, level: number, x: number, y: number) {
    const def = FRUITS[level]
    ctx.beginPath()
    ctx.arc(x, y, def.r, 0, Math.PI * 2)
    ctx.fillStyle = def.color
    ctx.fill()
    ctx.lineWidth = 0.5
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'
    ctx.stroke()

    // 高光：左上角一点白，增加体积感
    ctx.beginPath()
    ctx.arc(x - def.r * 0.35, y - def.r * 0.4, def.r * 0.22, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.fill()

    // 西瓜条纹
    if (level === FRUITS.length - 1) {
      ctx.save()
      ctx.beginPath()
      ctx.arc(x, y, def.r, 0, Math.PI * 2)
      ctx.clip()
      ctx.strokeStyle = 'rgba(22, 101, 52, 0.5)'
      ctx.lineWidth = def.r * 0.16
      for (const off of [-0.55, 0, 0.55]) {
        ctx.beginPath()
        ctx.moveTo(x + def.r * off, y - def.r)
        ctx.quadraticCurveTo(x + def.r * off * 1.8, y, x + def.r * off, y + def.r)
        ctx.stroke()
      }
      ctx.restore()
    }

    // 中心文字
    ctx.fillStyle = def.textColor
    ctx.font = `bold ${def.r * 0.9}px sans-serif`
    ctx.textBaseline = 'middle'
    ctx.fillText(def.label, x, y + def.r * 0.05)
  }

  /* ------------------------------ 交互 ------------------------------ */

  /** 屏幕坐标 → 逻辑 x 坐标 */
  const pointerToX = (clientX: number): number => {
    const canvas = canvasRef.current
    if (!canvas) return W / 2
    const rect = canvas.getBoundingClientRect()
    return ((clientX - rect.left) / rect.width) * W
  }

  const onPointerMove = (e: React.PointerEvent) => {
    aimRef.current = pointerToX(e.clientX)
  }

  /** 点击 / 触屏：更新位置并立即释放一枚水果 */
  const onPointerDown = (e: React.PointerEvent) => {
    aimRef.current = pointerToX(e.clientX)
    drop()
  }

  /** 释放当前待放水果 */
  const drop = () => {
    if (overRef.current || cooldownRef.current > 0) return
    const level = nextLevelRef.current
    const def = FRUITS[level]
    const x = Math.min(Math.max(aimRef.current, def.r + 0.5), W - def.r - 0.5)
    fruitsRef.current.push({
      id: idSeed.current++,
      level,
      x,
      // 出生在警戒线上方，从静止开始自由下落
      y: Math.max(def.r + 1, LINE_Y - def.r - 1),
      vx: 0,
      vy: 0,
      r: def.r,
      age: 0,
    })
    cooldownRef.current = DROP_COOLDOWN
    const next = Math.floor(Math.random() * SPAWN_MAX_LEVEL)
    nextLevelRef.current = next
    setNextLevel(next)
    sfx.move()
  }

  /** 重新开始：清场归零，回到第一枚水果 */
  const restart = useCallback(() => {
    fruitsRef.current = []
    scoreRef.current = 0
    dangerRef.current = 0
    cooldownRef.current = 0
    overRef.current = false
    reportedRef.current = false
    aimRef.current = W / 2
    const next = Math.floor(Math.random() * SPAWN_MAX_LEVEL)
    nextLevelRef.current = next
    setNextLevel(next)
    setScore(0)
    setOver(false)
  }, [])

  useEffect(() => subscribeSfx(() => setSfxOn(sfxEnabled())), [])

  // 结束弹窗打开时锁住页面滚动，触摸弹窗不会带动整页滚动
  useEffect(() => {
    if (!over) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [over])

  const nextDef = FRUITS[nextLevel]

  return (
    <div className="space-y-3">
      {/* 顶部：分数 / 最高分 / 重新开始 */}
      <div className="flex items-stretch gap-2">
        <div className="flex-1 rounded-xl bg-rose-50 px-2 py-1.5 text-center">
          <div className="text-[10px] text-rose-300">分数</div>
          <div className="text-base font-bold tabular-nums text-rose-600">{score}</div>
        </div>
        <div className="flex-1 rounded-xl bg-amber-50 px-2 py-1.5 text-center">
          <div className="text-[10px] text-amber-400">最高分</div>
          <div className="text-base font-bold tabular-nums text-amber-600">{best}</div>
        </div>
        <div className="flex-1 rounded-xl bg-emerald-50 px-2 py-1.5 text-center">
          <div className="text-[10px] text-emerald-400">下一个</div>
          <div className="text-sm font-bold text-emerald-600">{nextDef.name}</div>
        </div>
        <button
          type="button"
          className="btn-ghost shrink-0 self-stretch rounded-xl px-3 text-xs"
          onClick={restart}
          title="重新开始"
        >
          🔄 重开
        </button>
        <button
          type="button"
          className="btn-ghost shrink-0 self-stretch rounded-xl px-3 text-xs"
          onClick={() => setSfxEnabled(!sfxOn)}
          title="音效开关"
        >
          {sfxOn ? '🔔' : '🔕'}
        </button>
      </div>

      {/* 游戏画布：居中，宽度撑满卡片，高度按 2:3 比例，适配移动端。
          touch-none 防止按住拖动时把页面一起滚走 */}
      <div className="overflow-hidden rounded-2xl bg-emerald-50 ring-1 ring-emerald-100">
        <canvas
          ref={canvasRef}
          className="block w-full touch-none select-none"
          style={{ aspectRatio: `${W} / ${H}` }}
          onPointerMove={onPointerMove}
          onPointerDown={onPointerDown}
        />
      </div>

      <p className="text-center text-[10px] leading-relaxed text-slate-400">
        点击 / 触屏放置水果，两个同款相碰合成更大的；葡萄 → 樱桃 → 橙子 → 柠檬 → 猕猴桃 → 番茄 → 桃子 → 菠萝 → 椰子 →
        西瓜，两个西瓜消除加 100 分。水果堆过警戒线就结束啦。
      </p>

      {/* 结束弹窗：Portal 渲染到 body（脱离外层 .card 的按压变形，fixed 不会被破坏） */}
      {over &&
        createPortal(
          <div className="fixed inset-0 z-50 flex touch-none items-center justify-center overscroll-contain bg-slate-900/45 p-4 backdrop-blur-sm">
            <div className="animate-fade w-full max-w-xs space-y-3 rounded-2xl bg-white p-5 text-center shadow-xl">
              <div className="text-4xl">{score >= best && score > 0 ? '🏆' : '🍉'}</div>
              <p className="font-bold text-slate-600">
                {score >= best && score > 0 ? `新纪录！${score} 分` : `水果堆过警戒线，本局 ${score} 分`}
              </p>
              <p className="text-[11px] text-slate-400">本局成绩会自动记入情侣排行榜</p>
              <button type="button" className="btn-primary w-full py-2 text-xs" onClick={restart}>
                确定，再来一局
              </button>
            </div>
          </div>,
          document.body
        )}

      <GameLeaderboard game="bigwatermelon" myId={myId} friendId={friendId} names={names} version={lbVersion} />
    </div>
  )
}
