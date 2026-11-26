import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { formatCnDate, inRange, monthLabel, monthMatrix, parseDay, shiftMonth, WEEK_LABELS } from '../lib/calendar'
import { todayStr } from '../lib/date'

type Props = {
  /** YYYY-MM-DD；空串表示还没选 */
  value: string
  onChange: (value: string) => void
  /** 触发按钮上方的说明文案（可选） */
  label?: string
  placeholder?: string
  min?: string
  max?: string
  /** 紧凑模式：小圆角胶囊，用在表单行里 */
  compact?: boolean
  /** 浮层模式：日历浮在触发器下方（视口内自动限位、空间不够就翻到上方） */
  floating?: boolean
  className?: string
  disabled?: boolean
}

/**
 * 自绘日期选择：点标签后在下方顺滑展开月历，选中即收起并更新文字。
 * 替代原生 <input type="date">——原生日历在 iOS/Android 上样式割裂、无法回填文案。
 */
export default function DateField({
  value,
  onChange,
  label,
  placeholder = '选择日期',
  min,
  max,
  compact = false,
  floating = false,
  className = '',
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  /** 浮层坐标：open 时按触发器的位置算一次，viewport 内限位 + 上下翻转 */
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null)
  const today = todayStr()
  const initial = parseDay(value) ?? parseDay(today)!
  const [view, setView] = useState({ year: initial.year, month: initial.month })
  const panelId = useId()

  // 每次展开都把视图拉回当前选中的月份（选完别的月份再打开不会停在旧月份）
  useEffect(() => {
    if (!open) return
    const p = parseDay(value) ?? parseDay(today)
    if (p) setView({ year: p.year, month: p.month })
  }, [open, value, today])

  // 点面板外部收起
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const cells = monthMatrix(view.year, view.month)
  const pick = (iso: string) => {
    if (!inRange(iso, min, max)) return
    onChange(iso)
    setOpen(false)
  }

  /** 量触发器位置并算出浮层坐标：水平限位、下方放不下就翻到上方 */
  const measure = useCallback(() => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    const width = Math.min(288, vw - 16)
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), Math.max(8, vw - width - 8))
    const placeBelow = vh - rect.bottom > 320 || rect.top < 320
    setPos(placeBelow ? { top: rect.bottom + 6, left, width } : { bottom: vh - rect.top + 6, left, width })
  }, [])

  /**
   * 浮层坐标必须在「浏览器绘制之前」算好：
   * 用 useEffect（绘制后才量）会让日历先在文档流位置（触发器下方）露一帧，
   * 再跳到 fixed 目标位置——就是那种「先显示一下、再跳走」的卡顿。
   */
  useLayoutEffect(() => {
    if (open && floating) measure()
  }, [open, floating, measure])

  /** 展开 / 收起；坐标交给上面的 layout effect 在首帧前算好 */
  const toggle = () => {
    setOpen((v) => !v)
  }

  // 浮层跟着页面滚动保持贴合触发器（只重算坐标，不关闭，避免一闪就没）
  useEffect(() => {
    if (!open || !floating) return
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const rect = wrapRef.current?.getBoundingClientRect()
        // 触发器滚出视口就收起，避免日历「挂」在屏幕边缘
        if (!rect || rect.bottom < 8 || rect.top > window.innerHeight - 8) {
          setOpen(false)
          return
        }
        measure()
      })
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
    // measure 只读取 ref + setState，不需要进依赖
  }, [open, floating])

  const panel = (
    <div className="rounded-xl border border-brand-100 bg-white p-2 shadow-card">
      <div className="mb-1.5 flex items-center justify-between gap-1">
        <button
          type="button"
          className="btn-icon h-7 w-7 text-xs"
          aria-label="上个月"
          onClick={() => setView((v) => shiftMonth(v.year, v.month, -1))}
        >
          ‹
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-700">{monthLabel(view.year, view.month)}</span>
          <button
            type="button"
            className="rounded-full bg-brand-50 px-2 py-0.5 text-2xs text-brand-600 active:scale-95"
            onClick={() => {
              const p = parseDay(today)!
              setView({ year: p.year, month: p.month })
              if (inRange(today, min, max)) pick(today)
            }}
          >
            今天
          </button>
        </div>
        <button
          type="button"
          className="btn-icon h-7 w-7 text-xs"
          aria-label="下个月"
          onClick={() => setView((v) => shiftMonth(v.year, v.month, 1))}
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 pb-1 text-center text-2xs text-slate-400">
        {WEEK_LABELS.map((w) => (
          <span key={w} className="py-0.5">
            {w}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((c) => {
          const selected = c.iso === value
          const isToday = c.iso === today
          const disabledCell = !inRange(c.iso, min, max)
          return (
            <button
              key={c.iso}
              type="button"
              disabled={disabledCell}
              onClick={() => pick(c.iso)}
              className={`cal-day ${c.inMonth ? '' : 'cal-day--muted'} ${selected ? 'cal-day--selected' : ''} ${
                isToday && !selected ? 'cal-day--today' : ''
              } ${disabledCell ? 'cal-day--disabled' : ''}`}
            >
              {c.day}
            </button>
          )
        })}
      </div>
    </div>
  )

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      {label && <span className="mb-1 block text-2xs text-slate-500">{label}</span>}
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className={
          compact
            ? `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs transition ${
                open ? 'border-brand-400 bg-brand-50 text-brand-600' : 'border-brand-200 bg-white text-slate-500'
              } ${disabled ? 'opacity-50' : 'active:scale-95'}`
            : `input flex items-center justify-between gap-2 text-left ${
                open ? 'border-brand-400 ring-2 ring-brand-100' : ''
              } ${value ? 'text-slate-700' : 'text-slate-400'}`
        }
      >
        <span className="truncate">{value ? formatCnDate(value, today) : placeholder}</span>
        <span className={`text-2xs transition-transform duration-300 ${open ? 'rotate-180 text-brand-500' : 'text-slate-400'}`}>
          ▾
        </span>
      </button>

      {floating ? (
        /* 浮层：fixed 定位到触发器下方（视口限位 / 空间不足翻到上方），不撑破表单行。
           坐标就绪后才挂载，且只过渡透明度/缩放——top/left 变化走滚动跟随时立即生效，
           不再出现「先在下方显示、再跳到目标位置」的拖动残影 */
        pos && (
          <div
            id={panelId}
            style={pos}
            className={`fixed z-[70] origin-top transition-[opacity,transform] duration-200 ease-out ${
              open ? 'pointer-events-auto scale-100 opacity-100' : 'pointer-events-none scale-95 opacity-0'
            }`}
          >
            {panel}
          </div>
        )
      ) : (
        /* 高度折叠：内容高度未知也能顺滑展开/收起 */
        <div id={panelId} className={`collapse-grid ${open ? 'is-open' : ''}`}>
          <div>
            <div className="mt-2">{panel}</div>
          </div>
        </div>
      )}
    </div>
  )
}
