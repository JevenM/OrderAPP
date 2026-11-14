/**
 * 💡 关灯挑战（Lights Out）：5×5 单机解谜。
 * 点击任意格子，自身与上下左右一起翻转；全部熄灭即胜利，统计点击步数。
 * 开局从「全灭」出发随机点 6~10 个不同格子生成 —— 每次点击都是合法操作，
 * 逆操作就是解，所以灯阵必然可解；再保证至少亮一盏，避免开局即胜利。
 */
import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const SIZE = 5
type Grid = boolean[]

const idx = (r: number, c: number) => r * SIZE + c
const inBoard = (r: number, c: number) => r >= 0 && r < SIZE && c >= 0 && c < SIZE

/** 五向翻转：中心 + 上下左右，越界方向不处理 */
function toggleAt(g: Grid, r: number, c: number) {
  const dirs: [number, number][] = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]
  for (const [dr, dc] of dirs) {
    const rr = r + dr
    const cc = c + dc
    if (inBoard(rr, cc)) g[idx(rr, cc)] = !g[idx(rr, cc)]
  }
}

/** 从全灭随机点 6~10 个不同格子，得到必可解的开局灯阵 */
function generateSolvable(): Grid {
  const g: Grid = new Array(SIZE * SIZE).fill(false)
  const picked = new Set<number>()
  const count = 6 + Math.floor(Math.random() * 5)
  while (picked.size < count) picked.add(Math.floor(Math.random() * SIZE * SIZE))
  picked.forEach((i) => toggleAt(g, Math.floor(i / SIZE), i % SIZE))
  return g
}

export default function LightsOut() {
  const [grid, setGrid] = useState<Grid>(() => generateSolvable())
  /** 盘面镜像：点击时同步更新，胜负判定不依赖 setState 时序 */
  const gridRef = useRef<Grid>(grid)
  const startRef = useRef<Grid>(grid)
  const [moves, setMoves] = useState(0)
  const [won, setWon] = useState(false)
  /** 刚被这次点击翻转的格子：加个短脉冲动画 */
  const [flipping, setFlipping] = useState<number[]>([])

  const litCount = grid.filter(Boolean).length

  /** 点击 (r,c)：翻转五格；全部熄灭即胜利 */
  const tap = useCallback((r: number, c: number) => {
    const next = [...gridRef.current]
    toggleAt(next, r, c)
    gridRef.current = next
    setGrid(next)
    setMoves((m) => m + 1)
    const hit: number[] = []
    for (const [dr, dc] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]] as [number, number][]) {
      if (inBoard(r + dr, c + dc)) hit.push(idx(r + dr, c + dc))
    }
    setFlipping(hit)
    window.setTimeout(() => setFlipping([]), 320)
    if (next.every((v) => !v)) setWon(true)
  }, [])

  /** 开新一局：生成新灯阵并记为本局初始（供「重置」使用） */
  const newGame = useCallback(() => {
    const g = generateSolvable()
    gridRef.current = g
    startRef.current = g
    setGrid(g)
    setMoves(0)
    setWon(false)
  }, [])

  return (
    <div className="flex flex-col items-center gap-4">
      <style>{`
        @keyframes lo-flip { 0% { transform: scale(1); } 40% { transform: scale(0.82); } 100% { transform: scale(1); } }
        @keyframes lo-fall { to { transform: translateY(105vh) rotate(720deg); opacity: 0.5; } }
      `}</style>

      {/* 计分栏 */}
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-slate-100 px-4 py-1.5 text-center">
          <div className="text-base font-bold tabular-nums text-slate-700">{moves}</div>
          <div className="text-[10px] text-slate-400">点击步数</div>
        </div>
        <div className="rounded-xl bg-slate-100 px-4 py-1.5 text-center">
          <div className={`text-base font-bold tabular-nums ${litCount === 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
            {litCount}
          </div>
          <div className="text-[10px] text-slate-400">亮着的灯</div>
        </div>
      </div>

      {/* 5×5 棋盘 */}
      <div className="grid w-full max-w-[340px] grid-cols-5 gap-2 rounded-2xl bg-slate-800 p-3 shadow-inner">
        {grid.map((on, i) => {
          const r = Math.floor(i / SIZE)
          const c = i % SIZE
          return (
            <button
              key={i}
              type="button"
              aria-label={`第${r + 1}行第${c + 1}列`}
              className={`relative aspect-square w-full rounded-xl transition-all duration-200 active:scale-90 ${
                flipping.includes(i) ? 'animate-[lo-flip_0.3s_ease]' : ''
              } ${
                on
                  ? 'bg-gradient-to-br from-amber-200 via-amber-300 to-amber-500 shadow-[0_0_14px_rgba(251,191,36,0.6)]'
                  : 'bg-gradient-to-br from-slate-600 to-slate-800 shadow-[inset_0_2px_6px_rgba(0,0,0,0.55)]'
              }`}
              onClick={() => tap(r, c)}
            >
              {on && <span className="pointer-events-none absolute inset-[30%] rounded-full bg-white/50 blur-[2px]" />}
            </button>
          )
        })}
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-3">
        <button type="button" className="btn-primary px-4 py-2 text-xs" onClick={newGame}>
          🎲 新一局
        </button>
        <button
          type="button"
          className="btn-ghost px-4 py-2 text-xs"
          onClick={() => {
            if (won) return
            setGrid([...startRef.current])
            setMoves(0)
          }}
        >
          ↩️ 重置本局
        </button>
      </div>

      {/* 胜利弹窗：Portal 挂 body，避开 .card 的 :active transform 对 fixed 的影响 */}
      {won &&
        createPortal(
          <div className="fixed inset-0 z-50 flex touch-none items-center justify-center overscroll-contain bg-slate-900/70 p-4 backdrop-blur-sm">
            {/* 撒花 */}
            {Array.from({ length: 50 }, (_, i) => (
              <span
                key={i}
                className="pointer-events-none fixed top-[-12px] h-3.5 w-2 rounded-sm"
                style={{
                  left: `${(i * 37) % 100}vw`,
                  background: ['#fbbf24', '#38bdf8', '#f472b6', '#a3e635', '#c084fc'][i % 5],
                  animation: `lo-fall ${1.8 + (i % 7) * 0.25}s linear ${(i % 10) * 0.06}s forwards`,
                }}
              />
            ))}
            <div className="w-full max-w-xs space-y-2 rounded-2xl bg-white p-6 text-center shadow-2xl">
              <div className="text-3xl">🎉</div>
              <h4 className="text-base font-bold text-slate-700">全部关灯啦！</h4>
              <p className="text-xs text-slate-400">
                本局共用 <b className="text-base text-amber-500">{moves}</b> 步通关
              </p>
              <button type="button" className="btn-primary w-full py-2 text-xs" onClick={newGame}>
                再来一局
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
