import type { ReactNode } from 'react'

type Phase = 'idle' | 'loading' | 'done'

type Props = {
  phase: Phase
  onClick: () => void
  children: ReactNode
  className?: string
  disabled?: boolean
}

/**
 * 会形变的提交按钮：
 * 常态（整行宽） → 加载（收缩成圆形 + 旋转） → 成功（圆形 + 对勾） → 恢复常态。
 * 宽度 / 圆角 / 底色都走 CSS 过渡，形变本身不用 JS 逐帧计算。
 */
export default function MorphButton({ phase, onClick, children, className = '', disabled = false }: Props) {
  const idle = phase === 'idle'
  return (
    <button
      type="button"
      aria-busy={phase === 'loading'}
      aria-label={idle ? undefined : phase === 'loading' ? '提交中' : '提交成功'}
      disabled={disabled || !idle}
      onClick={onClick}
      style={{ width: idle ? '100%' : '2.75rem' }}
      className={`morph-btn btn-primary inline-flex shrink-0 items-center justify-center ${
        idle ? '' : 'morph-btn--compact'
      } ${phase === 'done' ? 'morph-btn--done' : ''} ${className}`}
    >
      {phase === 'idle' && <span className="truncate">{children}</span>}
      {phase === 'loading' && <span className="morph-spinner" aria-hidden />}
      {phase === 'done' && (
        <svg className="morph-check" viewBox="0 0 24 24" aria-hidden>
          <path d="M4.5 12.5l4.8 4.8L19.5 7" />
        </svg>
      )}
    </button>
  )
}
