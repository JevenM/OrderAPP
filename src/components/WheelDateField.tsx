import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { formatCnDate, isoOf, parseDay } from '../lib/calendar'
import { todayStr } from '../lib/date'
import {
  WHEEL_ITEM_HEIGHT,
  clampWheelDate,
  wheelDays,
  wheelIndex,
  wheelIndexFromScroll,
  wheelMonths,
  wheelScrollTop,
  wheelYears,
  type WheelParts,
} from '../lib/wheelDate'

type Props = {
  /** YYYY-MM-DD；空串表示还没选 */
  value: string
  onChange: (value: string) => void
  placeholder?: string
  min?: string
  max?: string
  className?: string
  disabled?: boolean
}

/**
 * 三列滚轮日期：年 / 月 / 日各自滚动完整数值，今日（或已选日期）居中、上下各露一项。
 * 浮层 Portal + fixed 挂到 body，不参与弹窗排版，不会把弹窗撑出滚动条；点浮层外部即确认。
 */
export default function WheelDateField({
  value,
  onChange,
  placeholder = '选择日期',
  min,
  max,
  className = '',
  disabled = false,
}: Props) {
  const today = todayStr()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null)
  const [draft, setDraft] = useState<WheelParts>(() => parseDay(value) ?? parseDay(today)!)
  const triggerRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const yearsRef = useRef<HTMLDivElement>(null)
  const monthsRef = useRef<HTMLDivElement>(null)
  const daysRef = useRef<HTMLDivElement>(null)
  const draftRef = useRef(draft)
  draftRef.current = draft
  /** 只有「刚展开」这一刻需要把三列滚到选中项 */
  const needsScrollRef = useRef(false)
  /** 滚动停止后再读最终位置，避免 snap 中间态污染草稿 */
  const scrollTimers = useRef({ year: 0, month: 0, day: 0 })
  /** 点触发器确认时，阻止随后 click 又把浮层打开 */
  const skipToggleRef = useRef(false)

  const anchor = useMemo(() => parseDay(value) ?? parseDay(today)!, [value, today])
  const years = useMemo(() => wheelYears(anchor.year, min, max), [anchor.year, min, max])
  const months = useMemo(() => wheelMonths(draft.year, min, max), [draft.year, min, max])
  const days = useMemo(() => wheelDays(draft.year, draft.month, min, max), [draft.year, draft.month, min, max])

  // 外部清空/改值时同步草稿（弹窗里关闭后再打开会走这里）
  useEffect(() => {
    if (!open) setDraft(parseDay(value) ?? parseDay(today)!)
  }, [value, open, today])

  useEffect(
    () => () => {
      window.clearTimeout(scrollTimers.current.year)
      window.clearTimeout(scrollTimers.current.month)
      window.clearTimeout(scrollTimers.current.day)
    },
    []
  )

  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    const width = 246
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), Math.max(8, vw - width - 8))
    // 浮层高约 205px；下方放不下就翻到上方
    setPos(vh - rect.bottom > 215 || rect.top < 215 ? { top: rect.bottom + 6, left } : { bottom: vh - rect.top + 6, left })
  }, [])

  const align = useCallback(() => {
    const d = draftRef.current
    const ys = wheelYears(anchor.year, min, max)
    const ms = wheelMonths(d.year, min, max)
    const ds = wheelDays(d.year, d.month, min, max)
    const set = (el: HTMLDivElement | null, v: number, options: number[]) => {
      if (el) el.scrollTop = wheelScrollTop(wheelIndex(v, options, 0))
    }
    set(yearsRef.current, d.year, ys)
    set(monthsRef.current, d.month, ms)
    set(daysRef.current, d.day, ds)
  }, [anchor.year, min, max])

  // 坐标与初始滚动都必须在绘制前完成，避免日历先闪在文档流里再跳位
  useLayoutEffect(() => {
    if (!open || !needsScrollRef.current) return
    needsScrollRef.current = false
    place()
    align()
    // 首帧 snap 可能吸附到第一项，等布局稳定后再校正两次
    const t1 = window.setTimeout(align, 50)
    const t2 = window.setTimeout(align, 140)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [open, align, place])

  /** 改动任一部分后同步三列位置，顺手把 2 月 30 号这类日期收敛掉 */
  const applyParts = (next: WheelParts) => {
    draftRef.current = next
    setDraft(next)
    const ms = wheelMonths(next.year, min, max)
    const ds = wheelDays(next.year, next.month, min, max)
    if (yearsRef.current) yearsRef.current.scrollTop = wheelScrollTop(wheelIndex(next.year, years, 0))
    if (monthsRef.current) monthsRef.current.scrollTop = wheelScrollTop(wheelIndex(next.month, ms, 0))
    if (daysRef.current) daysRef.current.scrollTop = wheelScrollTop(wheelIndex(next.day, ds, 0))
  }

  /** 滚动停止后按最终位置读值；程序化滚动读到的是正确终点 */
  const settleScroll = (kind: 'year' | 'month' | 'day', length: number, apply: (index: number) => void) => {
    window.clearTimeout(scrollTimers.current[kind])
    scrollTimers.current[kind] = window.setTimeout(() => {
      const el = kind === 'year' ? yearsRef.current : kind === 'month' ? monthsRef.current : daysRef.current
      if (el) apply(wheelIndexFromScroll(el.scrollTop, length))
    }, 180)
  }

  const commit = useCallback(() => {
    const d = draftRef.current
    onChange(isoOf(d.year, d.month, d.day))
    setOpen(false)
  }, [onChange])

  // 点浮层外部即确认；Esc 取消
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (popRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) skipToggleRef.current = true
      commit()
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
  }, [open, commit])

  const toggle = () => {
    if (disabled) return
    if (skipToggleRef.current) {
      skipToggleRef.current = false
      return
    }
    if (!open) needsScrollRef.current = true
    setOpen(!open)
  }

  const onYearScroll = () =>
    settleScroll('year', years.length, (index) => {
      const year = years[index]
      if (year === undefined || year === draftRef.current.year) return
      applyParts(clampWheelDate({ ...draftRef.current, year }, min, max))
    })

  const onMonthScroll = () =>
    settleScroll('month', months.length, (index) => {
      const month = months[index]
      if (month === undefined || month === draftRef.current.month) return
      applyParts(clampWheelDate({ ...draftRef.current, month }, min, max))
    })

  const onDayScroll = () =>
    settleScroll('day', days.length, (index) => {
      const day = days[index]
      if (day === undefined || day === draftRef.current.day) return
      applyParts({ ...draftRef.current, day })
    })

  /** 标签与数字列放在同一个组里，天然居中对齐 */
  const column = (
    label: string,
    values: number[],
    active: number,
    ref: RefObject<HTMLDivElement>,
    onScroll: () => void,
    onClick: (value: number) => void
  ) => (
    <div className="wheel-group">
      <span className="wheel-label">{label}</span>
      <div ref={ref} className="wheel-col" onScroll={onScroll} aria-label={label}>
        <div style={{ height: WHEEL_ITEM_HEIGHT * 2 }} aria-hidden />
        {values.map((n) => (
          <button
            key={n}
            type="button"
            className={`wheel-item ${n === active ? 'wheel-item--active' : ''}`}
            onClick={() => onClick(n)}
          >
            {n}
          </button>
        ))}
        <div style={{ height: WHEEL_ITEM_HEIGHT * 2 }} aria-hidden />
      </div>
    </div>
  )

  const popover =
    open &&
    pos &&
    createPortal(
      <div ref={popRef} className="wheel-pop" style={pos}>
        <div className="wheel-widget">
          <div className="wheel-groups">
            {column('年', years, draft.year, yearsRef, onYearScroll, (year) => {
              applyParts(clampWheelDate({ ...draftRef.current, year }, min, max))
            })}
            {column('月', months, draft.month, monthsRef, onMonthScroll, (month) => {
              applyParts(clampWheelDate({ ...draftRef.current, month }, min, max))
            })}
            {column('日', days, draft.day, daysRef, onDayScroll, (day) => {
              applyParts({ ...draftRef.current, day })
            })}
          </div>
        </div>
        <div className="wheel-foot">
          <span>滚动选择 · 点外面确定</span>
          <button
            type="button"
            className="lock-clear"
            onClick={() => {
              onChange('')
              setOpen(false)
            }}
          >
            清空
          </button>
        </div>
      </div>,
      document.body
    )

  return (
    <>
      <div ref={triggerRef} className={`relative ${className}`}>
        <button
          type="button"
          disabled={disabled}
          aria-expanded={open}
          onClick={toggle}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs transition ${
            open ? 'border-brand-400 bg-brand-50 text-brand-600' : 'border-brand-200 bg-white text-slate-500'
          } ${disabled ? 'opacity-50' : 'active:scale-95'}`}
        >
          <span className="truncate">{value ? formatCnDate(value, today) : placeholder}</span>
          <span className={`text-2xs transition-transform duration-300 ${open ? 'rotate-180 text-brand-500' : 'text-slate-400'}`}>
            ▾
          </span>
        </button>
      </div>
      {popover}
    </>
  )
}
