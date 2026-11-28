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

export type SkeletonVariant = 'row' | 'countdown' | 'rank' | 'grid' | 'card'

/**
 * 统一的加载骨架：占位块的排列照着各列表的真实行结构来，
 * 加载完成时不会「嗖」一下跳版。灰色圆角块 + 1.5s 线性扫光由 .skeleton 提供，
 * 真实内容加 .skeleton-fade 就会淡入；深色与减少动效见 index.css。
 */
export function SkeletonList({
  rows = 3,
  compact = false,
  variant = 'row',
  className = '',
}: {
  rows?: number
  compact?: boolean
  variant?: SkeletonVariant
  className?: string
}) {
  const items = Array.from({ length: rows }, (_, i) => i)

  if (variant === 'grid') {
    return (
      <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${className}`} aria-label="加载中" role="status">
        {items.map((i) => (
          <article key={i} className="space-y-2 rounded-xl border border-slate-100 bg-white p-3">
            <div className="flex items-center gap-2">
              <div className="skeleton h-7 w-7 shrink-0 rounded-lg" />
              <div className="skeleton h-3.5 min-w-0 flex-1" />
              <div className="skeleton h-5 w-12 shrink-0 rounded-full" />
            </div>
            <div className="skeleton h-2.5" style={{ width: `${70 - (i % 3) * 12}%` }} />
            <div className="skeleton h-1.5 w-full rounded-full" />
            <div className="flex gap-2 pt-1">
              <div className="skeleton h-7 flex-1" />
              <div className="skeleton h-7 flex-1" />
            </div>
          </article>
        ))}
      </div>
    )
  }

  const row = (i: number) => {
    switch (variant) {
      /* 重要日倒计时：emoji + 标题/日期 + 右侧天数徽章 */
      case 'countdown':
        return (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <div className="skeleton h-7 w-7 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="skeleton h-3.5" style={{ width: `${66 - (i % 3) * 11}%` }} />
              <div className="skeleton h-2.5 w-24" />
            </div>
            <div className="skeleton h-6 w-20 shrink-0 rounded-full" />
          </div>
        )
      /* 常点榜：排名圆点 + emoji + 菜名/条形 + 次数 */
      case 'rank':
        return (
          <div key={i} className="flex items-center gap-2 rounded-xl bg-white px-2 py-2">
            <div className="skeleton h-6 w-6 shrink-0 rounded-full" />
            <div className="skeleton h-5 w-5 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1">
              <div className="skeleton h-3" style={{ width: `${64 - (i % 3) * 13}%` }} />
              <div className="skeleton mt-1.5 h-1.5 rounded-full" style={{ width: `${92 - (i % 4) * 16}%` }} />
            </div>
            <div className="skeleton h-2.5 w-8 shrink-0" />
          </div>
        )
      /* 图文卡片：标题 + 两行正文 + 两个小标签 */
      case 'card':
        return (
          <div key={i} className="card space-y-2 p-3">
            <div className="skeleton h-3.5" style={{ width: `${46 - (i % 3) * 8}%` }} />
            <div className="skeleton h-2.5 w-full" />
            <div className="skeleton h-2.5" style={{ width: `${82 - (i % 3) * 12}%` }} />
            <div className="flex gap-2 pt-0.5">
              <div className="skeleton h-6 w-16" />
              <div className="skeleton h-6 w-12" />
            </div>
          </div>
        )
      default:
        return (
          <div key={i} className="flex items-center gap-3">
            <div className="skeleton h-8 w-8 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="skeleton h-3" style={{ width: `${72 - (i % 3) * 14}%` }} />
              <div className="skeleton h-2.5 w-1/3" />
            </div>
          </div>
        )
    }
  }

  return (
    <div
      className={`space-y-2 ${compact ? 'py-2' : 'py-4'} ${className}`}
      aria-label="加载中"
      role="status"
    >
      {items.map(row)}
    </div>
  )
}
