import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties, TouchEvent } from 'react'
import {
  addCoupleGameScore,
  confirmCoupleGamePass,
  createCoupleGamePass,
  deleteCoupleGamePass,
  getCoupleGameProgress,
  listCoupleDarePromptBank,
  listCoupleGamePasses,
  saveCoupleGameProgress,
  type CoupleGamePassRow,
} from '../lib/db'
import { DARES } from '../lib/darePrompts'
import { POLL, useRealtime } from '../lib/realtime'
import { setSfxEnabled, sfx, sfxEnabled, subscribeSfx } from '../lib/sfx'
import GameLeaderboard from './GameLeaderboard'

/**
 * 星尘 2048：传统 2048 的星空配色改版，纯单机。
 * - 开局可选难度：4×4 轻松 / 5×5 标准 / 6×6 挑战 / 3~8 自定义网格
 * - 分数 / 最高分 / 步数；最高分按棋盘大小分别记，当前局面存 localStorage（刷新接着玩）
 * - 键盘方向键（含 WASD）、触摸滑动、屏幕按钮三种操作
 * - 撤销一步、音效开关、合并 pop 动画与飘分
 * - 每局结束把成绩上传到情侣榜（前 10）
 */

type Dir = 'left' | 'right' | 'up' | 'down'

interface Tile {
  id: number
  value: number
  row: number
  col: number
  /** 本步新生成的块：播放落地动画 */
  isNew?: boolean
  /** 本步发生了合并：播放 pop 动画 */
  merged?: boolean
}

const SAVE_KEY = 'couple-2048-save'
const TARGET = 2048
const MIN_SIZE = 3
const MAX_SIZE = 8

/* ------------------------------ 防沉迷 ------------------------------ */

/** 每天最多开这么多局；用完后完成大冒险任务、经伴侣确认，每确认一次多一局 */
const DAILY_LIMIT = 6

/** 本地日期 YYYY-MM-DD（不能用 toISOString，那是 UTC，东八区凌晨会差一天） */
const dayKey = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 今日已开局数的本地缓存 key（按用户分开）：真正进度存远端 couple_game_progress，
 * 退出登录 / 清缓存 / 换设备都能找回今天的局数，不再「重新登录就归零」
 */
const playsKeyFor = (userId: string) => `couple-2048-plays-${userId}`

const loadLocalPlays = (userId: string): number => {
  try {
    const raw = JSON.parse(localStorage.getItem(playsKeyFor(userId)) ?? '') as { day?: string; count?: number } | null
    return raw?.day === dayKey() && typeof raw.count === 'number' ? raw.count : 0
  } catch {
    return 0
  }
}

/** 最高分按棋盘大小分开记：大盘更难，混在一起不公平。4×4 沿用老 key 兼容历史成绩 */
const bestKey = (size: number) => (size === 4 ? 'couple-2048-best' : `couple-2048-best-${size}`)

let idSeed = 1
const newId = () => idSeed++

const TILE_STYLE: Record<number, { bg: string; fg: string }> = {
  2: { bg: 'linear-gradient(135deg,#f5f3ff,#ede9fe)', fg: '#6d28d9' },
  4: { bg: 'linear-gradient(135deg,#ede9fe,#ddd6fe)', fg: '#5b21b6' },
  8: { bg: 'linear-gradient(135deg,#c7d2fe,#a5b4fc)', fg: '#312e81' },
  16: { bg: 'linear-gradient(135deg,#a5b4fc,#818cf8)', fg: '#ffffff' },
  32: { bg: 'linear-gradient(135deg,#7dd3fc,#38bdf8)', fg: '#ffffff' },
  64: { bg: 'linear-gradient(135deg,#fcd34d,#f59e0b)', fg: '#78350f' },
  128: { bg: 'linear-gradient(135deg,#fbbf24,#f472b6)', fg: '#ffffff' },
  256: { bg: 'linear-gradient(135deg,#f472b6,#e879f9)', fg: '#ffffff' },
  512: { bg: 'linear-gradient(135deg,#c084fc,#8b5cf6)', fg: '#ffffff' },
  1024: { bg: 'linear-gradient(135deg,#8b5cf6,#f59e0b)', fg: '#ffffff' },
  2048: { bg: 'linear-gradient(135deg,#f59e0b,#8b5cf6,#ec4899)', fg: '#ffffff' },
}
/** 超过 2048 继续合成就用这套终极配色 */
const OVER_STYLE = { bg: 'linear-gradient(135deg,#1e1b4b,#7c3aed,#f59e0b)', fg: '#fff7ed' }

const styleOf = (value: number): { bg: string; fg: string } => TILE_STYLE[value] ?? OVER_STYLE

/** 线内序号 → 行列：j=0 是靠 dir 那一侧的边缘格 */
function indexFor(dir: Dir, size: number, i: number, j: number): [number, number] {
  switch (dir) {
    case 'left':
      return [i, j]
    case 'right':
      return [i, size - 1 - j]
    case 'up':
      return [j, i]
    case 'down':
      return [size - 1 - j, i]
  }
}

function toGrid(tiles: Tile[], size: number): (Tile | null)[][] {
  const grid: (Tile | null)[][] = Array.from({ length: size }, () => Array.from({ length: size }, () => null))
  for (const t of tiles) {
    if (grid[t.row]?.[t.col] !== undefined) grid[t.row][t.col] = t
  }
  return grid
}

function emptyCells(tiles: Tile[], size: number): Array<[number, number]> {
  const grid = toGrid(tiles, size)
  const out: Array<[number, number]> = []
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!grid[r][c]) out.push([r, c])
  return out
}

/** 随机补一块（90% 是 2），返回新数组；没有空位返回 null */
function spawn(tiles: Tile[], size: number): Tile[] | null {
  const cells = emptyCells(tiles, size)
  if (!cells.length) return null
  const [row, col] = cells[Math.floor(Math.random() * cells.length)]
  return [...tiles, { id: newId(), value: Math.random() < 0.9 ? 2 : 4, row, col, isNew: true }]
}

function makeTiles(size: number): Tile[] {
  let tiles: Tile[] = []
  for (let i = 0; i < 2; i++) tiles = spawn(tiles, size) ?? tiles
  return tiles
}

function applyMove(tiles: Tile[], dir: Dir, size: number): { tiles: Tile[]; gained: number; merges: number; moved: boolean } {
  const grid = toGrid(tiles, size)
  const out: Tile[] = []
  let gained = 0
  let merges = 0
  let moved = false

  for (let i = 0; i < size; i++) {
    const line: Tile[] = []
    for (let j = 0; j < size; j++) {
      const [row, col] = indexFor(dir, size, i, j)
      const t = grid[row][col]
      if (t) line.push(t)
    }
    let pos = 0
    for (let k = 0; k < line.length; k++) {
      const cur = line[k]
      const nxt = line[k + 1]
      const [row, col] = indexFor(dir, size, i, pos)
      if (nxt && nxt.value === cur.value) {
        out.push({ id: cur.id, value: cur.value * 2, row, col, merged: true })
        gained += cur.value * 2
        merges += 1
        moved = true
        k += 1
      } else {
        if (cur.row !== row || cur.col !== col) moved = true
        out.push({ id: cur.id, value: cur.value, row, col })
      }
      pos += 1
    }
  }
  return { tiles: out, gained, merges, moved }
}

interface Saved {
  size: number
  tiles: Tile[]
  score: number
  moves: number
  won: boolean
}

/** 撤销用的快照：不含 won —— 胜利状态不该被撤销吃掉 */
interface Snapshot {
  tiles: Tile[]
  score: number
  moves: number
}

function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as Saved
    const size = Number(saved.size)
    if (!Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE) return null
    if (!Array.isArray(saved.tiles) || !saved.tiles.length) return null
    if (saved.tiles.some((t) => !t || typeof t.value !== 'number' || t.row < 0 || t.col < 0 || t.row >= size || t.col >= size)) return null
    /*
     * 存档里的 id 是「上一次会话」发的，而 idSeed 会随机重载页面回到 1。
     * 如果不重新编号，新生成的方块就会和老方块撞 id：React 的 key 重复，
     * 表现正是「某个数字突然消失」，接着看到的盘面和真实局面错位，
     * 又表现成「明明该合并的两个数却没合并」。恢复时统一重编号，并抬高发号器。
     */
    // 顺手清掉同格子重叠的脏数据：两个方块压在同一格时，视觉上就是一个数字被盖住
    const used = new Set<string>()
    const unique = saved.tiles.filter((t) => {
      const key = `${t.row}-${t.col}`
      if (used.has(key)) return false
      used.add(key)
      return true
    })
    const tiles: Tile[] = unique.map((t, index) => ({ ...t, id: index + 1, isNew: false, merged: false }))
    idSeed = Math.max(idSeed, tiles.length + 1)
    return { ...saved, size, tiles }
  } catch {
    return null
  }
}

const loadBest = (size: number): number => {
  try {
    return Number(localStorage.getItem(bestKey(size))) || 0
  } catch {
    return 0
  }
}

/** 字号：格子越小（盘越大）字越小，位数多了再降一档 */
function fontClass(value: number, size: number): string {
  if (size <= 4) return value >= 1024 ? 'text-lg' : value >= 128 ? 'text-xl' : 'text-2xl'
  if (size === 5) return value >= 1024 ? 'text-sm' : value >= 128 ? 'text-base' : 'text-lg'
  return value >= 1024 ? 'text-xs' : value >= 128 ? 'text-sm' : 'text-base'
}

interface Props {
  myId: string
  friendId: string
  /** 成员 id → 昵称 */
  names: Record<string, string>
}

export default function Star2048({ myId, friendId, names }: Props) {
  const [initial] = useState(() => loadSaved())
  const [phase, setPhase] = useState<'setup' | 'playing'>(initial ? 'playing' : 'setup')
  const [size, setSize] = useState(initial?.size ?? 4)
  const [tiles, setTiles] = useState<Tile[]>(initial?.tiles ?? [])
  const [score, setScore] = useState(initial?.score ?? 0)
  const [moves, setMoves] = useState(initial?.moves ?? 0)
  const [best, setBest] = useState(() => loadBest(initial?.size ?? 4))
  const [over, setOver] = useState(false)
  const [won, setWon] = useState(initial?.won ?? false)
  const [sfxOn, setSfxOn] = useState(sfxEnabled)
  const [floats, setFloats] = useState<Array<{ id: number; text: string }>>([])
  const [canUndo, setCanUndo] = useState(false)
  const [customSize, setCustomSize] = useState(initial?.size ?? 4)
  const [lbVersion, setLbVersion] = useState(0)

  /* ------------------------------ 防沉迷 ------------------------------ */
  /** 今天已开的局数（本地缓存起步，远端恢复后取更大值） */
  const [playsUsed, setPlaysUsed] = useState(() => loadLocalPlays(myId))
  /** 今天的加时申请（双方共享一份）：pending=等确认，confirmed=已加一局 */
  const [passes, setPasses] = useState<CoupleGamePassRow[]>([])
  /** 自定义大冒险题库（和内置池合并后抽任务） */
  const [dareBank, setDareBank] = useState<string[]>([])
  /** 防沉迷任务面板：null=关闭；task=抽到的任务文本 */
  const [passPanel, setPassPanel] = useState<{ task: string } | null>(null)
  const [passBusy, setPassBusy] = useState(false)
  const [sharing, setSharing] = useState(false)
  /** 截图下载成功后的临时提示 */
  const [savedTip, setSavedTip] = useState(false)

  /** 未配对时不限制（防沉迷依赖伴侣确认，没法确认就放开） */
  const limited = !!(myId && friendId)
  /** 我的加时局数：今天被确认的申请条数 */
  const myConfirmed = passes.filter((p) => p.status === 'confirmed' && p.requester_id === myId).length
  /** 我发出去、还没被确认的申请 */
  const myPending = passes.find((p) => p.status === 'pending' && p.requester_id === myId) ?? null
  /** 对方发来的、等我确认的申请 */
  const partnerPending = passes.find((p) => p.status === 'pending' && p.requester_id !== myId) ?? null
  const remaining = limited ? Math.max(0, DAILY_LIMIT - playsUsed + myConfirmed) : Infinity
  const canPlay = remaining > 0

  /** 远端局数是否已恢复完成：恢复前不写远端，防止初始值 0 把已有进度覆盖掉 */
  const playsReadyRef = useRef(false)
  /** 最新局数放在 ref：远端写失败后的延迟重试要拿到当前值 */
  const playsRef = useRef(playsUsed)
  playsRef.current = playsUsed
  /** 撤销用的快照：只在最近一步有效 */
  const snapshotRef = useRef<Snapshot | null>(null)
  /** 2048 的胜利提示只弹一次，之后可以继续往大合 */
  const wonShownRef = useRef(false)
  const touchRef = useRef<{ x: number; y: number } | null>(null)
  const floatSeed = useRef(1)
  /** 局号 + 已上报局号：同一局只上一次榜 */
  const roundRef = useRef(1)
  const reportedRef = useRef(0)

  useEffect(() => subscribeSfx(() => setSfxOn(sfxEnabled())), [])

  /* ------------------------------ 防沉迷数据同步 ------------------------------ */

  // 当日局数持久化：本地缓存 + 远端双写（远端解决退出登录 / 清缓存后次数归零的问题）
  useEffect(() => {
    // 没有身份不写（会写到 null key 下，登录后读不回来）；远端恢复完成前也不写——
    // 恢复期间 playsUsed 还是初始值（可能是 0），这时写本地/远端都会把今天的进度覆盖没
    if (!myId || !friendId || !playsReadyRef.current) return
    try {
      localStorage.setItem(playsKeyFor(myId), JSON.stringify({ day: dayKey(), count: playsUsed }))
    } catch {
      // 写不进去就本次会话内生效
    }
    const savePlays = (count: number) =>
      saveCoupleGameProgress({ userId: myId, friendId, game: 'star2048', day: dayKey(), progress: { playsUsed: count } })
    void savePlays(playsUsed).catch((error) => {
      // 写失败不能静默丢进度：3 秒后用最新局数重试一次，玩完直接退出页面时最后一局也能存上
      console.warn('保存防沉迷局数失败，稍后重试', error)
      window.setTimeout(() => {
        void savePlays(playsRef.current).catch(() => {})
      }, 3000)
    })
  }, [playsUsed, myId, friendId])

  // 远端恢复：重新登录 / 换设备后，把今天的局数从数据库找回来
  useEffect(() => {
    if (!myId || !friendId) return
    getCoupleGameProgress(myId, friendId, 'star2048', dayKey())
      .then((p) => {
        const remote = typeof p?.playsUsed === 'number' ? Math.round(p.playsUsed) : 0
        if (remote > 0) setPlaysUsed((c) => Math.max(c, remote))
      })
      .catch(() => {
        // 拉不到不能直接当 0 用完（ready=false 已挡住写入）：隔 1.5 秒重试一次，
        // 重试也失败才放行——之后玩的第一局写入会覆盖远端，但至少本地缓存还在
        window.setTimeout(() => {
          getCoupleGameProgress(myId, friendId, 'star2048', dayKey())
            .then((p) => {
              const remote = typeof p?.playsUsed === 'number' ? Math.round(p.playsUsed) : 0
              if (remote > 0) setPlaysUsed((c) => Math.max(c, remote))
            })
            .catch(() => {})
            .finally(() => {
              playsReadyRef.current = true
            })
        }, 1500)
      })
      .finally(() => {
        playsReadyRef.current = true
      })
    // 只在挂载时恢复一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId, friendId])

  /** 拉今天的加时申请；对方确认 / 拒绝后 realtime 会推过来 */
  const reloadPasses = useCallback(async () => {
    if (!myId || !friendId) {
      setPasses([])
      return
    }
    try {
      setPasses(await listCoupleGamePasses(myId, friendId, 'star2048', dayKey()))
    } catch (error) {
      console.warn('加载防沉迷加时申请失败', error)
    }
  }, [myId, friendId])

  useEffect(() => {
    void reloadPasses()
  }, [reloadPasses])

  // 自定义大冒险题库：和内置池合并抽任务，加载一次即可
  useEffect(() => {
    if (!myId || !friendId) return
    listCoupleDarePromptBank(myId, friendId)
      .then((rows) => setDareBank(rows.map((r) => r.prompt)))
      .catch(() => {
        // 拉不到就用内置题池
      })
  }, [myId, friendId])

  useRealtime(
    'game-passes-star2048',
    [
      {
        table: 'couple_game_passes',
        on: () => void reloadPasses(),
      },
    ],
    { enabled: limited, pollMs: POLL.warm, onPoll: () => void reloadPasses() }
  )

  // 死局结算弹窗打开时锁住页面滚动：触摸弹窗不会带动整页滚动，按钮不会点不到
  useEffect(() => {
    if (!over) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [over])

  // 当前局面落 localStorage：刷新 / 重开页面接着玩；结束的局不留档
  useEffect(() => {
    if (phase !== 'playing') return
    try {
      if (over) {
        localStorage.removeItem(SAVE_KEY)
        return
      }
      localStorage.setItem(SAVE_KEY, JSON.stringify({ size, tiles, score, moves, won } satisfies Saved))
    } catch {
      // 写不进去就算了，最多是刷新后重开一局
    }
  }, [phase, over, size, tiles, score, moves, won])

  // 最高分按当前棋盘大小记
  useEffect(() => {
    if (phase !== 'playing') return
    if (score <= best) return
    setBest(score)
    try {
      localStorage.setItem(bestKey(size), String(score))
    } catch {
      // ignore
    }
  }, [score, best, size, phase])

  const pushFloat = useCallback((text: string) => {
    const id = floatSeed.current++
    setFloats((prev) => [...prev, { id, text }])
    window.setTimeout(() => setFloats((prev) => prev.filter((f) => f.id !== id)), 900)
  }, [])

  /** 每局结束上榜：同一局只报一次，0 分不打扰 */
  const report = useCallback(
    (finalScore: number, finalMoves: number, achieved: boolean, gameSize: number) => {
      if (reportedRef.current === roundRef.current) return
      if (finalScore <= 0 || !myId || !friendId) return
      reportedRef.current = roundRef.current
      void addCoupleGameScore({
        userA: myId,
        userB: friendId,
        game: 'star2048',
        playerId: myId,
        score: finalScore,
        detail: `${gameSize}×${gameSize} · ${finalMoves} 步${achieved ? ' · 达成 2048' : ''}`,
      })
        .then(() => setLbVersion((v) => v + 1))
        .catch(() => {
          // 成绩上传失败不影响继续玩
        })
    },
    [myId, friendId]
  )

  // 用 ref 镜像最新局面：不把副作用塞进 setState 的 updater（StrictMode 会双调用），
  // 也保证快速连滑时用的是最新局面而不是闭包里的旧值
  const tilesRef = useRef(tiles)
  tilesRef.current = tiles
  const scoreRef = useRef(score)
  scoreRef.current = score
  const movesRef = useRef(moves)
  movesRef.current = moves

  /** 开一局消耗一次当日次数（未配对时不限；远端由持久化 effect 负责同步） */
  const consumePlay = useCallback(() => {
    if (!myId || !friendId) return
    setPlaysUsed((c) => c + 1)
  }, [myId, friendId])

  /** 抽一个大冒险任务：内置池 + 自定义题库合并后随机 */
  const drawTask = useCallback((): string => {
    const pool = [...new Set([...DARES, ...dareBank])]
    return pool[Math.floor(Math.random() * pool.length)]
  }, [dareBank])

  /** 「我完成啦」：提交申请等伴侣确认 */
  const submitPass = useCallback(async () => {
    if (!passPanel || !myId || !friendId || myPending) return
    setPassBusy(true)
    try {
      await createCoupleGamePass(myId, friendId, 'star2048', myId, passPanel.task)
      await reloadPasses()
      setPassPanel(null)
    } catch (error) {
      console.warn('提交加时申请失败', error)
      alert((error as Error).message || '提交失败，稍后再试')
    } finally {
      setPassBusy(false)
    }
  }, [passPanel, myId, friendId, myPending, reloadPasses])

  /** 确认对方的申请：TA 今天可以多玩一局 */
  const approvePass = useCallback(
    async (id: string) => {
      if (!myId) return
      setPassBusy(true)
      try {
        await confirmCoupleGamePass(id, myId)
        await reloadPasses()
      } catch (error) {
        console.warn('确认加时申请失败', error)
      } finally {
        setPassBusy(false)
      }
    },
    [myId, reloadPasses]
  )

  /** 拒绝对方的申请 */
  const rejectPass = useCallback(
    async (id: string) => {
      setPassBusy(true)
      try {
        await deleteCoupleGamePass(id)
        await reloadPasses()
      } catch (error) {
        console.warn('拒绝加时申请失败', error)
      } finally {
        setPassBusy(false)
      }
    },
    [reloadPasses]
  )

  const start = useCallback((nextSize: number) => {
    const fresh = makeTiles(nextSize)
    tilesRef.current = fresh
    setSize(nextSize)
    setTiles(fresh)
    setScore(0)
    setMoves(0)
    setBest(loadBest(nextSize))
    setOver(false)
    setWon(false)
    wonShownRef.current = false
    snapshotRef.current = null
    setCanUndo(false)
    roundRef.current += 1
    setPhase('playing')
  }, [])

  /** 从选择页开一局：还有次数就直接开，没次数就打开任务面板 */
  const begin = useCallback(
    (nextSize: number) => {
      if (!limited || canPlay) {
        consumePlay()
        start(nextSize)
        return
      }
      setPassPanel({ task: myPending ? myPending.task : drawTask() })
    },
    [limited, canPlay, consumePlay, start, myPending, drawTask]
  )

  /** 重开当前难度；已经有分数就先记一局榜，再开新的（重开也算一局，计入防沉迷）。
      次数用完时不重开，改为弹出大冒险任务面板 */
  const reset = useCallback(() => {
    if (limited && remaining <= 0) {
      setPassPanel({ task: myPending ? myPending.task : drawTask() })
      return
    }
    report(scoreRef.current, movesRef.current, false, size)
    consumePlay()
    const fresh = makeTiles(size)
    tilesRef.current = fresh
    setTiles(fresh)
    setScore(0)
    setMoves(0)
    setOver(false)
    setWon(false)
    wonShownRef.current = false
    snapshotRef.current = null
    setCanUndo(false)
    roundRef.current += 1
  }, [size, report, consumePlay, limited, remaining, myPending, drawTask])

  /** 换难度：先把当前这局记上账，再清掉存档回到选择页，避免分数白打 */
  const exitToSetup = useCallback(() => {
    report(scoreRef.current, movesRef.current, wonShownRef.current, size)
    try {
      localStorage.removeItem(SAVE_KEY)
    } catch {
      // ignore
    }
    setOver(false)
    setWon(false)
    setPhase('setup')
    setBest(loadBest(size))
  }, [report, size])

  const undo = useCallback(() => {
    const snap = snapshotRef.current
    if (!snap) return
    snapshotRef.current = null
    setCanUndo(false)
    const restored = snap.tiles.map((t) => ({ ...t, isNew: false, merged: false }))
    tilesRef.current = restored
    setTiles(restored)
    setScore(snap.score)
    setMoves(snap.moves)
    setOver(false)
    sfx.hint()
  }, [])

  const handleMove = useCallback(
    (dir: Dir) => {
      if (over || phase !== 'playing') return
      const prev = tilesRef.current
      const { tiles: movedTiles, gained, merges, moved } = applyMove(prev, dir, size)
      if (!moved) return

      // 撤销快照：记录这一步之前的状态
      snapshotRef.current = {
        tiles: prev.map((t) => ({ ...t, isNew: false, merged: false })),
        score: scoreRef.current,
        moves: movesRef.current,
      } satisfies Snapshot
      setCanUndo(true)

      // ref 立刻更新：连续快滑时下一步必须基于这一步的结果算分，否则结算分数会偏低
      const nextScore = scoreRef.current + gained
      const nextMoves = movesRef.current + 1
      scoreRef.current = nextScore
      movesRef.current = nextMoves
      if (gained > 0) {
        setScore(nextScore)
        pushFloat(`+${gained}`)
      }
      setMoves(nextMoves)
      if (merges > 0) {
        // 音高按本步最大合并值走：合得越大音越亮
        const top = Math.max(...movedTiles.filter((t) => t.merged).map((t) => t.value))
        sfx.merge(Math.log2(top))
      } else {
        sfx.move()
      }

      const achieved = !wonShownRef.current && movedTiles.some((t) => t.value >= TARGET)
      if (achieved) {
        wonShownRef.current = true
        setWon(true)
        sfx.win()
      }

      const spawned = spawn(movedTiles, size)
      const next = spawned ?? movedTiles
      tilesRef.current = next
      setTiles(next)
      // 不做死局自动判定：什么时候结束由玩家自己决定（点「结束并重开」），走确认弹窗记榜
    },
    [over, phase, size, pushFloat, report]
  )

  // 键盘：方向键 + WASD。箭头键会滚页面，这里拦掉
  useEffect(() => {
    if (phase !== 'playing') return
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Dir> = {
        ArrowLeft: 'left',
        ArrowRight: 'right',
        ArrowUp: 'up',
        ArrowDown: 'down',
        a: 'left',
        d: 'right',
        w: 'up',
        s: 'down',
        A: 'left',
        D: 'right',
        W: 'up',
        S: 'down',
      }
      const dir = map[e.key]
      if (!dir) return
      e.preventDefault()
      handleMove(dir)
    }
    window.addEventListener('keydown', onKey, { passive: false })
    return () => window.removeEventListener('keydown', onKey)
  }, [handleMove, phase])

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0]
    touchRef.current = { x: t.clientX, y: t.clientY }
  }
  const onTouchEnd = (e: TouchEvent) => {
    const startPos = touchRef.current
    touchRef.current = null
    if (!startPos) return
    const t = e.changedTouches[0]
    const dx = t.clientX - startPos.x
    const dy = t.clientY - startPos.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return
    if (Math.abs(dx) > Math.abs(dy)) handleMove(dx > 0 ? 'right' : 'left')
    else handleMove(dy > 0 ? 'down' : 'up')
  }

  const gapRem = 0.5
  const cellW = `calc((100% - ${(size - 1) * gapRem}rem) / ${size})`
  const posStyle = (t: Tile): CSSProperties => ({
    width: cellW,
    height: cellW,
    left: `calc(${t.col} * ((100% - ${(size - 1) * gapRem}rem) / ${size} + ${gapRem}rem))`,
    top: `calc(${t.row} * ((100% - ${(size - 1) * gapRem}rem) / ${size} + ${gapRem}rem))`,
  })

  /** 保存成绩卡到本地：canvas 画一张成绩卡直接触发下载，成功后按钮提示 2 秒 */
  const saveShot = async () => {
    if (sharing) return
    setSharing(true)
    try {
      const canvas = drawShareCard(score, moves, size, wonShownRef.current)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('生成图片失败')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `star2048-${score}分.png`
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 2000)
      setSavedTip(true)
      window.setTimeout(() => setSavedTip(false), 2000)
    } catch {
      alert('生成图片失败，请重试')
    } finally {
      setSharing(false)
    }
  }

  /** 防沉迷任务面板：setup / playing 两个分支都可能弹出，提取成公共 Portal 节点 */
  const passPanelNode =
    passPanel &&
    createPortal(
      <div className="fixed inset-0 z-50 flex touch-none items-center justify-center overscroll-contain bg-slate-900/45 p-4 backdrop-blur-sm">
        <div className="animate-fade w-full max-w-xs space-y-3 rounded-2xl bg-white p-5 text-center shadow-xl">
          <div className="text-3xl">⏳</div>
          <p className="text-sm font-bold text-slate-700">今日 {DAILY_LIMIT} 局已用完</p>
          <p className="text-[11px] text-slate-400">完成这个大冒险任务，等 TA 确认后就能多玩一局</p>
          <p className="rounded-xl bg-rose-50 p-3 text-left text-xs font-medium leading-relaxed text-rose-600">
            {passPanel.task}
          </p>
          {myPending ? (
            <p className="rounded-lg bg-amber-50 p-2 text-[11px] text-amber-700">
              🕐 已提交，等 TA 在 TA 的 2048 页面点「确认」（确认后这里自动解锁）
            </p>
          ) : (
            <button type="button" className="btn-primary w-full py-2 text-xs" disabled={passBusy} onClick={() => void submitPass()}>
              ✅ 我完成啦，请 TA 确认
            </button>
          )}
          <button type="button" className="btn-ghost w-full py-2 text-xs" onClick={() => setPassPanel(null)}>
            关闭
          </button>
        </div>
      </div>,
      document.body
    )

  const sfxButton = (
    <button
      type="button"
      className="btn-ghost shrink-0 px-3 py-1.5 text-xs"
      onClick={() => setSfxEnabled(!sfxOn)}
      title="音效开关"
    >
      {sfxOn ? '🔔' : '🔕'}
    </button>
  )

  /* ------------------------------ 开局：选棋盘大小 ------------------------------ */
  if (phase === 'setup') {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 p-4 text-center">
          <div className="text-3xl">✨</div>
          <h3 className="mt-1 text-sm font-bold text-indigo-600">选一个棋盘大小</h3>
          {/* <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            盘越大越难，默认 4×4，合并出 2048 就算通关，还能继续往大合。
          </p> */}
        </div>

        {/* 防沉迷：每日局数上限 + 加时申请（完成大冒险任务 → TA 确认） */}
        {limited && (
          <div className="space-y-2 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-100">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-amber-700">⏳ 防沉迷</span>
              <span className="tabular-nums text-amber-600">
                今日 {Math.min(playsUsed, DAILY_LIMIT + myConfirmed)}/{DAILY_LIMIT + myConfirmed} 局
                {myConfirmed > 0 ? `（含任务加时 +${myConfirmed}）` : ''}
              </span>
            </div>
            {partnerPending && (
              <div className="space-y-1.5 rounded-lg bg-white p-2.5">
                <p className="text-[11px] text-slate-600">💪 TA 说完成了一个大冒险任务，确认后 TA 今天可以多玩一局：</p>
                <p className="rounded-md bg-rose-50 p-2 text-[11px] font-medium leading-relaxed text-rose-600">
                  {partnerPending.task}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-primary flex-1 py-1.5 text-xs"
                    disabled={passBusy}
                    onClick={() => void approvePass(partnerPending.id)}
                  >
                    ✅ 确认 +1 局
                  </button>
                  <button
                    type="button"
                    className="btn-ghost flex-1 py-1.5 text-xs"
                    disabled={passBusy}
                    onClick={() => void rejectPass(partnerPending.id)}
                  >
                    ❌ 不算
                  </button>
                </div>
              </div>
            )}
            {myPending && (
              <p className="rounded-lg bg-white p-2 text-[11px] text-slate-500">
                🕐 你的大冒险任务已提交，等 TA 确认后自动 +1 局
              </p>
            )}
            {!canPlay && !myPending && (
              <p className="text-[11px] leading-relaxed text-amber-600">
                今天的局数用完啦～点下面的开始按钮，完成一个大冒险任务、经 TA 确认就能多玩一局。
              </p>
            )}
          </div>
        )}

        <div className="space-y-2 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">网格大小</span>
            <span className="text-sm font-bold tabular-nums text-indigo-600">
              {customSize}×{customSize}
            </span>
          </div>
          <input
            type="range"
            min={MIN_SIZE}
            max={MAX_SIZE}
            step={1}
            value={customSize}
            onChange={(e) => setCustomSize(Number(e.target.value))}
            className="w-full accent-indigo-500"
          />
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>{MIN_SIZE}×{MIN_SIZE} 极简</span>
            {/* <span>最高 {loadBest(customSize)}</span> */}
            <span>{MAX_SIZE}×{MAX_SIZE} 地狱</span>
          </div>
          <button type="button" className="btn-primary w-full py-2 text-xs" onClick={() => begin(customSize)}>
            {canPlay || !limited
              ? `用 ${customSize}×${customSize} 开始`
              : myPending
                ? '🕐 等待 TA 确认加时…'
                : '🎯 完成大冒险任务，加玩一局'}
          </button>
        </div>

        <GameLeaderboard game="star2048" myId={myId} friendId={friendId} names={names} version={lbVersion} />
        {passPanelNode}
      </div>
    )
  }

  /* ------------------------------ 对局中 ------------------------------ */
  return (
    <div className="space-y-3">
      <div className="flex items-stretch gap-2">
        <div className="flex-1 rounded-xl bg-indigo-50 px-2 py-1.5 text-center">
          <div className="text-[10px] text-indigo-400">分数</div>
          <div className="text-base font-bold tabular-nums text-indigo-600">{score}</div>
        </div>
        <div className="flex-1 rounded-xl bg-amber-50 px-2 py-1.5 text-center">
          <div className="text-[10px] text-amber-400">{size}×{size} 最高</div>
          <div className="text-base font-bold tabular-nums text-amber-600">{best}</div>
        </div>
        <div className="flex-1 rounded-xl bg-slate-100 px-2 py-1.5 text-center">
          <div className="text-[10px] text-slate-400">步数</div>
          <div className="text-base font-bold tabular-nums text-slate-600">{moves}</div>
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn-ghost flex-1 py-1.5 text-xs" disabled={!canUndo} onClick={undo}>
          ↩️ 撤销1步
        </button>
        <button type="button" className="btn-ghost flex-1 py-1.5 text-xs" onClick={() => setOver(true)}>
          🏁 结束并重开
        </button>
        {sfxButton}
      </div>

      {/* 防沉迷局数提示：玩最后一局时明确告知，死局后会自动结算进入加时流程 */}
      {limited && (
        <p className={`text-center text-[10px] tabular-nums ${canPlay ? 'text-slate-400' : 'font-semibold text-amber-600'}`}>
          {canPlay
            ? `🎫 今日剩余 ${remaining} 局${remaining === 1 ? ' · 这是最后一局' : ''}`
            : '⏳ 今日局数已用完 · 本局结束后可做任务加时'}
        </p>
      )}

      <div
        className="relative touch-none select-none rounded-2xl bg-indigo-100 p-2"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="grid aspect-square gap-2" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
          {Array.from({ length: size * size }).map((_, i) => (
            <div key={i} className="rounded-xl bg-indigo-200/50" />
          ))}
        </div>
        <div className="absolute inset-2">
          {tiles.map((t) => {
            const st = styleOf(t.value)
            return (
              <div
                key={t.id}
                className={`absolute flex items-center justify-center rounded-xl font-bold shadow-sm transition-all duration-150 ${
                  t.merged ? 'animate-pop-in' : t.isNew ? 'animate-fade' : ''
                }`}
                style={{ ...posStyle(t), background: st.bg, color: st.fg }}
              >
                <span className={fontClass(t.value, size)}>{t.value}</span>
              </div>
            )
          })}
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-1 flex flex-col items-center">
          {floats.map((f) => (
            <span key={f.id} className="animate-fade text-sm font-bold text-amber-500 drop-shadow">
              {f.text}
            </span>
          ))}
        </div>

        {won && !over && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/80 px-4 backdrop-blur-sm">
            <div className="text-4xl">🌟</div>
            <p className="text-center font-bold text-indigo-600">合成 {TARGET}！星尘闪耀～</p>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setWon(false)}>
                继续挑战
              </button>
              <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={reset}>
                再来一局
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mx-auto grid w-40 grid-cols-3 gap-1.5">
        <span />
        <button type="button" className="btn-ghost py-2 text-lg" onClick={() => handleMove('up')}>↑</button>
        <span />
        <button type="button" className="btn-ghost py-2 text-lg" onClick={() => handleMove('left')}>←</button>
        <button type="button" className="btn-ghost py-2 text-lg" onClick={() => handleMove('down')}>↓</button>
        <button type="button" className="btn-ghost py-2 text-lg" onClick={() => handleMove('right')}>→</button>
      </div>

      <p className="text-center text-[11px] leading-relaxed text-slate-400">
        键盘方向键 / WASD、在棋盘上滑动、或点上方按钮
      </p>

      <GameLeaderboard game="star2048" myId={myId} friendId={friendId} names={names} version={lbVersion} />

      {/* 结束确认弹窗：点「结束并重开」弹出，Portal 渲染到 body。
          必须用 Portal：外层 .card 的 :active { transform } 会让 fixed 退化成相对卡片
          定位（弹窗瞬间变「页面内遮罩」并跳动），挂到 body 后不再受任何祖先影响。
          touch-none 禁止触摸手势在弹窗上滚动，防止 click 被滚动手势吃掉 */}
      {over &&
        createPortal(
          <div className="fixed inset-0 z-50 flex touch-none items-center justify-center overscroll-contain bg-slate-900/45 p-4 backdrop-blur-sm">
            <div className="animate-fade w-full max-w-xs space-y-3 rounded-2xl bg-white p-5 text-center shadow-xl">
              <div className="text-4xl">{score >= best && score > 0 ? '🏆' : '🌌'}</div>
              <p className="font-bold text-slate-600">
                {score >= best && score > 0 ? `新纪录！${score} 分` : `本局 ${score} 分`}
              </p>
              <p className="text-[11px] leading-relaxed text-slate-400">
                确定{score > 0 ? '后成绩自动记入情侣排行榜，' : '后'}返回难度选择页
              </p>
              <button type="button" className="btn-primary w-full py-2 text-xs" onClick={exitToSetup}>
                ✅ 确定
              </button>
              <button type="button" className="btn-ghost w-full py-2 text-xs" onClick={() => setOver(false)}>
                ❌ 取消，继续游戏
              </button>
              <button type="button" className="btn-ghost w-full py-2 text-xs" disabled={sharing} onClick={() => void saveShot()}>
                {savedTip ? '✅ 图片已开始下载' : sharing ? '生成图片中…' : '💾 保存截图到本地'}
              </button>
            </div>
          </div>,
          document.body
        )}
              {passPanelNode}
              </div>
              )
              }

              /**
              * 结算成绩分享卡：纯 canvas 绘制（720×960 竖版），不依赖截图库。
              * 分享出去的是这张图，手机上走系统分享面板，桌面上退化为下载 PNG。
              */
              function drawShareCard(score: number, moves: number, size: number, achieved: boolean): HTMLCanvasElement {
              const w = 720
              const h = 960
              const canvas = document.createElement('canvas')
              canvas.width = w
              canvas.height = h
              const ctx = canvas.getContext('2d')
              if (!ctx) return canvas

              // 星空渐变背景
              const bg = ctx.createLinearGradient(0, 0, w, h)
              bg.addColorStop(0, '#1e1b4b')
              bg.addColorStop(0.5, '#5b21b6')
              bg.addColorStop(1, '#db2777')
              ctx.fillStyle = bg
              ctx.fillRect(0, 0, w, h)

              // 随机星尘
              for (let i = 0; i < 90; i++) {
              ctx.fillStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.6})`
              const r = 1 + Math.random() * 2.5
              ctx.beginPath()
              ctx.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2)
              ctx.fill()
              }

              ctx.textAlign = 'center'
              // 标题
              ctx.fillStyle = 'rgba(255,255,255,0.85)'
              ctx.font = '500 40px sans-serif'
              ctx.fillText('✨ 星尘 2048 ✨', w / 2, 150)

              // 大分数
              ctx.fillStyle = '#fbbf24'
              ctx.font = 'bold 130px sans-serif'
              ctx.fillText(String(score), w / 2, 350)
              ctx.fillStyle = 'rgba(255,255,255,0.75)'
              ctx.font = '30px sans-serif'
              ctx.fillText('最 终 得 分', w / 2, 410)

              // 信息行
              ctx.fillStyle = '#ffffff'
              ctx.font = '600 38px sans-serif'
              ctx.fillText(`${size}×${size} · ${moves} 步${achieved ? ' · 🌟 达成 2048' : ''}`, w / 2, 520)

              // 分隔线
              ctx.strokeStyle = 'rgba(255,255,255,0.35)'
              ctx.lineWidth = 2
              ctx.beginPath()
              ctx.moveTo(140, 600)
              ctx.lineTo(w - 140, 600)
              ctx.stroke()

              // 底部信息
              const now = new Date()
              const pad = (n: number) => String(n).padStart(2, '0')
              ctx.fillStyle = 'rgba(255,255,255,0.65)'
              ctx.font = '26px sans-serif'
              ctx.fillText(
              `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
              w / 2,
              h - 140
              )
              ctx.fillText('来自我们的情侣小站 · 快来和我对战', w / 2, h - 85)
              return canvas
              }
