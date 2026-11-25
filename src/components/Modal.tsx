import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * 统一弹窗基础组件：Portal 挂到 body + Esc 关闭 + 滚动锁 + 遮罩点击关闭 + 进出场动画。
 *
 * 两个关键点：
 * 1) 必须用 Portal：项目卡片有 :active transform，内联 fixed 会相对卡片定位导致弹窗跳动；
 *    同时 Portal 到 body 才能保证弹窗永远在最顶层（不依赖父级 overflow / transform）。
 * 2) 覆盖层样式在 index.css 的 .overlay（position: fixed）。这条规则一旦缺失，弹窗会退化成
 *    普通文档流块堆在 <body> 末尾——必须滚到页面最底端才看得见。
 *
 * 多个弹窗叠加时滚动锁用计数，避免先关的那个把后一个的锁提前解开。
 */
let openCount = 0
function lockScroll() {
  openCount += 1
  if (openCount === 1) document.body.style.overflow = 'hidden'
}
function unlockScroll() {
  openCount = Math.max(0, openCount - 1)
  if (openCount === 0) document.body.style.overflow = ''
}

/** 触发弹窗的元素位置：给了就从这里放大成居中面板，关闭时缩回原处（shared-element 效果） */
export type ModalOrigin = { top: number; left: number; width: number; height: number }

type ModalProps = {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** 可选标题；给了就渲染统一的头部 */
  title?: string
  /** z-index 层级，默认 100；永远高于顶栏(30)/底栏(20)/抽屉(60) */
  z?: number
  className?: string
  /** 从哪个矩形展开；不传则走默认的居中回弹 */
  origin?: ModalOrigin | null
}

export function Modal({ open, onClose, children, title, z = 100, className = '', origin = null }: ModalProps) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  /** 关闭动画播放期间仍需保持挂载，否则面板会「瞬间消失」 */
  const [render, setRender] = useState(open)
  const [leaving, setLeaving] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const originRef = useRef<ModalOrigin | null>(origin)
  originRef.current = origin
  const playedRef = useRef(false)

  useEffect(() => {
    if (!open) return
    setRender(true)
    setLeaving(false)
  }, [open])

  /* 进场：有 origin 时用 Web Animations 从卡片位置放大到居中位置 */
  useEffect(() => {
    if (!open) {
      playedRef.current = false
      return
    }
    if (!render || playedRef.current) return
    playedRef.current = true
    const el = panelRef.current
    const o = originRef.current
    if (!el || !o) return
    const raf = requestAnimationFrame(() => {
      const to = el.getBoundingClientRect()
      if (!to.width || !to.height) return
      const dx = o.left + o.width / 2 - (to.left + to.width / 2)
      const dy = o.top + o.height / 2 - (to.top + to.height / 2)
      const sx = Math.max(0.05, o.width / to.width)
      const sy = Math.max(0.05, o.height / to.height)
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.35, borderRadius: '0.85rem' },
          { transform: 'translate(0, 0) scale(1, 1)', opacity: 1, borderRadius: '1.25rem' },
        ],
        { duration: 340, easing: 'cubic-bezier(.22,1,.36,1)' }
      )
    })
    return () => cancelAnimationFrame(raf)
  }, [open, render])

  /* 退场：有 origin 时缩回原位，否则走 CSS 的淡出缩小 */
  useEffect(() => {
    if (open || !render) return
    setLeaving(true)
    const el = panelRef.current
    const o = originRef.current
    let anim: Animation | undefined
    if (el && o) {
      const from = el.getBoundingClientRect()
      if (from.width && from.height) {
        const dx = o.left + o.width / 2 - (from.left + from.width / 2)
        const dy = o.top + o.height / 2 - (from.top + from.height / 2)
        const sx = Math.max(0.05, o.width / from.width)
        const sy = Math.max(0.05, o.height / from.height)
        anim = el.animate(
          [
            { transform: 'translate(0, 0) scale(1, 1)', opacity: 1 },
            { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.25 },
          ],
          { duration: 250, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }
        )
      }
    }
    const timer = window.setTimeout(() => setRender(false), anim ? 260 : 170)
    return () => {
      anim?.cancel()
      window.clearTimeout(timer)
    }
  }, [open, render])

  useEffect(() => {
    if (!open) return
    lockScroll()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      unlockScroll()
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!render) return null
  const layer = Math.max(100, z)
  const morphing = !!originRef.current
  return createPortal(
    <div
      className={`overlay ${leaving ? 'overlay--leave' : ''}`}
      style={{ zIndex: layer }}
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        className={`dialog-panel ${morphing ? 'dialog-panel--morph' : ''} ${
          leaving && !morphing ? 'dialog-panel--leave' : ''
        } ${className}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {title && (
          <div className="flex shrink-0 items-center justify-between border-b border-brand-100 px-4 py-3">
            <h2 className="card-title">{title}</h2>
            <button className="btn-ghost px-2 py-1 text-xs" onClick={onClose} aria-label="关闭">
              关闭
            </button>
          </div>
        )}
        <div className="dialog-body">{children}</div>
      </div>
    </div>,
    document.body
  )
}

/* ------------------------------ Promise 化确认框 ------------------------------ */

type ConfirmOptions = { title?: string; message: string; okText?: string; cancelText?: string; danger?: boolean }
type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

/**
 * 全局确认框：弹入带回弹；点确认后原地切换成「已完成」对勾，停留一小会儿再真正 resolve。
 * 这样删除 / 退出这类操作会有一个明确的收尾反馈，而不是点完就整块消失。
 */
export function ConfirmHost({ children }: { children: ReactNode }) {
  const [view, setView] = useState<ConfirmOptions | null>(null)
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)
  const resolver = useRef<((ok: boolean) => void) | null>(null)
  const acceptTimer = useRef<number | null>(null)
  const closeTimer = useRef<number | null>(null)

  const clearTimers = () => {
    if (acceptTimer.current) window.clearTimeout(acceptTimer.current)
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    acceptTimer.current = null
    closeTimer.current = null
  }

  useEffect(() => clearTimers, [])

  const confirm = useCallback<ConfirmFn>((options) => {
    const opts = typeof options === 'string' ? { message: options } : options
    return new Promise<boolean>((resolve) => {
      clearTimers()
      resolver.current = resolve
      setView(opts)
      setDone(false)
      setOpen(true)
    })
  }, [])

  /** 关闭：保留 view 内容到退出动画结束，避免面板闪空 */
  const close = (ok: boolean) => {
    clearTimers()
    resolver.current?.(ok)
    resolver.current = null
    setOpen(false)
    closeTimer.current = window.setTimeout(() => {
      setView(null)
      setDone(false)
    }, 240)
  }

  const cancel = () => {
    if (!open) return
    close(false)
  }

  /** 确认：先原地切到「已完成」对勾，停留 0.6s 再真正 resolve */
  const accept = () => {
    if (!view || done) return
    setDone(true)
    acceptTimer.current = window.setTimeout(() => close(true), 620)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal open={open} onClose={cancel} title={view?.title ?? '请确认'}>
        <div className="min-h-[7.5rem] px-4 py-5">
          {done ? (
            <div className="flex flex-col items-center justify-center gap-2.5 py-2">
              <span className="confirm-check">
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M4.5 12.5l4.8 4.8L19.5 7" />
                </svg>
              </span>
              <p className="text-sm font-medium text-ok-600">已完成</p>
            </div>
          ) : (
            <div className="animate-fade space-y-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{view?.message}</p>
              <div className="flex gap-2">
                <button className="btn-ghost flex-1" onClick={cancel}>
                  {view?.cancelText ?? '取消'}
                </button>
                <button className={`flex-1 ${view?.danger ? 'btn-danger' : 'btn-primary'}`} onClick={accept}>
                  {view?.okText ?? '确定'}
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </ConfirmContext.Provider>
  )
}

/** 替代 window.confirm：const confirm = useConfirm(); if (!(await confirm('确定删除吗？'))) return */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm 必须在 ConfirmHost 内使用')
  return ctx
}
