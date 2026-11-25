import type { ReactNode } from 'react'

/**
 * 统一的空状态：替代散落各处的「暂无 xxx」灰字。
 * 图标 + 主文案 + 可选说明 + 可选操作，语气一致、留白统一。
 */
export function EmptyState({
  icon = '🫙',
  title = '这里还空空的',
  hint,
  action,
  compact = false,
}: {
  icon?: string
  title?: string
  hint?: string
  action?: ReactNode
  compact?: boolean
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-5' : 'py-10'}`}>
      <div className={`${compact ? 'text-2xl' : 'text-3xl'} opacity-70`}>{icon}</div>
      <p className={`mt-2 ${compact ? 'text-xs' : 'text-sm'} text-slate-500`}>{title}</p>
      {hint && <p className="mt-1 text-2xs leading-relaxed text-slate-400">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

/**
 * 统一的加载骨架：列表页 loading 时给几条错落的占位条，
 * 比纯「加载中…」文字更贴近最终布局，减少加载完成时的视觉跳动。
 * 占位条共用一道 0.5s 斜向扫光（.skeleton::after），比 animate-pulse 的呼吸更「产品感」。
 */
export function SkeletonList({ rows = 3, compact = false }: { rows?: number; compact?: boolean }) {
  return (
    <div className={`space-y-2 ${compact ? 'py-2' : 'py-4'}`} aria-label="加载中" role="status">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="skeleton h-8 w-8 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="skeleton h-3" style={{ width: `${72 - (i % 3) * 14}%` }} />
            <div className="skeleton h-2.5 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}
