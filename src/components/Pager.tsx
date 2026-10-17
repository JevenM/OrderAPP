/**
 * 通用分页器。
 *
 * 背景：列表容器用 max-h + overflow-y-auto 做内部滚动时，苹果手机上经常划不动，
 * 所以长列表一律改成「不滚动 + 翻页」。
 */

export const PAGE_SIZE = 10

export default function Pager({
  page,
  total,
  onChange,
  pageSize = PAGE_SIZE,
}: {
  page: number
  total: number
  onChange: (page: number) => void
  pageSize?: number
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  // 列表可能被筛选/刷新/删除，页码可能越界，这里统一收敛到有效范围
  const safePage = Math.min(Math.max(page, 0), pages - 1)
  if (total <= pageSize) return null
  return (
    <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
      <button type="button" className="text-brand-600 disabled:text-slate-300" disabled={safePage === 0} onClick={() => onChange(safePage - 1)}>
        上一页
      </button>
      <span className="text-slate-400">
        {safePage + 1}/{pages} 页 · 共 {total} 条
      </span>
      <button type="button" className="text-brand-600 disabled:text-slate-300" disabled={safePage >= pages - 1} onClick={() => onChange(safePage + 1)}>
        下一页
      </button>
    </div>
  )
}
