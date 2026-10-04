import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

type ToastKind = 'ok' | 'err'
type ToastValue = { show: (msg: string, kind?: ToastKind) => void }

const ToastContext = createContext<ToastValue>({ show: () => {} })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; kind: ToastKind } | null>(null)

  const show = useCallback((text: string, kind: ToastKind = 'ok') => {
    setMsg({ text, kind })
    window.setTimeout(() => setMsg((m) => (m?.text === text ? null : m)), 2600)
  }, [])

  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {msg && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <div
            className={`rounded-xl px-4 py-2 text-sm text-white shadow-lg ${
              msg.kind === 'ok' ? 'bg-emerald-600' : 'bg-rose-600'
            }`}
          >
            {msg.text}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastValue {
  return useContext(ToastContext)
}
