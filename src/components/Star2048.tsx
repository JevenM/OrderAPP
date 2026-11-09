import { useCallback, useEffect, useRef, useState } from 'react'
import { setSfxEnabled, sfx, sfxEnabled, subscribeSfx } from '../lib/sfx'

/**
 * 星尘 2048：传统 2048 的星空配色改版，纯单机。
 * - 分数 / 最高分 / 步数；最高分与当前局面存 localStorage（刷新接着玩）
 * - 键盘方向键（含 WASD）、触摸滑动、屏幕按钮三种操作
 * - 撤销一步（每步棋前留快照，只能撤最近一步）
 * - 合并成功有 pop 动画 + 飘分 + 音效（音高随方块数值升高）
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

const BEST_KEY = 'couple-2048-best'
const SAVE_KEY = 'couple-2048-save'
const TARGET = 2048

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
function indexFor(dir: Dir, i: number, j: number): [number, number] {
  switch (dir) {
    case 'left':
      return [i, j]
    case 'right':
      return [i, 3 - j]
    case 'up':
      return [j, i]
    case 'down':
      return [3 - j, i]
  }
}

function toGrid(tiles: Tile[]): (Tile | null)[][] {
  const grid: (Tile | null)[][] = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => null))
  for (const t of tiles) grid[t.row][t.col] = t
  return grid
}

function emptyCells(tiles: Tile[]): Array<[number, number]> {
  const grid = toGrid(tiles)
  const out: Array<[number, number]> = []
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (!grid[r][c]) out.push([r, c])
  return out
}

/** 随机补一块（90% 是 2），返回新数组；没有空位返回 null */
function spawn(tiles: Tile[]): Tile[] | null {
  const cells = emptyCells(tiles)
  if (!cells.length) return null
  const [row, col] = cells[Math.floor(Math.random() * cells.length)]
  return [...tiles, { id: newId(), value: Math.random() < 0.9 ? 2 : 4, row, col, isNew: true }]
}

/** 满盘时还有没有可合并的相邻块 */
function hasMerge(tiles: Tile[]): boolean {
  const grid = toGrid(tiles)
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const cur = grid[r][c]
      if (!cur) continue
      if (c < 3 && grid[r][c + 1]?.value === cur.value) return true
      if (r < 3 && grid[r + 1][c]?.value === cur.value) return true
    }
  }
  return false
}

function makeTiles(): Tile[] {
  let tiles: Tile[] = []
  for (let i = 0; i < 2; i++) tiles = spawn(tiles) ?? tiles
  return tiles
}

function applyMove(tiles: Tile[], dir: Dir): { tiles: Tile[]; gained: number; merges: number; moved: boolean } {
  const grid = toGrid(tiles)
  const out: Tile[] = []
  let gained = 0
  let merges = 0
  let moved = false

  for (let i = 0; i < 4; i++) {
    const line: Tile[] = []
    for (let j = 0; j < 4; j++) {
      const [row, col] = indexFor(dir, i, j)
      const t = grid[row][col]
      if (t) line.push(t)
    }
    let pos = 0
    for (let k = 0; k < line.length; k++) {
      const cur = line[k]
      const nxt = line[k + 1]
      const [row, col] = indexFor(dir, i, pos)
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
    if (!Array.isArray(saved.tiles) || !saved.tiles.length || saved.tiles.some((t) => !t || typeof t.value !== 'number')) return null
    return { ...saved, tiles: saved.tiles.map((t) => ({ ...t, isNew: false, merged: false })) }
  } catch {
    return null
  }
}

const loadBest = (): number => {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0
  } catch {
    return 0
  }
}

export default function Star2048() {
  const [tiles, setTiles] = useState<Tile[]>(() => loadSaved()?.tiles ?? makeTiles())
  const [score, setScore] = useState(() => loadSaved()?.score ?? 0)
  const [moves, setMoves] = useState(() => loadSaved()?.moves ?? 0)
  const [best, setBest] = useState(loadBest)
  const [over, setOver] = useState(false)
  const [sfxOn, setSfxOn] = useState(sfxEnabled)
  const [floats, setFloats] = useState<Array<{ id: number; text: string }>>([])
  /** 撤销用的快照：只在最近一步有效 */
  const snapshotRef = useRef<Snapshot | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  /** 2048 的胜利提示只弹一次，之后可以继续往大合 */
  const wonShownRef = useRef(false)
  const [won, setWon] = useState(false)
  const touchRef = useRef<{ x: number; y: number } | null>(null)
  const floatSeed = useRef(1)

  useEffect(() => subscribeSfx(() => setSfxOn(sfxEnabled())), [])

  // 当前局面与最高分落 localStorage：刷新 / 重开页面接着玩
  useEffect(() => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ tiles, score, moves, won } satisfies Saved))
    } catch {
      // 写不进去就算了，最多是刷新后重开一局
    }
  }, [tiles, score, moves, won])
  useEffect(() => {
    if (score <= best) return
    setBest(score)
    try {
      localStorage.setItem(BEST_KEY, String(score))
    } catch {
      // ignore
    }
  }, [score, best])

  const pushFloat = useCallback((text: string) => {
    const id = floatSeed.current++
    setFloats((prev) => [...prev, { id, text }])
    window.setTimeout(() => setFloats((prev) => prev.filter((f) => f.id !== id)), 900)
  }, [])

  const reset = useCallback(() => {
    const fresh = makeTiles()
    tilesRef.current = fresh
    setTiles(fresh)
    setScore(0)
    setMoves(0)
    setOver(false)
    setWon(false)
    wonShownRef.current = false
    snapshotRef.current = null
    setCanUndo(false)
  }, [])

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

  // 用 ref 镜像最新局面：一是不把副作用塞进 setState 的 updater（StrictMode 会双调用，
  // 分数就会被加两次），二是快速连滑时上一次 setState 还没来得及渲染，闭包里的 tiles 是旧的
  const tilesRef = useRef(tiles)
  tilesRef.current = tiles
  const scoreRef = useRef(score)
  scoreRef.current = score
  const movesRef = useRef(moves)
  movesRef.current = moves

  const handleMove = useCallback(
    (dir: Dir) => {
      if (over) return
      const prev = tilesRef.current
      const { tiles: movedTiles, gained, merges, moved } = applyMove(prev, dir)
      if (!moved) return

      // 撤销快照：记录这一步之前的状态
      snapshotRef.current = {
        tiles: prev.map((t) => ({ ...t, isNew: false, merged: false })),
        score: scoreRef.current,
        moves: movesRef.current,
      } satisfies Snapshot
      setCanUndo(true)

      if (gained > 0) {
        setScore((s) => s + gained)
        pushFloat(`+${gained}`)
      }
      setMoves((m) => m + 1)
      if (merges > 0) {
        // 音高按本步最大合并值走：合得越大音越亮
        const top = Math.max(...movedTiles.filter((t) => t.merged).map((t) => t.value))
        sfx.merge(Math.log2(top))
      } else {
        sfx.move()
      }

      if (!wonShownRef.current && movedTiles.some((t) => t.value >= TARGET)) {
        wonShownRef.current = true
        setWon(true)
        sfx.win()
      }

      const spawned = spawn(movedTiles)
      const next = spawned ?? movedTiles
      tilesRef.current = next
      setTiles(next)
      if (!spawned && !hasMerge(movedTiles)) {
        setOver(true)
        sfx.lose()
      }
    },
    [over, pushFloat]
  )

  // 键盘：方向键 + WASD。箭头键会滚页面，这里拦掉
  useEffect(() => {
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
  }, [handleMove])

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    touchRef.current = { x: t.clientX, y: t.clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchRef.current
    touchRef.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return
    if (Math.abs(dx) > Math.abs(dy)) handleMove(dx > 0 ? 'right' : 'left')
    else handleMove(dy > 0 ? 'down' : 'up')
  }

  const cellW = 'calc((100% - 1.5rem) / 4)'
  const posStyle = (t: Tile): React.CSSProperties => ({
    width: cellW,
    height: cellW,
    left: `calc(${t.col} * ((100% - 1.5rem) / 4 + 0.5rem))`,
    top: `calc(${t.row} * ((100% - 1.5rem) / 4 + 0.5rem))`,
  })

  return (
    <div className="space-y-3">
      {/* 顶栏：分数 / 最高分 / 步数 + 撤销、重开 */}
      <div className="flex items-stretch gap-2">
        <div className="flex-1 rounded-xl bg-indigo-50 px-2 py-1.5 text-center">
          <div className="text-[10px] text-indigo-400">分数</div>
          <div className="text-base font-bold tabular-nums text-indigo-600">{score}</div>
        </div>
        <div className="flex-1 rounded-xl bg-amber-50 px-2 py-1.5 text-center">
          <div className="text-[10px] text-amber-400">最高分</div>
          <div className="text-base font-bold tabular-nums text-amber-600">{best}</div>
        </div>
        <div className="flex-1 rounded-xl bg-slate-100 px-2 py-1.5 text-center">
          <div className="text-[10px] text-slate-400">步数</div>
          <div className="text-base font-bold tabular-nums text-slate-600">{moves}</div>
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn-ghost flex-1 py-1.5 text-xs" disabled={!canUndo || over} onClick={undo}>
          ↩️ 撤销一步
        </button>
        <button type="button" className="btn-ghost flex-1 py-1.5 text-xs" onClick={reset}>
          🔄 重新开始
        </button>
        <button
          type="button"
          className="btn-ghost shrink-0 px-3 py-1.5 text-xs"
          onClick={() => setSfxEnabled(!sfxOn)}
          title="音效开关"
        >
          {sfxOn ? '🔔' : '🔕'}
        </button>
      </div>

      {/* 棋盘：底格 + 滑动层 */}
      <div
        className="relative touch-none select-none rounded-2xl bg-indigo-100 p-2"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="grid aspect-square grid-cols-4 gap-2">
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-indigo-200/50" />
          ))}
        </div>
        <div className="absolute inset-2">
          {tiles.map((t) => {
            const st = styleOf(t.value)
            const size = t.value >= 1024 ? 'text-lg' : t.value >= 128 ? 'text-xl' : 'text-2xl'
            return (
              <div
                key={t.id}
                className={`absolute flex items-center justify-center rounded-xl font-bold shadow-sm transition-all duration-150 ${
                  t.merged ? 'animate-pop-in' : t.isNew ? 'animate-fade' : ''
                }`}
                style={{ ...posStyle(t), background: st.bg, color: st.fg }}
              >
                <span className={size}>{t.value}</span>
              </div>
            )
          })}
        </div>

        {/* 合并飘分 */}
        <div className="pointer-events-none absolute inset-x-0 top-1 flex flex-col items-center">
          {floats.map((f) => (
            <span key={f.id} className="animate-fade text-sm font-bold text-amber-500 drop-shadow">
              {f.text}
            </span>
          ))}
        </div>

        {/* 结束 / 达成遮罩 */}
        {(over || won) && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/80 backdrop-blur-sm">
            {won && !over ? (
              <>
                <div className="text-4xl">🌟</div>
                <p className="font-bold text-indigo-600">合成 {TARGET}！星尘闪耀～</p>
                <div className="flex gap-2">
                  <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setWon(false)}>
                    继续挑战
                  </button>
                  <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={reset}>
                    再来一局
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-4xl">{score >= best && score > 0 ? '🏆' : '🌌'}</div>
                <p className="font-bold text-slate-600">
                  {score >= best && score > 0 ? `新纪录！${score} 分` : `棋盘满了，本局 ${score} 分`}
                </p>
                <button type="button" className="btn-primary px-4 py-1.5 text-xs" onClick={reset}>
                  再来一局
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* 手机方向按钮 */}
      <div className="mx-auto grid w-40 grid-cols-3 gap-1.5">
        <span />
        <button type="button" className="btn-ghost py-2 text-lg" onClick={() => handleMove('up')}>↑</button>
        <span />
        <button type="button" className="btn-ghost py-2 text-lg" onClick={() => handleMove('left')}>←</button>
        <button type="button" className="btn-ghost py-2 text-lg" onClick={() => handleMove('down')}>↓</button>
        <button type="button" className="btn-ghost py-2 text-lg" onClick={() => handleMove('right')}>→</button>
      </div>

      <p className="text-center text-[11px] leading-relaxed text-slate-400">
        键盘方向键 / WASD、在棋盘上滑动、或点上方按钮都行 · 合并出 2048 即通关，还能继续往大合
        {' · '}同数值方块相撞会合并，分数最高的一局会一直留在这台手机上
      </p>
    </div>
  )
}
