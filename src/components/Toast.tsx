import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

type ToastKind = 'ok' | 'err'
type ToastValue = { show: (msg: string, kind?: ToastKind) => void }
type ToastItem = { id: number; text: string; kind: ToastKind }

const ToastContext = createContext<ToastValue>({ show: () => {} })
const TOAST_MS = 2600
const MAX_VISIBLE = 3

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)
  const timers = useRef<number[]>([])

  const show = useCallback((text: string, kind: ToastKind = 'ok') => {
    const id = nextId.current++
    // 队列化：并发提示各自独立、按 id 精确移除，不会互相覆盖或提前消失
    setItems((prev) => [...prev, { id, text, kind }].slice(-MAX_VISIBLE))
    const timer = window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id))
      timers.current = timers.current.filter((t) => t !== timer)
    }, TOAST_MS)
    timers.current.push(timer)
  }, [])

  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t))
      timers.current = []
    },
    []
  )

  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4">
        {items.map((item) => (
          <div
            key={item.id}
            role="status"
            className={`animate-fade-down max-w-full rounded-xl px-4 py-2 text-center text-sm text-white shadow-lg ${
              item.kind === 'ok' ? 'bg-emerald-600' : 'bg-rose-600'
            }`}
          >
            {item.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastValue {
  return useContext(ToastContext)
}
