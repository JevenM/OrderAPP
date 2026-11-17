import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { configured } from '../lib/supabase'
import { POLL, useRealtime } from '../lib/realtime'
import {
  createCoupleTankHistory,
  fetchCoupleTank,
  notifyTankNew,
  upsertCoupleTank,
  type CoupleTankRow,
  type CoupleTankState,
  type TankProgress,
} from '../lib/db'

/* ============================== 种子随机坦克大战 ==============================
 * 参考 仓库根目录《种子随机坦克大战.html》改写：
 * - Park-Miller LCG 种子随机：同种子地形 100% 一致（联网对战的地基）
 * - 联网模式 = 同种子竞速：两张同图各自开战，实时同步对方进度与胜负
 *   （Supabase realtime/轮询是回合制基建，动作帧全量同步不现实，竞速是正确取舍）
 * - 离线模式 = 经典人机：守基地、清 20 个敌人
 * ========================================================================== */

const TILE = 24
const MAP_SIZE = 21
const TILE_EMPTY = 0
const TILE_BRICK = 1
const TILE_STEEL = 2
const TILE_BASE = 3
const SIZE = TILE * MAP_SIZE // 504

const TOTAL_ENEMIES = 20
const MAX_CONCURRENT = 4
const PLAYER_LIVES = 3

/** Park-Miller LCG：同种子跨设备序列一致（地形生成只在这里消耗随机数） */
function createRNG(seed: number) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function rectCollide(x1: number, y1: number, w1: number, h1: number, x2: number, y2: number, w2: number, h2: number) {
  return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2
}

interface Bullet {
  x: number
  y: number
  vx: number
  vy: number
  mine: boolean
  alive: boolean
}

interface Enemy {
  x: number
  y: number
  size: number
  dir: number
  speed: number
  cooldown: number
  dirTimer: number
  /** 连续没挪动的帧数：超过阈值强制重新找路（防死角卡死） */
  stuck: number
}

/** 一局对战的全部本地模拟状态（放 ref，60fps 直跑不进 React） */
interface Sim {
  map: number[][]
  player: { x: number; y: number; size: number; dir: number; speed: number; cooldown: number; lives: number; inv: number }
  enemies: Enemy[]
  bullets: Bullet[]
  score: number
  left: number
  spawned: number
  spawnTimer: number
  over: boolean
  win: boolean
  /** 本次对局的结算回调（联网模式上报用），只触发一次 */
  settled: boolean
}

/** 与参考实现完全一致的地形生成（随机数消耗顺序固定 → 同种子跨设备同图） */
function buildMap(seed: number): number[][] {
  const rng = createRNG(seed)
  const map: number[][] = Array(MAP_SIZE)
    .fill(0)
    .map(() => Array(MAP_SIZE).fill(TILE_EMPTY))
  for (let y = 0; y < MAP_SIZE - 3; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      // 预留出生点通道
      if (y < 2 && (x < 2 || (x > 9 && x < 11) || x > 18)) continue
      if (rng() < 0.32) map[y][x] = TILE_BRICK
      else if (rng() < 0.06) map[y][x] = TILE_STEEL
    }
  }
  const baseX = 10
  const baseY = 19
  map[baseY][baseX] = TILE_BASE
  for (const [dx, dy] of [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [1, 1],
  ]) {
    map[baseY + dy][baseX + dx] = TILE_BRICK
  }
  // 清空玩家出生点
  for (let dy = 0; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (map[baseY + dy] && map[baseY + dy][baseX + dx] !== TILE_BASE) map[baseY + dy][baseX + dx] = TILE_EMPTY
    }
  }
  // 清空顶部敌人出生点
  for (const [ex, ey] of [
    [0, 0],
    [10, 0],
    [20, 0],
  ]) {
    for (let dy = 0; dy <= 2; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (map[ey + dy] && map[ey + dy][ex + dx] !== undefined) map[ey + dy][ex + dx] = TILE_EMPTY
      }
    }
  }
  return map
}

function mapBlocked(map: number[][], x: number, y: number, size: number) {
  const left = Math.floor(x / TILE)
  const right = Math.floor((x + size - 1) / TILE)
  const top = Math.floor(y / TILE)
  const bottom = Math.floor((y + size - 1) / TILE)
  if (left < 0 || right >= MAP_SIZE || top < 0 || bottom >= MAP_SIZE) return true
  for (let tx = left; tx <= right; tx++) {
    for (let ty = top; ty <= bottom; ty++) {
      const t = map[ty][tx]
      if (t === TILE_BRICK || t === TILE_STEEL || t === TILE_BASE) return true
    }
  }
  return false
}

const SPAWN_POINTS: Array<[number, number]> = [
  [0, 0],
  [10, 0],
  [20, 0],
]

/** 方向 0上 1右 2下 3左 的单位位移 */
const DIR_DX = [0, 1, 0, -1]
const DIR_DY = [-1, 0, 1, 0]

function newSim(seed: number): Sim {
  const rng = createRNG(seed)
  const map = buildMap(seed)
  const sim: Sim = {
    map,
    player: { x: 10 * TILE, y: 20 * TILE, size: TILE - 2, dir: 0, speed: 2, cooldown: 0, lives: PLAYER_LIVES, inv: 60 },
    enemies: [],
    bullets: [],
    score: 0,
    left: TOTAL_ENEMIES,
    spawned: 0,
    spawnTimer: 0,
    over: false,
    win: false,
    settled: false,
  }
  const spawn = () => {
    if (sim.spawned >= TOTAL_ENEMIES) return
    const [sx, sy] = SPAWN_POINTS[Math.floor(rng() * SPAWN_POINTS.length)]
    sim.enemies.push({
      x: sx * TILE,
      y: sy * TILE,
      size: TILE - 2,
      dir: 2,
      speed: 1 + rng() * 0.8,
      cooldown: Math.floor(rng() * 60),
      dirTimer: 0,
      stuck: 0,
    })
    sim.spawned++
  }
  // 初始 3 个敌人；后续 spawn 闭包在 update 里复用
  ;(sim as Sim & { spawn: () => void }).spawn = spawn
  spawn()
  spawn()
  spawn()
  return sim
}

interface Props {
  myId: string
  friendId: string
  friendName: string
  myName: string
}

type Mode = 'select' | 'offline' | 'online'

const BEST_KEY = 'couple-tank-best'

export default function TankBattle({ myId, friendId, friendName, myName }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simRef = useRef<Sim | null>(null)
  const rafRef = useRef(0)
  /** 按键：Map 保留按下顺序，取最后按下的方向（想往哪走就往哪走） */
  const keysRef = useRef<Map<string, number>>(new Map())
  const [isTouch] = useState(() => typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0))

  const [mode, setMode] = useState<Mode>('select')
  const [seedInput, setSeedInput] = useState(() => String(Math.floor(Math.random() * 2147483647)))
  const [hud, setHud] = useState({ score: 0, left: TOTAL_ENEMIES, lives: PLAYER_LIVES, baseAlive: true })
  const [best, setBest] = useState(() => {
    try {
      return Number(localStorage.getItem(BEST_KEY)) || 0
    } catch {
      return 0
    }
  })

  /* ------------------------------ 联网对局 ------------------------------ */
  const onlineReady = Boolean(myId && friendId && myId !== friendId) && configured
  const [createErr, setCreateErr] = useState('')
  const [row, setRow] = useState<CoupleTankRow | null>(null)
  const rowRef = useRef<CoupleTankRow | null>(null)
  const revRef = useRef(-1)
  /** 防抖：同一局结算只上报一次 */
  const settleRef = useRef(false)
  const lastSyncRef = useRef(0)
  /** 联网模式下本端模拟是否已随当前 rev 启动 */
  const startedRevRef = useRef(-1)

  const mySide: 'a' | 'b' | null = row ? (row.member_a === myId ? 'a' : 'b') : null
  /** 我在 (member_a, member_b) 有序对里的下标；null = 对局行还没拿到 / 不属于这局 */
  const myIdx: 0 | 1 | null = mySide === 'a' ? 0 : mySide === 'b' ? 1 : null
  /** JSX 展示用兜底下标（此时必有 row，myIdx 实际非空） */
  const idx = myIdx ?? 0
  const friendSide = mySide === 'a' ? 'b' : 'a'
  const oppProg = row && friendSide ? row.state.prog[friendSide === 'a' ? 0 : 1] : null
  const myProg = row && myIdx !== null ? row.state.prog[myIdx] : null

  const applyRow = useCallback((r: CoupleTankRow | null) => {
    if (!r) return
    const cur = rowRef.current
    if (cur && r.state.rev < cur.state.rev) return // 乱序旧快照丢弃
    rowRef.current = r
    revRef.current = r.state.rev
    setRow(r)
  }, [])

  const reloadTank = useCallback(async () => {
    if (!onlineReady) return
    try {
      applyRow(await fetchCoupleTank(myId, friendId))
    } catch {
      // 网络抖动忽略，等下一轮轮询
    }
  }, [applyRow, friendId, myId, onlineReady])

  useEffect(() => {
    if (mode !== 'online' || !onlineReady) return
    void reloadTank()
  }, [mode, onlineReady, reloadTank])

  useRealtime(
    useMemo(() => `tank:${[myId, friendId].sort().join(':')}`, [friendId, myId]),
    [
      { table: 'couple_tank', event: 'INSERT', on: (p) => applyRow(p.new as CoupleTankRow) },
      { table: 'couple_tank', event: 'UPDATE', on: (p) => applyRow(p.new as CoupleTankRow) },
    ],
    { enabled: mode === 'online' && onlineReady, pollMs: POLL.hot, onPoll: () => void reloadTank() }
  )

  /** 上报进度 / 结算。winner 只由第一个写入者决定，后到者不覆盖 */
  const pushState = useCallback(
    async (patch: Partial<CoupleTankState>, myProg?: TankProgress) => {
      const cur = rowRef.current
      if (!cur || myIdx === null) return
      const next: CoupleTankState = { ...cur.state, ...patch, rev: cur.state.rev + 1 }
      if (myProg) {
        next.prog = [...next.prog] as [TankProgress | null, TankProgress | null]
        next.prog[myIdx] = myProg
      }
      rowRef.current = { ...cur, state: next, updated_at: new Date().toISOString() }
      setRow(rowRef.current)
      revRef.current = next.rev
      try {
        await upsertCoupleTank(myId, friendId, next)
        if (next.winner && cur.state.phase === 'playing') await createCoupleTankHistory(myId, friendId, next)
      } catch {
        // 网络失败：轮询兜底会看到旧状态，但本地模拟照常进行
      }
    },
    [friendId, myId, myIdx]
  )

  /** 本地一局结束（联网模式才上报）：赢 = 先清完 20 敌；输 = 基地被毁或命尽 */
  const settleOnline = useCallback(
    (sim: Sim) => {
      if (settleRef.current || myIdx === null) return
      settleRef.current = true
      const at = new Date().toISOString()
      const prog: TankProgress = { score: sim.score, left: sim.left, lives: sim.player.lives, baseAlive: true, done: true, win: sim.win, at }
      const cur = rowRef.current
      let winner = cur?.state.winner ?? null
      if (!winner) winner = sim.win ? (mySide === 'a' ? 'a' : 'b') : mySide === 'a' ? 'b' : 'a'
      void pushState({ phase: 'over', winner }, prog)
    },
    [myIdx, mySide, pushState]
  )

  /** 对局进行中每 2s 上报一次进度（realtime 推送 / hot 轮询让对面实时看到） */
  useEffect(() => {
    if (mode !== 'online' || !onlineReady) return
    const timer = window.setInterval(() => {
      const cur = rowRef.current
      const sim = simRef.current
      if (!cur || cur.state.phase !== 'playing' || !sim || sim.over || myIdx === null) return
      if (Date.now() - lastSyncRef.current < 2000) return
      lastSyncRef.current = Date.now()
      const at = new Date().toISOString()
      void pushState({}, { score: sim.score, left: sim.left, lives: sim.player.lives, baseAlive: true, done: false, win: false, at })
    }, 2000)
    return () => window.clearInterval(timer)
  }, [mode, onlineReady, myIdx, pushState])

  /** 对方开好局 / 双方就绪 → 本端自动进入 playing 并用当前种子启动模拟 */
  useEffect(() => {
    if (mode !== 'online' || !row || myIdx === null) return
    const st = row.state
    if (st.phase === 'over') {
      settleRef.current = false
      startedRevRef.current = -1
      simRef.current = null
      return
    }
    if (st.phase === 'waiting' && st.ready[myIdx]) {
      // 我方已就绪，检查是否双方都齐了 → 开战（谁先看到谁翻转）
      if (st.ready[0] && st.ready[1]) {
        void pushState({ phase: 'playing' })
      }
      return
    }
    if (st.phase === 'playing' && startedRevRef.current !== st.rev) {
      startedRevRef.current = st.rev
      settleRef.current = false
      simRef.current = newSim(st.seed)
      setHud({ score: 0, left: TOTAL_ENEMIES, lives: PLAYER_LIVES, baseAlive: true })
    }
  }, [mode, row, myIdx, pushState])

  /* ------------------------------ 对局启动 ------------------------------ */

  const startOffline = useCallback(() => {
    const seed = Math.abs(parseInt(seedInput, 10) || Math.floor(Math.random() * 2147483647))
    setSeedInput(String(seed))
    settleRef.current = false
    simRef.current = newSim(seed)
    setHud({ score: 0, left: TOTAL_ENEMIES, lives: PLAYER_LIVES, baseAlive: true })
  }, [seedInput])

  /* ------------------------------ 主循环 ------------------------------ */

  useEffect(() => {
    if (mode === 'select') return
    // 离线与联网共用循环：联网时 simRef 由「双方就绪 → playing」的 effect 启动，
    // sim 为 null 时 step 直接触发返回，画面画占位提示
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let raf = 0
    let lastT = performance.now()
    let acc = 0
    let hudDirty = true

    const shoot = (tank: { x: number; y: number; size: number; dir: number; cooldown: number }, mine: boolean, cd: number) => {
      if (tank.cooldown > 0) return
      const bx = tank.x + tank.size / 2 - 2
      const by = tank.y + tank.size / 2 - 2
      let vx = 0
      let vy = 0
      if (tank.dir === 0) vy = -4
      else if (tank.dir === 1) vx = 4
      else if (tank.dir === 2) vy = 4
      else vx = -4
      simRef.current?.bullets.push({ x: bx, y: by, vx, vy, mine, alive: true })
      tank.cooldown = cd
    }

    const simRefLocal = simRef
    const spawnEnemyOf = (sim: Sim & { spawn?: () => void }) => sim.spawn?.()

    const step = () => {
      const sim = simRefLocal.current
      if (!sim || sim.over) return
      const simX = sim as Sim & { spawn?: () => void }
      const rng = createRNG(Date.now() % 2147483646) // 战斗期随机与地形无关，本地随机即可

      /* --- 玩家：取最后按下的方向 --- */
      const p = sim.player
      let dir = -1
      for (const [, d] of keysRef.current) dir = d // Map 迭代按插入序，最后一个 = 最近按下
      if (dir >= 0) {
        p.dir = dir
        const nx = p.x + (dir === 1 ? p.speed : dir === 3 ? -p.speed : 0)
        const ny = p.y + (dir === 2 ? p.speed : dir === 0 ? -p.speed : 0)
        if (!mapBlocked(sim.map, nx, ny, p.size)) {
          let hitTank = false
          for (const e of sim.enemies) {
            if (rectCollide(nx, ny, p.size, p.size, e.x, e.y, e.size, e.size)) {
              hitTank = true
              break
            }
          }
          if (!hitTank) {
            p.x = nx
            p.y = ny
          }
        }
      }
      if (keysRef.current.has('fire')) shoot(p, true, 20)
      if (p.cooldown > 0) p.cooldown--
      if (p.inv > 0) p.inv--

      /* --- 敌人 AI（空位感知 + 卡死自救，避免死角抖动卡住） --- */
      // 某个方向是否真的走得通（地形 + 玩家 + 其他坦克都查）
      const tryDir = (e: Enemy, d: number) => {
        const tx = e.x + DIR_DX[d] * e.speed
        const ty = e.y + DIR_DY[d] * e.speed
        if (mapBlocked(sim.map, tx, ty, e.size)) return false
        if (rectCollide(tx, ty, e.size, e.size, p.x, p.y, p.size, p.size)) return false
        for (const o of sim.enemies) {
          if (o !== e && rectCollide(tx, ty, e.size, e.size, o.x, o.y, o.size, o.size)) return false
        }
        return true
      }
      // 从实际走得通的方向里挑：多于一个选择时尽量不回头
      const pickFreeDir = (e: Enemy) => {
        const free = [0, 1, 2, 3].filter((d) => tryDir(e, d))
        if (!free.length) return -1
        const back = (e.dir + 2) % 4
        const pool = free.length > 1 ? free.filter((d) => d !== back) : free
        return pool[Math.floor(rng() * pool.length)]
      }
      for (const e of sim.enemies) {
        e.dirTimer--
        // 撞墙 / 计时到 / 连续卡住：只在「走得通」的方向里重新选路
        if (e.dirTimer <= 0 || !tryDir(e, e.dir) || e.stuck > 30) {
          const d = pickFreeDir(e)
          if (d >= 0) {
            e.dir = d
            e.dirTimer = 30 + Math.floor(rng() * 60)
          } else {
            e.dirTimer = 12 // 四面全堵（可能被坦克群围住），稍后再试
          }
          e.stuck = 0
        }
        const ex = e.x + DIR_DX[e.dir] * e.speed
        const ey = e.y + DIR_DY[e.dir] * e.speed
        if (tryDir(e, e.dir)) {
          e.x = ex
          e.y = ey
          e.stuck = 0
        } else {
          e.stuck++
          e.dirTimer = 0 // 下一帧立刻重新找路
        }
        if (e.cooldown <= 0 && rng() < 0.02) shoot(e, false, 60 + Math.floor(rng() * 60))
        if (e.cooldown > 0) e.cooldown--
      }

      /* --- 子弹 --- */
      for (const b of sim.bullets) {
        if (!b.alive) continue
        b.x += b.vx
        b.y += b.vy
        if (b.x < 0 || b.x > SIZE || b.y < 0 || b.y > SIZE) {
          b.alive = false
          continue
        }
        const tx = Math.floor((b.x + 2) / TILE)
        const ty = Math.floor((b.y + 2) / TILE)
        if (tx >= 0 && tx < MAP_SIZE && ty >= 0 && ty < MAP_SIZE) {
          const tile = sim.map[ty][tx]
          if (tile === TILE_BRICK) {
            sim.map[ty][tx] = TILE_EMPTY
            b.alive = false
            continue
          }
          if (tile === TILE_STEEL) {
            b.alive = false
            continue
          }
          if (tile === TILE_BASE) {
            // 基地被毁：直接判负
            sim.over = true
            sim.win = false
            hudDirty = true
            if (mode === 'online') settleOnline(sim)
            return
          }
        }
        if (b.mine) {
          for (const e of sim.enemies) {
            if (rectCollide(b.x, b.y, 4, 4, e.x, e.y, e.size, e.size)) {
              e.cooldown = -1 // 标记死亡
              b.alive = false
              sim.score += 100
              sim.left--
              hudDirty = true
              if (sim.left <= 0) {
                sim.over = true
                sim.win = true
                if (mode === 'online') settleOnline(sim)
              }
              break
            }
          }
        } else if (rectCollide(b.x, b.y, 4, 4, p.x, p.y, p.size, p.size) && p.inv <= 0) {
          b.alive = false
          p.lives--
          hudDirty = true
          if (p.lives <= 0) {
            sim.over = true
            sim.win = false
            if (mode === 'online') settleOnline(sim)
          } else {
            // 重生回出生点，短暂无敌
            p.x = 10 * TILE
            p.y = 20 * TILE
            p.dir = 0
            p.inv = 90
          }
        }
      }
      sim.bullets = sim.bullets.filter((b) => b.alive)
      sim.enemies = sim.enemies.filter((e) => e.cooldown !== -1)

      /* --- 定时刷敌人 --- */
      sim.spawnTimer++
      if (sim.spawnTimer > 180 && sim.enemies.length < MAX_CONCURRENT && sim.spawned < TOTAL_ENEMIES) {
        spawnEnemyOf(simX)
        sim.spawnTimer = 0
      }
    }

    const render = () => {
      const sim = simRefLocal.current
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, SIZE, SIZE)
      if (!sim) {
        ctx.fillStyle = '#94a3b8'
        ctx.font = '14px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('选择种子，点击开始', SIZE / 2, SIZE / 2)
        return
      }
      // 地形
      for (let y = 0; y < MAP_SIZE; y++) {
        for (let x = 0; x < MAP_SIZE; x++) {
          const t = sim.map[y][x]
          if (t === TILE_EMPTY) continue
          const px = x * TILE
          const py = y * TILE
          if (t === TILE_BRICK) {
            ctx.fillStyle = '#8b4513'
            ctx.fillRect(px, py, TILE, TILE)
            ctx.strokeStyle = '#5d2906'
            ctx.lineWidth = 1
            ctx.strokeRect(px + 1, py + 1, TILE / 2 - 1, TILE / 2 - 1)
            ctx.strokeRect(px + TILE / 2, py + 1, TILE / 2 - 1, TILE / 2 - 1)
            ctx.strokeRect(px + 1, py + TILE / 2, TILE / 2 - 1, TILE / 2 - 1)
            ctx.strokeRect(px + TILE / 2, py + TILE / 2, TILE / 2 - 1, TILE / 2 - 1)
          } else if (t === TILE_STEEL) {
            ctx.fillStyle = '#808080'
            ctx.fillRect(px, py, TILE, TILE)
            ctx.fillStyle = '#a0a0a0'
            ctx.fillRect(px + 2, py + 2, TILE - 4, 2)
            ctx.fillRect(px + 2, py + 2, 2, TILE - 4)
          } else if (t === TILE_BASE) {
            ctx.fillStyle = '#ff2222'
            ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4)
            ctx.fillStyle = '#ffff00'
            ctx.fillRect(px + TILE / 2 - 2, py + 4, 4, TILE - 8)
          }
        }
      }
      // 坦克
      const drawTank = (x: number, y: number, size: number, dir: number, color: string, blink: boolean) => {
        if (blink) return
        ctx.fillStyle = color
        ctx.fillRect(x + 2, y + 2, size - 4, size - 4)
        // 履带
        ctx.fillStyle = 'rgba(0,0,0,0.45)'
        ctx.fillRect(x + 2, y + 2, 3, size - 4)
        ctx.fillRect(x + size - 5, y + 2, 3, size - 4)
        // 炮管
        ctx.fillStyle = '#222'
        const cx = x + size / 2
        const cy = y + size / 2
        if (dir === 0) ctx.fillRect(cx - 2, y, 4, size / 2)
        else if (dir === 1) ctx.fillRect(cx, cy - 2, size / 2, 4)
        else if (dir === 2) ctx.fillRect(cx - 2, cy, 4, size / 2)
        else ctx.fillRect(x, cy - 2, size / 2, 4)
      }
      const blink = sim.player.inv > 0 && Math.floor(performance.now() / 90) % 2 === 0
      drawTank(sim.player.x, sim.player.y, sim.player.size, sim.player.dir, '#22cc88', blink)
      for (const e of sim.enemies) drawTank(e.x, e.y, e.size, e.dir, '#b0b8c4', false)
      // 子弹
      ctx.fillStyle = '#fff'
      for (const b of sim.bullets) ctx.fillRect(b.x, b.y, 4, 4)

      // 结束遮罩
      if (sim.over) {
        ctx.fillStyle = 'rgba(0,0,0,0.72)'
        ctx.fillRect(0, 0, SIZE, SIZE)
        ctx.fillStyle = '#fff'
        ctx.font = '30px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(sim.win ? '胜利！' : '战败…', SIZE / 2, SIZE / 2 - 16)
        ctx.font = '14px sans-serif'
        ctx.fillStyle = '#cbd5e1'
        ctx.fillText(mode === 'online' ? '看结算面板查看对战结果' : '点下方按钮再来一局', SIZE / 2, SIZE / 2 + 18)
      }
    }

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.1, (now - lastT) / 1000)
      lastT = now
      acc += dt
      let steps = 0
      while (acc >= 1 / 60 && steps < 4) {
        step()
        acc -= 1 / 60
        steps++
      }
      render()
      if (hudDirty) {
        hudDirty = false
        const sim = simRefLocal.current
        if (sim) {
          const baseAlive = sim.map.some((rowArr) => rowArr.some((t) => t === TILE_BASE))
          setHud({ score: sim.score, left: sim.left, lives: sim.player.lives, baseAlive })
        }
      }
    }
    raf = requestAnimationFrame(loop)
    rafRef.current = raf
    return () => cancelAnimationFrame(raf)
  }, [mode, settleOnline])

  /* ------------------------------ 键盘 ------------------------------ */

  useEffect(() => {
    if (mode === 'select') return
    const DIRS: Record<string, number> = {
      ArrowUp: 0,
      KeyW: 0,
      ArrowRight: 1,
      KeyD: 1,
      ArrowDown: 2,
      KeyS: 2,
      ArrowLeft: 3,
      KeyA: 3,
    }
    const down = (e: KeyboardEvent) => {
      const d = DIRS[e.code]
      if (d !== undefined) {
        e.preventDefault()
        keysRef.current.delete(e.code)
        keysRef.current.set(e.code, d)
        return
      }
      if (e.code === 'Space') {
        e.preventDefault()
        keysRef.current.set('fire', -1)
      }
    }
    const up = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code)
      if (e.code === 'Space') keysRef.current.delete('fire')
    }
    const blur = () => keysRef.current.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      keysRef.current.clear()
    }
  }, [mode])

  /* ------------------------------ 横屏全屏（仿回声洞窟） ------------------------------ */

  const stageRef = useRef<HTMLDivElement>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [fsHint, setFsHint] = useState(false)
  const joyActiveRef = useRef(false)
  const joyOriginRef = useRef({ x: 0, y: 0 })
  const joyBaseRef = useRef<HTMLDivElement>(null)
  const joyThumbRef = useRef<HTMLDivElement>(null)

  /** 进入 / 退出全屏；手机上顺带锁定横屏（不支持的环境静默跳过） */
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
      // 桌面端或不支持方向锁定的浏览器：忽略即可，全屏本身已生效
    }
  }, [isTouch])

  /** 全屏监听常驻整个组件生命周期：任何进入 / 退出（含浏览器 Esc）都同步 state，杜绝假全屏 */
  useEffect(() => {
    const onFs = () => {
      const fs = Boolean(document.fullscreenElement)
      setFullscreen(fs)
      if (!fs) setFsHint(false)
      else keysRef.current.clear()
    }
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  /** 退出对战（返回模式选择）时顺带退出全屏；监听常驻，state 自动同步 */
  useEffect(() => {
    if (mode !== 'select') return
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
  }, [mode])

  /* ------------------------------ 虚拟摇杆（仅横屏全屏） ------------------------------ */

  /** 与回声洞窟同款「相对起点」模型：以按下位置为原点，往哪拖就往哪走，怎么按都不会反 */
  const joyApply = (e: React.PointerEvent) => {
    const base = joyBaseRef.current
    if (!base) return
    const rect = base.getBoundingClientRect()
    const R = rect.width / 2
    const range = R * 0.62
    let dx = e.clientX - joyOriginRef.current.x
    let dy = e.clientY - joyOriginRef.current.y
    const len = Math.hypot(dx, dy)
    if (len > range) {
      dx = (dx / len) * range
      dy = (dy / len) * range
    }
    // 死区 + 主轴判定：坦克只需 4 向，取拖动向量的主导轴
    if (Math.hypot(dx, dy) / range >= 0.12) {
      keysRef.current.set('joy', Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0)
    } else {
      keysRef.current.delete('joy')
    }
    if (joyThumbRef.current) joyThumbRef.current.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`
  }

  const joyReset = () => {
    joyActiveRef.current = false
    keysRef.current.delete('joy')
    if (joyThumbRef.current) joyThumbRef.current.style.transform = 'translate(0px, 0px)'
  }

  const joyHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault()
      joyActiveRef.current = true
      joyOriginRef.current = { x: e.clientX, y: e.clientY }
      e.currentTarget.setPointerCapture(e.pointerId)
      joyApply(e)
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (joyActiveRef.current) joyApply(e)
    },
    onPointerUp: joyReset,
    onPointerCancel: joyReset,
  }

  /* ------------------------------ 触屏 ------------------------------ */

  const holdBtn = (dir: number, label: string) => (
    <button
      type="button"
      className="flex h-12 w-12 touch-none select-none items-center justify-center rounded-xl border border-slate-500/50 bg-slate-800/70 text-lg leading-none text-cyan-200 transition active:bg-cyan-500/30"
      onPointerDown={(e) => {
        e.preventDefault()
        keysRef.current.delete('hold')
        keysRef.current.set('hold', dir)
      }}
      onPointerUp={(e) => {
        e.preventDefault()
        keysRef.current.delete('hold')
      }}
      onPointerCancel={() => keysRef.current.delete('hold')}
      onPointerLeave={() => keysRef.current.delete('hold')}
    >
      {label}
    </button>
  )

  /* ------------------------------ 联网操作 ------------------------------ */

  const onlineCreate = useCallback(async () => {
    const seed = Math.floor(Math.random() * 2147483647)
    settleRef.current = false
    startedRevRef.current = -1
    rowRef.current = null
    try {
      await upsertCoupleTank(myId, friendId, { phase: 'waiting', seed, rev: revRef.current < 0 ? 0 : revRef.current + 1, ready: [false, false], winner: null, prog: [null, null] })
      void notifyTankNew(friendId, myName, seed)
      void reloadTank()
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : '开战失败，稍后再试')
    }
  }, [friendId, myId, myName, reloadTank])

  const onlineJoin = useCallback(async () => {
    const cur = rowRef.current
    if (!cur || myIdx === null) return
    if (cur.state.ready[myIdx]) return
    const ready: [boolean, boolean] = [cur.state.ready[0], cur.state.ready[1]]
    ready[myIdx] = true
    await pushState({ ready })
  }, [myIdx, pushState])

  const onlineRestart = useCallback(async () => {
    const cur = rowRef.current
    if (!cur || mySide !== 'a') return
    settleRef.current = false
    startedRevRef.current = -1
    simRef.current = null
    const seed = Math.floor(Math.random() * 2147483647)
    await pushState({ phase: 'waiting', seed, ready: [false, false], winner: null, prog: [null, null] })
  }, [mySide, pushState])

  const offlineOver = mode === 'offline' && simRef.current?.over

  const saveBest = useCallback((score: number) => {
    try {
      const prev = Number(localStorage.getItem(BEST_KEY)) || 0
      if (score > prev) {
        localStorage.setItem(BEST_KEY, String(score))
        setBest(score)
      }
    } catch {
      // ignore
    }
  }, [])
  useEffect(() => {
    if (offlineOver && simRef.current) saveBest(simRef.current.score)
  }, [offlineOver, saveBest, hud])

  /* ------------------------------ 渲染 ------------------------------ */

  if (mode === 'select') {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left transition active:bg-emerald-100"
            onClick={() => {
              setSeedInput(String(Math.floor(Math.random() * 2147483647)))
              setMode('offline')
            }}
          >
            <div className="text-2xl">🎮</div>
            <div className="mt-1 font-semibold text-emerald-700">离线人机</div>
            <div className="mt-0.5 text-[11px] leading-relaxed text-emerald-600/80">守基地、清敌人，随机地形</div>
          </button>
          <button
            type="button"
            disabled={!onlineReady}
            className={`rounded-2xl border p-4 text-left transition ${
              onlineReady ? 'border-rose-200 bg-rose-50 active:bg-rose-100' : 'border-slate-200 bg-slate-100 opacity-50'
            }`}
            onClick={() => setMode('online')}
          >
            <div className="text-2xl">💥</div>
            <div className="mt-1 font-semibold text-rose-600">情侣对战</div>
            <div className="mt-0.5 text-[11px] leading-relaxed text-rose-600/80">
              {onlineReady ? `同图和 ${friendName} 竞速，先清敌胜` : '需要先添加好友'}
            </div>
          </button>
        </div>
        <p className="text-center text-[11px] leading-relaxed text-slate-400">
          方向键 / WASD 移动 · 空格射击 · 种子相同地形一致 · 砖墙可打穿、钢墙打不动、守基地
        </p>
      </div>
    )
  }

  const st = row?.state
  const sim = simRef.current

  /** 联网模式还没有对局行：展示开战入口 */
  if (mode === 'online' && !row) {
    return (
      <div className="space-y-3 text-center">
        <div className="rounded-2xl bg-rose-50 p-6 text-sm text-rose-700">
          还没有进行中的坦克大战
          <p className="mt-1 text-xs text-rose-500/80">开一局，{friendName} 的铃铛会收到战书</p>
          {createErr && <p className="mt-2 rounded-md bg-rose-100 px-2 py-1 text-xs text-rose-600">{createErr}</p>}
        </div>
        <button type="button" className="rounded-lg bg-rose-500 px-6 py-2 text-sm font-semibold text-white transition active:bg-rose-600" onClick={() => void onlineCreate()}>
          💥 开一局
        </button>
        <button type="button" className="btn-ghost w-full" onClick={() => setMode('select')}>
          ← 返回
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* HUD */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs">
        <div className="flex items-center gap-3 font-medium">
          <span className={mode === 'online' ? 'text-rose-600' : 'text-emerald-600'}>
            {mode === 'online' ? `💥 vs ${friendName}` : '🎮 离线人机'}
          </span>
          <span className="text-slate-500">得分 {hud.score}</span>
          <span className="text-slate-500">剩敌 {hud.left}</span>
          <span className="text-slate-500">{'❤️'.repeat(Math.max(0, hud.lives))}</span>
          {!hud.baseAlive && <span className="text-rose-500">基地被毁</span>}
        </div>
        <div className="flex items-center gap-1.5">
          {best > 0 && <span className="text-slate-400">最佳 {best}</span>}
          <button type="button" className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-500 transition active:bg-slate-100" onClick={toggleFullscreen} title="横屏全屏">
            ⛶
          </button>
          <button type="button" className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-500 transition active:bg-slate-100" onClick={() => setMode('select')}>
            退出
          </button>
        </div>
      </div>

      {/* 联网状态条 */}
      {mode === 'online' && st && (
        <div className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {st.phase === 'waiting' && (
            <div className="flex items-center justify-between gap-2">
              <span>
                房间已就绪 · 种子 <b>{st.seed}</b>
                {st.ready[idx] ? ' · 你已就绪' : ''}
                {st.ready[0] && st.ready[1] ? ' · 正在开战…' : ` · 等待${friendName}就绪`}
              </span>
              {!st.ready[idx] && (
                <button type="button" className="rounded-md bg-rose-500 px-3 py-1 font-semibold text-white transition active:bg-rose-600" onClick={() => void onlineJoin()}>
                  我准备好了
                </button>
              )}
            </div>
          )}
          {st.phase === 'over' && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {st.winner === mySide ? '🎉 你赢了！' : st.winner === friendSide ? '😢 TA 赢了' : st.winner === 'draw' ? '平局' : '对局结束'}
                {` · 你 ${myProg?.score ?? hud.score} 分 · ${friendName} ${oppProg?.score ?? '-'} 分`}
              </span>
              {mySide === 'a' ? (
                <button type="button" className="rounded-md bg-rose-500 px-3 py-1 font-semibold text-white transition active:bg-rose-600" onClick={() => void onlineRestart()}>
                  再来一局
                </button>
              ) : (
                <span className="text-rose-400">等 {friendName} 开新局…</span>
              )}
            </div>
          )}
          {st.phase === 'playing' && (
            <div className="flex items-center justify-between gap-2">
              <span>种子 {st.seed} · 竞速中</span>
              <span className="text-rose-500/80">
                {friendName}：剩敌 {oppProg ? oppProg.left : '-'} · 得分 {oppProg ? oppProg.score : '-'}
                {oppProg?.done ? (oppProg.win ? ' · 🏁 已完赛' : ' · 💀 已战败') : ''}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 舞台：全屏模式下铺满视口居中显示；非全屏时触屏按钮放在画面下方，不遮挡 */}
      <div
        ref={stageRef}
        className={
          fullscreen
            ? 'fixed inset-0 z-[60] flex items-center justify-center bg-black'
            : 'relative overflow-hidden rounded-2xl bg-black ring-1 ring-slate-600/30'
        }
      >
        <canvas
          ref={canvasRef}
          width={SIZE}
          height={SIZE}
          className="block touch-none select-none"
          style={fullscreen ? { aspectRatio: '1 / 1', width: 'min(100vw, 100vh)' } : { aspectRatio: '1 / 1', width: '100%' }}
        />

        {/* 全屏：顶部极简 HUD（常驻可关） */}
        {fullscreen && (
          <div className="absolute inset-x-0 top-0 flex items-center justify-center gap-2 p-2 text-xs">
            <span className="rounded-md bg-black/60 px-2 py-1 text-slate-200">得分 {hud.score}</span>
            <span className="rounded-md bg-black/60 px-2 py-1 text-slate-200">剩敌 {hud.left}</span>
            <span className="rounded-md bg-black/60 px-2 py-1 text-slate-200">{'❤️'.repeat(Math.max(0, hud.lives))}</span>
            {mode === 'online' && oppProg && (
              <span className="rounded-md bg-rose-900/60 px-2 py-1 text-rose-200">
                {friendName} 剩敌 {oppProg.left}
              </span>
            )}
            <button
              type="button"
              className="rounded-md border border-slate-600/50 bg-black/60 px-2 py-1 text-slate-200 transition active:bg-slate-700/60"
              onClick={toggleFullscreen}
              title="退出全屏"
            >
              ✕
            </button>
          </div>
        )}

        {/* 全屏：左下摇杆 + 右下开火（仿回声洞窟） */}
        {isTouch && fullscreen && (
          <>
            <div
              ref={joyBaseRef}
              className="absolute bottom-4 left-4 flex h-28 w-28 touch-none select-none items-center justify-center rounded-full border border-white/20 bg-white/10 backdrop-blur-sm"
              {...joyHandlers}
            >
              <span className="pointer-events-none absolute text-[10px] text-white/30">移动</span>
              <div ref={joyThumbRef} className="pointer-events-none h-12 w-12 rounded-full border border-white/30 bg-white/25 shadow-inner" />
            </div>
            <div
              className="absolute bottom-4 right-4 flex h-28 w-28 touch-none select-none items-center justify-center rounded-full border border-rose-400/40 bg-rose-500/20 backdrop-blur-sm transition active:bg-rose-500/40"
              onPointerDown={(e) => {
                e.preventDefault()
                keysRef.current.set('fire', -1)
                e.currentTarget.setPointerCapture(e.pointerId)
              }}
              onPointerUp={(e) => {
                e.preventDefault()
                keysRef.current.delete('fire')
              }}
              onPointerCancel={() => keysRef.current.delete('fire')}
            >
              <span className="pointer-events-none text-xs font-bold tracking-widest text-rose-200">FIRE</span>
            </div>
          </>
        )}

        {/* 全屏横屏提示：锁屏方向不可用时的引导 */}
        {fullscreen && fsHint && (
          <div className="pointer-events-none absolute left-1/2 top-12 -translate-x-1/2 whitespace-nowrap rounded-lg bg-black/70 px-3 py-1.5 text-[11px] text-amber-200 ring-1 ring-amber-400/40">
            建议打开手机「自动旋转」并横过来玩，摇杆与开火键已就位
          </div>
        )}

        {/* 全屏结算：离线再来一局 / 联网开新局（非全屏时走下方操作条） */}
        {fullscreen && sim?.over && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/75 p-4 text-center">
            <div className="text-3xl">{sim.win ? '🏆' : '💀'}</div>
            <div className="text-sm font-semibold text-slate-100">{sim.win ? '胜利！' : '战败…'} · 得分 {sim.score}</div>
            {mode === 'offline' ? (
              <button type="button" className="rounded-lg bg-emerald-500 px-5 py-2 text-sm font-semibold text-white transition active:bg-emerald-600" onClick={startOffline}>
                再来一局
              </button>
            ) : mySide === 'a' ? (
              <button type="button" className="rounded-lg bg-rose-500 px-5 py-2 text-sm font-semibold text-white transition active:bg-rose-600" onClick={() => void onlineRestart()}>
                再来一局
              </button>
            ) : (
              <div className="text-xs text-slate-400">等 {friendName} 开新局…</div>
            )}
            <button type="button" className="btn-ghost px-4 py-1.5 text-xs" onClick={toggleFullscreen}>
              退出全屏
            </button>
          </div>
        )}

        {/* 联网开战按钮：waiting 且未就绪时盖住画布提示 */}
        {mode === 'online' && st?.phase === 'waiting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 p-4 text-center">
            <div className="text-sm text-slate-200">
              种子地图 <b className="text-amber-300">{st.seed}</b> 已生成
              <br />
              <span className="text-xs text-slate-400">双方就绪后同时开战，先清完 {TOTAL_ENEMIES} 个敌人（或对方先战败）者获胜</span>
            </div>
            {!st.ready[idx] && (
              <button type="button" className="rounded-lg bg-rose-500 px-6 py-2 text-sm font-semibold text-white transition active:bg-rose-600" onClick={() => void onlineJoin()}>
                我准备好了
              </button>
            )}
            {st.ready[idx] && !st.ready[0] && <div className="animate-pulse text-xs text-slate-400">等待 {friendName} 就绪…</div>}
          </div>
        )}
      </div>

      {/* 触屏非全屏：方向键 + 开火放画面下方，不遮挡游戏元素 */}
      {isTouch && !fullscreen && (
        <div className="flex items-center justify-between gap-4 px-2">
          <div className="grid grid-cols-3 gap-1" style={{ gridTemplateRows: '48px 48px' }}>
            <span />
            {holdBtn(0, '▲')}
            <span />
            {holdBtn(3, '◀')}
            {holdBtn(2, '▼')}
            {holdBtn(1, '▶')}
          </div>
          <button
            type="button"
            className="flex h-20 w-20 touch-none select-none items-center justify-center rounded-full border border-rose-400/60 bg-rose-500/20 text-xs font-bold tracking-widest text-rose-200 transition active:bg-rose-500/40"
            onPointerDown={(e) => {
              e.preventDefault()
              keysRef.current.set('fire', -1)
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerUp={(e) => {
              e.preventDefault()
              keysRef.current.delete('fire')
            }}
            onPointerCancel={() => keysRef.current.delete('fire')}
          >
            FIRE
          </button>
        </div>
      )}

      {/* 离线操作条 */}
      {mode === 'offline' && (
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
          {isTouch ? <span className="text-slate-400">下方 ▲◀▼▶ 按住移动 · FIRE 开火 · ⛶ 横屏全屏更好玩</span> : <span className="text-slate-400">方向键 / WASD 移动 · 空格射击 · ⛶ 全屏</span>}
          {(sim?.over || !sim) && (
            <>
              <input
                value={seedInput}
                onChange={(e) => setSeedInput(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
                inputMode="numeric"
                className="w-28 rounded-md border border-slate-300 px-2 py-1 text-center text-xs"
                placeholder="种子"
              />
              <button type="button" className="rounded-md bg-emerald-500 px-4 py-1.5 font-semibold text-white transition active:bg-emerald-600" onClick={startOffline}>
                {sim?.over ? '再来一局' : '开始游戏'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
