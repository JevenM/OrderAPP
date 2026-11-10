import { useEffect, useRef } from 'react'
import { sfx } from '../lib/sfx'
import {
  SCRATCH_ZODIAC,
  SCRATCH_ZODIAC_EMOJI,
  type ScratchTheme,
  type ScratchTier,
} from '../lib/scratchThemes'

/**
 * 单张刮刮乐票面（参考国内福利彩票刮刮乐票面样式）：
 * - 外层：主题背景（配了图用图，没配图用渐变 + 暗纹兜底）+ 纸质纤维纹理
 * - 票头：主题名、副标题、彩票编号
 * - 中间刮奖区：磨砂银粉涂层 canvas，刮开 60% 自动整张揭晓
 * - 票尾：纯娱乐提示（没有任何充值 / 兑奖入口）
 *
 * 涂层只存在于前端；「是否已揭晓」由父组件按数据库状态决定，所以刷新后依然是揭开的票面。
 */

/** 涂层逻辑坐标系（16:9），由 CSS 拉伸到容器，不关心设备像素比 */
const COVER_W = 640
const COVER_H = 360
/** 刮开比例达到这个值就自动整张揭开 */
const REVEAL_RATIO = 0.6

const TIER_META: Record<ScratchTier, { icon: string; label: string }> = {
  big: { icon: '🏆', label: '甜蜜大奖' },
  small: { icon: '🎁', label: '甜蜜小奖' },
  none: { icon: '😅', label: '谢谢参与' },
}

/** 纸纤维：两层极细的横竖条纹，叠在背景上就是「印刷纸」的手感 */
const PAPER_FIBER =
  'repeating-linear-gradient(0deg, rgba(255,255,255,0.055) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgba(0,0,0,0.045) 0 1px, transparent 1px 4px)'

/* ------------------------------ 银粉涂层 ------------------------------ */

function paintCover(ctx: CanvasRenderingContext2D) {
  // 1) 斜向金属渐变打底
  const grad = ctx.createLinearGradient(0, 0, COVER_W, COVER_H)
  grad.addColorStop(0, '#b6bfcb')
  grad.addColorStop(0.32, '#e9edf2')
  grad.addColorStop(0.55, '#ccd4de')
  grad.addColorStop(0.78, '#e2e7ee')
  grad.addColorStop(1, '#a4aebc')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, COVER_W, COVER_H)

  // 2) 银色颗粒：随机深浅小点，做出磨砂银粉的颗粒感
  for (let i = 0; i < 1100; i += 1) {
    const x = Math.random() * COVER_W
    const y = Math.random() * COVER_H
    const r = Math.random() * 1.7 + 0.3
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = Math.random() > 0.48 ? 'rgba(255,255,255,0.55)' : 'rgba(118,130,148,0.3)'
    ctx.fill()
  }

  // 3) 斜向拉丝：涂层被压平时留下的细纹
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'
  ctx.lineWidth = 1
  for (let x = -COVER_H; x < COVER_W; x += 7) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x + COVER_H, COVER_H)
    ctx.stroke()
  }

  // 4) 中央提示
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(84,96,114,0.88)'
  ctx.font = '600 24px system-ui,-apple-system,sans-serif'
  ctx.fillText('🎫  刮开涂层', COVER_W / 2, COVER_H / 2 - 12)
  ctx.fillStyle = 'rgba(104,116,134,0.72)'
  ctx.font = '500 13px system-ui,-apple-system,sans-serif'
  ctx.fillText('刮开 60% 自动揭晓', COVER_W / 2, COVER_H / 2 + 20)
}

function ScratchLayer({ onReveal }: { onReveal: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef(false)
  const doneRef = useRef(false)
  const lastRef = useRef<{ x: number; y: number } | null>(null)
  const lastCheckRef = useRef(0)
  const lastSoundRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (ctx) paintCover(ctx)
  }, [])

  /** 按 8px 步长采样 alpha 通道，算刮开比例 */
  const checkCleared = () => {
    if (doneRef.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const data = ctx.getImageData(0, 0, COVER_W, COVER_H).data
    let cleared = 0
    let total = 0
    const step = 8
    for (let y = 0; y < COVER_H; y += step) {
      for (let x = 0; x < COVER_W; x += step) {
        total += 1
        // alpha < 90 视为这一格已被刮掉
        if (data[(y * COVER_W + x) * 4 + 3] < 90) cleared += 1
      }
    }
    if (total > 0 && cleared / total >= REVEAL_RATIO) {
      doneRef.current = true
      sfx.reveal()
      onReveal()
    }
  }

  const eraseAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas || doneRef.current) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const x = ((clientX - rect.left) / rect.width) * COVER_W
    const y = ((clientY - rect.top) / rect.height) * COVER_H

    ctx.globalCompositeOperation = 'destination-out'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    // 从上一点连到当前点，快速滑动也不会断成一串圆点
    const last = lastRef.current
    if (last) {
      ctx.lineWidth = 46
      ctx.beginPath()
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(x, y)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.arc(x, y, 23, 0, Math.PI * 2)
    ctx.fill()
    lastRef.current = { x, y }

    const now = performance.now()
    // 刮擦声按 60ms 节流：太密会糊成一片噪音
    if (now - lastSoundRef.current > 60) {
      lastSoundRef.current = now
      sfx.scratch()
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
      width={COVER_W}
      height={COVER_H}
      className="absolute inset-0 h-full w-full cursor-pointer select-none rounded-xl"
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
}

export default function ScratchTicket({ theme, ticketNo, tier, prize, revealed, onReveal, locked = false }: Props) {
  const meta = TIER_META[tier]
  const zodiac = theme.id === 'shengxiao' ? SCRATCH_ZODIAC : ''
  const zodiacEmoji = zodiac ? (SCRATCH_ZODIAC_EMOJI[zodiac] ?? '🐉') : ''

  return (
    <div
      className="relative flex aspect-[3/4] flex-col overflow-hidden rounded-2xl shadow-[0_12px_28px_-14px_rgba(15,23,42,0.55)] ring-1 ring-black/10"
      style={{ background: theme.fallback }}
    >
      {/* 背景图：放进 public/scratch-themes/ 后把路径填到主题配置里即可 */}
      {theme.image && (
        <img src={theme.image} alt="" className="absolute inset-0 h-full w-full object-cover" aria-hidden />
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

        {/* 刮奖区：垂直居中，保持 16:9 不变形 */}
        <div className="flex flex-1 items-center py-2">
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

          {/* 涂层：揭晓后淡出，露出完整票面；对方的票锁住手势 */}
          <div
            className={`absolute inset-0 transition-opacity duration-500 ${
              revealed ? 'pointer-events-none opacity-0' : 'opacity-100'
            } ${locked ? 'pointer-events-none' : ''}`}
          >
            <ScratchLayer onReveal={onReveal} />
          </div>

          {locked && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-xl bg-slate-900/5">
              <span className="rounded-full bg-white/85 px-2.5 py-1 text-[10px] font-medium text-slate-500 shadow-sm">
                等 TA 亲自刮开
              </span>
            </div>
          )}
          </div>
        </div>

        {/* 票尾 */}
        <div className="mt-2 flex items-center justify-between gap-2 text-[9px]" style={{ color: theme.inkSoft }}>
          <span className="truncate">仅供情侣娱乐 · 不设充值 / 兑奖</span>
          <span className="shrink-0">{revealed ? '已开奖' : '刮开涂层'}</span>
        </div>
      </div>
    </div>
  )
}
