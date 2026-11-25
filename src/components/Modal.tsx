import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * 统一弹窗基础组件：Portal 挂到 body + Esc 关闭 + 滚动锁 + 遮罩点击关闭。
 * 用 Portal 是必须的——项目卡片有 :active transform，内联 fixed 会相对卡片定位导致弹窗跳动。
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

type ModalProps = {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** 可选标题；给了就渲染统一的头部 */
  title?: string
  /** z-index 层级，默认 50；游戏内弹窗可传更高 */
  z?: number
  className?: string
}

export function Modal({ open, onClose, children, title, z = 50, className = '' }: ModalProps) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

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

  if (!open) return null
  return createPortal(
    <div
      className="overlay"
      style={{ zIndex: z }}
      onClick={onClose}
    >
      <div
        className={`max-h-[85vh] w-full max-w-md animate-slide-up overflow-hidden rounded-t-2xl bg-white pb-safe shadow-lg sm:rounded-2xl ${className}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {title && (
          <div className="flex items-center justify-between border-b border-brand-100 px-4 py-3">
            <h2 className="card-title">{title}</h2>
            <button className="btn-ghost px-2 py-1 text-xs" onClick={onClose} aria-label="关闭">
              关闭
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body
  )
}

/* ------------------------------ Promise 化确认框 ------------------------------ */

type ConfirmOptions = { title?: string; message: string; okText?: string; cancelText?: string; danger?: boolean }
type ConfirmRequest = ConfirmOptions & { resolve: (ok: boolean) => void }
type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

/** 在应用顶层放一个 ConfirmHost，之后任意组件用 useConfirm() 即可 */
export function ConfirmHost({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<ConfirmRequest | null>(null)
  const confirm = useCallback<ConfirmFn>((options) => {
    const opts = typeof options === 'string' ? { message: options } : options
    return new Promise<boolean>((resolve) => setReq({ ...opts, resolve }))
  }, [])
  const finish = (ok: boolean) => {
    req?.resolve(ok)
    setReq(null)
  }
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal open={!!req} onClose={() => finish(false)} title={req?.title ?? '请确认'}>
        <div className="space-y-4 px-4 py-5">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{req?.message}</p>
          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => finish(false)}>{req?.cancelText ?? '取消'}</button>
            <button
              className={`flex-1 ${req?.danger ? 'btn-danger' : 'btn-primary'}`}
              onClick={() => finish(true)}
            >
              {req?.okText ?? '确定'}
            </button>
          </div>
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
