import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { addCoupleGameScore, getCoupleGameProgress, saveCoupleGameProgress } from '../lib/db'
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
 * - 碰撞分两步：位置分离负责「不重叠」（允许 0.35 的贴合余量，超出部分每轮推 80%，
 *   5 轮迭代后基本完全分离，肉眼看不到边界重叠）；冲量只处理明显相对运动
 * - 关键防抖：相对速度小于 STOP_SPEED 的接触对不做冲量、只做位置分离——
 *   重力渗入产生的微小速度会被分离直接消化掉，不会来回注入能量，堆里的水果不会反复弹动
 * - 落地时微小垂直速度直接吸附清零，进一步消除「落地颤动」
 * - 速度上限 + 阻尼兜底，避免极端穿透
 *
 * 坐标系：逻辑单位 宽 100 × 高 150（y 向下），渲染时线性映射到 Canvas 实际像素，
 * 任何屏幕宽度下物理表现一致。
 */

/* ------------------------------ 基础配置 ------------------------------ */

/** 逻辑画布尺寸（单位与世界一致，y 向下） */
const W = 100
const H = 150

/** 警戒线高度（y 值）：水果静止堆积高于这条线一小段时间即判负 */
const LINE_Y = 14

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

/** 落地吸附速度：竖直速度小于它的水果落地后直接停住，不再微弹 */
const LAND_ABSORB = 2

/** 单帧物理迭代次数：多迭代几轮让堆叠更稳定、重叠收敛得更干净 */
const SOLVER_ITERATIONS = 5

/**
 * 位置分离参数：
 * - SLOP 允许的贴合余量（逻辑单位）：小于这个值的重叠不修，避免像素级抖动
 * - CORRECT 每轮推送比例：0.8 意味着一轮消掉 80% 的剩余重叠，5 轮后边界肉眼可见地贴合
 */
const SLOP = 0.35
const CORRECT = 0.8

/**
 * 冲量门槛：相对速度小于它的接触对只做位置分离、不施加冲量。
 * 这是防「反复小幅弹动」的关键——重力每帧渗入的微小速度被位置分离消化，
 * 不会在水果之间来回注入能量形成持续震颤
 */
const STOP_SPEED = 0.8

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

/* ------------------------------ 进度存档（断点续玩） ------------------------------ */

/**
 * 盘面存档：退出游戏页（返回互动入口）再进来、刷新页面都能接着玩。
 * 本地 localStorage 存一份立即可用的，远端 couple_game_progress 也存一份——
 * 清缓存 / 换设备 / 重新登录后从云端找回来；进度带日期，跨天自动作废。
 * 远端恢复和本地取「分数更高 / 盘面更满」的那份，两边谁新用谁。
 */
interface SavedState {
  day: string
  score: number
  nextLevel: number
  fruits: Array<{ l: number; x: number; y: number; vx: number; vy: number }>
}

const saveKeyFor = (userId: string) => `couple-watermelon-save-${userId}`

/** 本地日期 YYYY-MM-DD（不能用 toISOString，那是 UTC，东八区凌晨会差一天） */
const localDayKey = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const loadLocalState = (userId: string): SavedState | null => {
  try {
    const raw = JSON.parse(localStorage.getItem(saveKeyFor(userId)) ?? '') as SavedState | null
    return raw?.day === localDayKey() && Array.isArray(raw.fruits) ? raw : null
  } catch {
    return null
  }
}

/** 远端进度转存档结构：字段缺失 / 类型不对都按没有存档处理 */
const parseRemoteState = (progress: Record<string, unknown> | null, day: string): SavedState | null => {
  if (!progress || progress.day !== day) return null
  const fruits = progress.fruits
  if (!Array.isArray(fruits)) return null
  return {
    day,
    score: typeof progress.score === 'number' ? progress.score : 0,
    nextLevel: typeof progress.nextLevel === 'number' ? progress.nextLevel : 0,
    fruits: fruits.filter(
      (f): f is SavedState['fruits'][number] =>
        !!f &&
        typeof f === 'object' &&
        typeof (f as SavedState['fruits'][number]).l === 'number' &&
        typeof (f as SavedState['fruits'][number]).x === 'number' &&
        typeof (f as SavedState['fruits'][number]).y === 'number'
    ),
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
  /** 存档节流计时器 */
  const saveTimerRef = useRef(0)
  /** 水果 id 发生器 */
  const idSeed = useRef(1)
  /* 存档相关 */
  /** 盘面有变化待保存的标记：循环里节流保存用 */
  const dirtyRef = useRef(false)
  /** 存档恢复是否已完成：完成前不写存档，防止空盘初始状态把已有进度覆盖掉 */
  const loadedRef = useRef(false)
  /** 远端恢复是否已完成 */
  const progressReadyRef = useRef(false)

  /* ------------------------------ 存档：快照 / 持久化 / 恢复 ------------------------------ */

  /** 当前局面的可序列化快照 */
  const snapshotState = useCallback((): SavedState | null => {
    if (!myId) return null
    return {
      day: localDayKey(),
      score: Math.round(scoreRef.current),
      nextLevel: nextLevelRef.current,
      fruits: fruitsRef.current.map((f) => ({
        l: f.level,
        x: Math.round(f.x * 100) / 100,
        y: Math.round(f.y * 100) / 100,
        vx: Math.round(f.vx * 100) / 100,
        vy: Math.round(f.vy * 100) / 100,
      })),
    }
  }, [myId])

  /** 把快照恢复到场上：重建水果对象，age 直接给 3（>1，恢复后马上参与警戒线判定） */
  const applyState = useCallback((snap: SavedState) => {
    fruitsRef.current = snap.fruits
      .filter((f) => f.l >= 0 && f.l < FRUITS.length)
      .map((f) => ({
        id: idSeed.current++,
        level: f.l,
        x: Math.min(Math.max(f.x, FRUITS[f.l].r), W - FRUITS[f.l].r),
        y: Math.min(Math.max(f.y, FRUITS[f.l].r), H - FRUITS[f.l].r),
        vx: f.vx ?? 0,
        vy: f.vy ?? 0,
        r: FRUITS[f.l].r,
        age: 3,
      }))
    scoreRef.current = snap.score
    nextLevelRef.current = Math.min(Math.max(snap.nextLevel, 0), SPAWN_MAX_LEVEL - 1)
    setScore(snap.score)
    setNextLevel(nextLevelRef.current)
  }, [])

  /** 保存当前局面：本地必存；远端在恢复完成后才写（防止空盘覆盖云端进度） */
  const persistState = useCallback(
    (force = false) => {
      if (!myId) return
      if (!dirtyRef.current && !force) return
      dirtyRef.current = false
      const snap = snapshotState()
      if (!snap) return
      try {
        localStorage.setItem(saveKeyFor(myId), JSON.stringify(snap))
      } catch {
        // 本地写不进去就只靠云端
      }
      if (!loadedRef.current || !myId || !friendId) return
      void saveCoupleGameProgress({
        userId: myId,
        friendId,
        game: 'bigwatermelon',
        day: snap.day,
        progress: { ...snap },
      }).catch(() => {
        // 云端写失败不影响游戏，下次变化会再写
      })
    },
    [myId, friendId, snapshotState]
  )

  // 恢复进度：本地先立即恢复，再用云端进度补（本地可能被清缓存清掉）
  useEffect(() => {
    if (!myId || !friendId) return
    const local = loadLocalState(myId)
    if (local) applyState(local)
    getCoupleGameProgress(myId, friendId, 'bigwatermelon', localDayKey())
      .then((p) => {
        const remote = parseRemoteState(p, localDayKey())
        // 云端那份「更新」才采用：分数更高，或分数一样但盘面更满
        const better =
          remote &&
          remote.fruits.length > 0 &&
          (!local || remote.score > local.score || (remote.score === local.score && remote.fruits.length > local.fruits.length))
        if (better && remote) applyState(remote)
      })
      .catch(() => {
        // 拉不到就用本地那份
      })
      .finally(() => {
        loadedRef.current = true
        progressReadyRef.current = true
        dirtyRef.current = true
      })
    // 只在挂载时恢复一次；today 在组件生命周期内不变
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId, friendId])

  // 组件卸载（返回互动入口、切页面）时把进度存起来
  useEffect(
    () => () => {
      persistState(true)
    },
    [persistState]
  )

  /* ------------------------------ 物理求解 ------------------------------ */

  /** 推进一帧物理：积分 → 边界 → 碰撞/合并（多轮迭代） */
  const stepPhysics = useCallback((dt: number) => {
    const fruits = fruitsRef.current

    // 1. 积分：重力 + 阻尼 + 位移；处理四周边界（低弹性反弹 + 地面摩擦 + 落地吸附）
    for (const f of fruits) {
      f.vy += GRAVITY * dt
      // 阻尼：让运动整体柔和一点，也帮助更快静止
      f.vx *= 0.995
      f.vy *= 0.995
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
        // 落地吸附：微小垂直速度直接清零，消除「落地颤动」；只有明显下落才产生小反弹
        f.vy = Math.abs(f.vy) < LAND_ABSORB ? 0 : -Math.abs(f.vy) * BOUNCE_FLOOR
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
          // 位置分离：先扣除贴合余量 SLOP，再把剩余重叠每轮推 80%——
          // 多轮迭代后边界完全贴合，肉眼看不到重叠；SLOP 之内的微小重叠不修，避免抖动
          const push = Math.max(0, overlap - SLOP) * CORRECT
          a.x -= nx * push * (mb / total)
          a.y -= ny * push * (mb / total)
          b.x += nx * push * (ma / total)
          b.y += ny * push * (ma / total)

          // 法向冲量：只有明显相互接近（rel < -STOP_SPEED）才注入速度；
          // 重力渗出的微小速度交给位置分离消化 → 堆里的水果不会反复小幅弹动
          const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny
          if (rel < -STOP_SPEED) {
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
      dirtyRef.current = true
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

  /** 上报成绩到情侣榜（0 分不上、未配对不上、一局只上报一次） */
  function reportScore(final: number) {
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

  /** 结束一局：锁状态、播音效、更新最高分并上报情侣榜 */
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
    reportScore(final)
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
          // 存档节流：每 1.5 秒把有变化的盘面落一次盘（本地 + 云端）
          saveTimerRef.current += FIXED
          if (saveTimerRef.current >= 1.5) {
            saveTimerRef.current = 0
            persistState()
          }
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
  }, [stepPhysics, checkDanger, persistState])

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
    dirtyRef.current = true
  }

  /** 重新开始：先把当前成绩记入排行榜（结束弹窗里的成绩已由 endGame 上报过），再清场开新一局 */
  const restart = useCallback(() => {
    if (!overRef.current) reportScore(Math.round(scoreRef.current))
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
    dirtyRef.current = true
    persistState(true)
    // reportScore 用到组件内的闭包变量（myId/friendId），声明提升保证拿到最新渲染的值
  }, [persistState])

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
        {/* <div className="flex-1 rounded-xl bg-amber-50 px-2 py-1.5 text-center">
          <div className="text-[10px] text-amber-400">最高分</div>
          <div className="text-base font-bold tabular-nums text-amber-600">{best}</div>
        </div> */}
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
        点击 / 触屏放置水果，水果堆过警戒线就结束啦。
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
