import { useEffect, useRef, useState } from 'react'
import { sfx } from '../lib/sfx'
import {
  CELL_REVEAL_RATIO,
  SCRATCH_ZODIAC,
  SCRATCH_ZODIAC_EMOJI,
  type ScratchCell,
  type ScratchTheme,
  type ScratchTier,
} from '../lib/scratchThemes'

/**
 * 单张刮刮乐票面（参考国内福利彩票刮刮乐票面样式）：
 * - 外层：主题背景（配了图用图，没配图用渐变 + 暗纹兜底）+ 纸质纤维纹理
 * - 票头：主题名、副标题、彩票编号
 * - 多格玩法：票面印着「中奖号码」，刮奖区 3×3 小涂层格，
 *   每格藏着「号码 + 文字」，号码对上就赢该格奖励，全部刮开整票揭晓
 * - 单格玩法（老票兼容）：一整块涂层，刮开 40% 自动整张揭晓
 * - 票尾：纯娱乐提示（没有任何充值 / 兑奖入口）
 *
 * 涂层只存在于前端；「是否已揭晓」由父组件按数据库状态决定，所以刷新后依然是揭开的票面。
 */

/** 大涂层逻辑坐标系（16:9），由 CSS 拉伸到容器，不关心设备像素比 */
const COVER_W = 640
const COVER_H = 360
/** 小涂层（每格）逻辑坐标系 */
const CELL_W = 200
const CELL_H = 150
/** 刮开比例达到这个值就自动揭晓 */
const REVEAL_RATIO = 0.4

const TIER_META: Record<ScratchTier, { icon: string; label: string }> = {
  big: { icon: '🏆', label: '甜蜜大奖' },
  small: { icon: '🎁', label: '甜蜜小奖' },
  none: { icon: '😅', label: '谢谢参与' },
}

/** 纸纤维：两层极细的横竖条纹，叠在背景上就是「印刷纸」的手感 */
const PAPER_FIBER =
  'repeating-linear-gradient(0deg, rgba(255,255,255,0.055) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgba(0,0,0,0.045) 0 1px, transparent 1px 4px)'

/* ------------------------------ 银粉涂层 ------------------------------ */

/**
 * 铺一层磨砂银粉涂层。
 * hint=false 时（小格子）不画提示文字，格子太小放不下；纸面观感一致。
 */
function paintCover(ctx: CanvasRenderingContext2D, w: number, h: number, hint = true) {
  // 1) 斜向金属渐变打底
  const grad = ctx.createLinearGradient(0, 0, w, h)
  grad.addColorStop(0, '#b6bfcb')
  grad.addColorStop(0.32, '#e9edf2')
  grad.addColorStop(0.55, '#ccd4de')
  grad.addColorStop(0.78, '#e2e7ee')
  grad.addColorStop(1, '#a4aebc')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)

  // 2) 银色颗粒：随机深浅小点，做出磨砂银粉的颗粒感
  const grains = Math.round((w * h) / (COVER_W * COVER_H) * 1100)
  for (let i = 0; i < grains; i += 1) {
    const x = Math.random() * w
    const y = Math.random() * h
    const r = Math.random() * 1.7 + 0.3
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = Math.random() > 0.48 ? 'rgba(255,255,255,0.55)' : 'rgba(118,130,148,0.3)'
    ctx.fill()
  }

  // 3) 斜向拉丝：涂层被压平时留下的细纹
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'
  ctx.lineWidth = 1
  for (let x = -h; x < w; x += 7) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x + h, h)
    ctx.stroke()
  }

  if (!hint) return
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(84,96,114,0.88)'
  ctx.font = '600 24px system-ui,-apple-system,sans-serif'
  ctx.fillText('🎫  刮开涂层', w / 2, h / 2 - 12)
  ctx.fillStyle = 'rgba(104,116,134,0.72)'
  ctx.font = '500 13px system-ui,-apple-system,sans-serif'
  ctx.fillText('刮开 40% 自动揭晓', w / 2, h / 2 + 20)
}

/**
 * 一个独立的涂层块：大涂层（整块刮奖区）或小涂层（多格玩法的一格）共用这套手势逻辑。
 * 刮开面积达到 ratio 自动回调 onClear（只回调一次）。
 */
function ScratchLayer({
  width,
  height,
  ratio,
  hint,
  radiusScale,
  onClear,
  sound,
}: {
  width: number
  height: number
  ratio: number
  hint: boolean
  /** 擦除笔触按涂层宽度等比缩放 */
  radiusScale: number
  onClear: () => void
  /** 每次刮擦播放的音效 */
  sound: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef(false)
  const doneRef = useRef(false)
  const lastRef = useRef<{ x: number; y: number } | null>(null)
  const lastCheckRef = useRef(0)
  const lastSoundRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (ctx) paintCover(ctx, width, height, hint)
  }, [width, height, hint])

  /** 按 8px 步长采样 alpha 通道，算刮开比例 */
  const checkCleared = () => {
    if (doneRef.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const data = ctx.getImageData(0, 0, width, height).data
    let cleared = 0
    let total = 0
    const step = 8
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        total += 1
        // alpha < 90 视为这一块已被刮掉
        if (data[(y * width + x) * 4 + 3] < 90) cleared += 1
      }
    }
    if (total > 0 && cleared / total >= ratio) {
      doneRef.current = true
      onClear()
    }
  }

  const eraseAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas || doneRef.current) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const x = ((clientX - rect.left) / rect.width) * width
    const y = ((clientY - rect.top) / rect.height) * height

    ctx.globalCompositeOperation = 'destination-out'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    // 从上一点连到当前点，快速滑动也不会断成一串圆点；刮痕加宽后刮开速度明显更快
    const last = lastRef.current
    if (last) {
      ctx.lineWidth = 58 * radiusScale
      ctx.beginPath()
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(x, y)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.arc(x, y, 29 * radiusScale, 0, Math.PI * 2)
    ctx.fill()
    lastRef.current = { x, y }

    const now = performance.now()
    // 刮擦声按 60ms 节流：太密会糊成一片噪音
    if (now - lastSoundRef.current > 60) {
      lastSoundRef.current = now
      sound()
    }
    // 覆盖率检查比较重（要读整张位图），120ms 一次足够跟手
    if (now - lastCheckRef.current > 120) {
      lastCheckRef.current = now
      checkCleared()
    }
  }

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute inset-0 h-full w-full cursor-pointer select-none"
      style={{ touchAction: 'none' }}
      onPointerDown={(event) => {
        drawingRef.current = true
        lastRef.current = null
        event.currentTarget.setPointerCapture(event.pointerId)
        eraseAt(event.clientX, event.clientY)
      }}
      onPointerMove={(event) => {
        if (!drawingRef.current) return
        eraseAt(event.clientX, event.clientY)
      }}
      onPointerUp={() => {
        drawingRef.current = false
        lastRef.current = null
        checkCleared()
      }}
      onPointerCancel={() => {
        drawingRef.current = false
        lastRef.current = null
      }}
      onPointerLeave={() => {
        drawingRef.current = false
        lastRef.current = null
      }}
    />
  )
}

/** 多格玩法的本地进度：已刮开的格子下标。刮一半刷新不用重头再来 */
const openKey = (cardId: string) => `couple-scratch-open-${cardId}`

function readOpenCells(cardId: string): number[] {
  try {
    const raw = localStorage.getItem(openKey(cardId))
    if (!raw) return []
    const list = JSON.parse(raw)
    return Array.isArray(list) ? list.filter((n) => Number.isInteger(n)) : []
  } catch {
    return []
  }
}

function saveOpenCells(cardId: string, list: number[]) {
  try {
    localStorage.setItem(openKey(cardId), JSON.stringify(list))
  } catch {
    // 写不进去最多是刷新后重刮
  }
}

/* ------------------------------ 票面 ------------------------------ */

interface Props {
  theme: ScratchTheme
  ticketNo: string
  tier: ScratchTier
  prize: string
  revealed: boolean
  onReveal: () => void
  /** 只能看不能刮（对方的票）：涂层照常盖着，但不响应手势 */
  locked?: boolean
  /** 多格玩法：每个涂层格的内容；老卡没有这个字段，走单格涂层模式 */
  cells?: ScratchCell[]
  /** 多格玩法：印在票面上的中奖号码（0-9） */
  lucky?: number
}

export default function ScratchTicket({
  theme,
  ticketNo,
  tier,
  prize,
  revealed,
  onReveal,
  locked = false,
  cells,
  lucky,
}: Props) {
  const meta = TIER_META[tier]
  const zodiac = theme.id === 'shengxiao' ? SCRATCH_ZODIAC : ''
  const zodiacEmoji = zodiac ? (SCRATCH_ZODIAC_EMOJI[zodiac] ?? '🐉') : ''
  const multi = Array.isArray(cells) && cells.length > 0

  /* 多格玩法：本地已刮开的格子。整票（数据库）揭晓后全部视为已开 */
  const [openSet, setOpenSet] = useState<Set<number>>(() => {
    if (!multi || revealed) return new Set(multi ? cells!.map((_, i) => i) : [])
    return new Set(readOpenCells(ticketNo + prize))
  })

  /** 刮开一格：记录进度、轻音效；全部格子都开了才整票揭晓（上报数据库） */
  const openCell = (index: number, total: number) => {
    sfx.cellReveal()
    const next = new Set(openSet)
    next.add(index)
    saveOpenCells(ticketNo + prize, [...next])
    setOpenSet(next)
    if (next.size >= total) {
      sfx.reveal()
      onReveal()
    }
  }

  const isOpen = (index: number) => revealed || openSet.has(index)
  // 只在多格模式用：老票（单格涂层）没有 cells，直接读会炸
  const openCount = multi && revealed ? cells!.length : openSet.size

  return (
    <div
      className="relative flex aspect-[3/4] flex-col overflow-hidden rounded-2xl shadow-[0_12px_28px_-14px_rgba(15,23,42,0.55)] ring-1 ring-black/10"
      style={{ background: theme.fallback }}
    >
      {/* 背景图：放进 public/scratch-themes/ 后把路径填到主题配置里即可。
          图加载失败时隐藏 img，露出容器的主题渐变兜底，不会留下破图图标 */}
      {theme.image && (
        <img
          src={theme.image}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          aria-hidden
          onError={(event) => {
            event.currentTarget.style.display = 'none'
          }}
        />
      )}

      {/* 没有背景图时的暗纹兜底：两层点阵，位置错开一点更像印花 */}
      {!theme.image && (
        <div
          className="absolute inset-0"
          aria-hidden
          style={{
            backgroundImage: `radial-gradient(circle, ${theme.motif} 0 2px, transparent 2px), radial-gradient(circle, ${theme.motif} 0 1.5px, transparent 1.5px)`,
            backgroundSize: '26px 26px, 34px 34px',
            backgroundPosition: '0 0, 13px 17px',
          }}
        />
      )}

      {/* 纸质纤维 + 四角柔光：让票面不像纯色块 */}
      <div className="absolute inset-0 opacity-70" aria-hidden style={{ backgroundImage: PAPER_FIBER }} />
      <div
        className="absolute inset-0"
        aria-hidden
        style={{ background: 'radial-gradient(120% 80% at 50% -10%, rgba(255,255,255,0.28), transparent 60%)' }}
      />

      {/* 票面固定 3:4（接近背景图的 2:3），内容竖向分布：票头在上、刮奖区居中、票尾在下 */}
      <div className="relative flex flex-1 flex-col p-3">
        {/* 票头：印章 + 主题名 + 彩票编号 */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-sm font-black shadow-sm"
              style={{ color: theme.sealInk, background: theme.accent }}
            >
              {theme.seal}
            </span>
            <div className="min-w-0">
              <div className="truncate text-base font-black leading-tight tracking-wide" style={{ color: theme.ink }}>
                {theme.name}
                {zodiac ? ` · ${zodiac}` : ''}
              </div>
              <div className="truncate text-[10px] leading-tight" style={{ color: theme.inkSoft }}>
                {theme.slogan}
              </div>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[9px] leading-none" style={{ color: theme.inkSoft }}>
              彩票编号
            </div>
            <div
              className="mt-0.5 font-mono text-[9px] leading-none tabular-nums tracking-tight"
              style={{ color: theme.accent }}
            >
              {ticketNo}
            </div>
          </div>
        </div>

        {/* 多格玩法：中奖号码条——真票上这行是印出来的，刮奖区里的号码和它对上就中奖 */}
        {multi && (
          <div
            className="mt-2 flex items-center gap-2 rounded-lg px-2.5 py-1"
            style={{ background: 'rgba(255,255,255,0.82)', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06)' }}
          >
            <span className="text-[10px] font-semibold" style={{ color: theme.panelInk }}>
              中奖号码
            </span>
            <span
              className="grid h-6 w-6 place-items-center rounded-full text-sm font-black shadow-sm"
              style={{ color: theme.sealInk, background: theme.accent }}
            >
              {lucky ?? '?'}
            </span>
            <span className="ml-auto text-[9px]" style={{ color: theme.panelInk, opacity: 0.66 }}>
              刮出相同号码即得该格奖励
            </span>
          </div>
        )}

        {/* 刮奖区 */}
        <div className="flex flex-1 items-center py-2">
          {multi ? (
            /* 多格：3×3 小涂层，每格独立刮开 40% 揭晓该格 */
            <div className="grid w-full grid-cols-3 gap-1.5">
              {cells!.map((cell, i) => {
                const open = isOpen(i)
                return (
                  <div
                    key={i}
                    className={`relative aspect-[4/3] overflow-hidden rounded-lg ${
                      open && cell.win ? 'ring-2' : ''
                    }`}
                    style={
                      open && cell.win
                        ? { boxShadow: `0 0 0 2px ${theme.accent}, 0 0 10px ${theme.accent}66` }
                        : { boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)' }
                    }
                  >
                    {/* 格面：号码 + 文字；中奖格金色高亮 + 角标 */}
                    <div
                      className="flex h-full w-full flex-col items-center justify-center gap-0.5 px-1 text-center"
                      style={{
                        background: open && cell.win
                          ? 'linear-gradient(160deg,#fff3d6,#ffe6ad)'
                          : theme.panel,
                      }}
                    >
                      {open && cell.win && (
                        <span className="absolute right-1 top-1 text-[10px] leading-none">🎉</span>
                      )}
                      <span
                        className="text-base font-black leading-none tabular-nums"
                        style={{ color: open && cell.win ? '#b8860b' : theme.panelInk }}
                      >
                        {cell.n}
                      </span>
                      <span
                        className={`text-[8px] font-medium leading-tight ${
                          cell.prize.length > 8 ? 'line-clamp-2' : ''
                        }`}
                        style={{ color: open && cell.win ? '#8a6400' : theme.panelInk, opacity: 0.85 }}
                      >
                        {cell.prize}
                      </span>
                    </div>

                    {/* 涂层：这格没开就盖着；对方的票锁手势 */}
                    {!open && (
                      <div className={`absolute inset-0 ${locked ? 'pointer-events-none' : ''}`}>
                        <ScratchLayer
                          width={CELL_W}
                          height={CELL_H}
                          ratio={CELL_REVEAL_RATIO}
                          hint={false}
                          radiusScale={CELL_W / COVER_W}
                          sound={() => sfx.scratch()}
                          onClear={() => !locked && openCell(i, cells!.length)}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            /* 单格（老票兼容）：一整块涂层，刮开 40% 自动整张揭晓 */
            <div
              className="relative aspect-video w-full overflow-hidden rounded-xl"
              style={{ background: theme.panel, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)' }}
            >
              <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 px-3 text-center">
                {zodiacEmoji && <div className="text-lg leading-none opacity-80">{zodiacEmoji}</div>}
                <div className="text-xl leading-none">{meta.icon}</div>
                <div className="text-sm font-black tracking-wide" style={{ color: theme.panelInk }}>
                  {meta.label}
                </div>
                <div className="text-[11px] font-medium leading-snug" style={{ color: theme.panelInk }}>
                  {prize}
                </div>
              </div>

              {!revealed && (
                <div className={`absolute inset-0 ${locked ? 'pointer-events-none' : ''}`}>
                  <ScratchLayer
                    width={COVER_W}
                    height={COVER_H}
                    ratio={REVEAL_RATIO}
                    hint
                    radiusScale={1}
                    sound={() => sfx.scratch()}
                    onClear={() => {
                      sfx.reveal()
                      onReveal()
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* 多格玩法：汇总条——没刮完显示进度，刮完显示整票结果 */}
        {multi && (
          <div
            className="mt-2 flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5"
            style={{ background: 'rgba(255,255,255,0.82)', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06)' }}
          >
            <span className="text-[9px] font-semibold" style={{ color: theme.panelInk, opacity: 0.72 }}>
              {openCount === cells!.length ? '我的奖品' : '刮奖进度'}
            </span>
            {openCount === cells!.length ? (
              <span className="truncate text-[10px] font-black" style={{ color: theme.panelInk }}>
                {meta.icon} {prize}
              </span>
            ) : (
              <span className="text-[10px] font-bold tabular-nums" style={{ color: theme.panelInk, opacity: 0.8 }}>
                {openCount} / {cells!.length} 格
              </span>
            )}
          </div>
        )}

        {/* 票尾 */}
        <div className="mt-2 flex items-center justify-between gap-2 text-[9px]" style={{ color: theme.inkSoft }}>
          <span className="truncate">仅供情侣娱乐 · 不设充值 / 兑奖</span>
          <span className="shrink-0">
            {revealed ? '已开奖' : multi ? `已刮 ${openCount}/${cells!.length} 格` : '刮开涂层'}
          </span>
        </div>
      </div>
    </div>
  )
}
