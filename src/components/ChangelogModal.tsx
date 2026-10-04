import { useState } from 'react'
import { CHANGELOG, KIND_LABEL, type ChangelogKind } from '../lib/changelog'
import { useChangelog } from '../store/changelog'

const KIND_CLASS: Record<ChangelogKind, string> = {
  new: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  improve: 'border-brand-200 bg-brand-50 text-brand-600',
  fix: 'border-amber-200 bg-amber-50 text-amber-700',
}

export default function ChangelogModal() {
  const { latest, shouldShow, manual, dismiss } = useChangelog()
  const [showAll, setShowAll] = useState(false)

  if (!latest || (!shouldShow && !manual)) return null

  // 自动弹出时只展示本次更新，手动打开时展示全部历史
  const list = showAll || manual ? CHANGELOG : CHANGELOG.slice(0, 1)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
      onClick={dismiss}
    >
      <div
        className="max-h-[85vh] w-full max-w-md animate-slide-up overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-brand-100 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-brand-600">
              🎉 {manual ? '更新日志' : `更新到 ${latest.version}`}
            </h2>
            <p className="text-xs text-slate-400">
              {manual ? `当前版本 ${latest.version}` : `发布时间 ${latest.date}`}
            </p>
          </div>
          <button className="btn-ghost px-2 py-1 text-xs" onClick={dismiss}>
            关闭
          </button>
        </div>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-4 py-4">
          {list.map((entry, i) => (
            <section key={entry.version} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-700">v{entry.version}</span>
                {i === 0 && !manual && (
                  <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-semibold text-white">最新</span>
                )}
                <span className="text-xs text-slate-400">{entry.date}</span>
                {entry.title && <span className="text-xs text-slate-500">· {entry.title}</span>}
              </div>
              <ul className="space-y-2">
                {entry.items.map((it, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${
                        KIND_CLASS[it.kind]
                      }`}
                    >
                      {KIND_LABEL[it.kind]}
                    </span>
                    <span className="text-sm leading-5 text-slate-600">{it.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {!manual && CHANGELOG.length > 1 && (
            <button className="w-full text-xs text-slate-400 underline" onClick={() => setShowAll((v) => !v)}>
              {showAll ? '只看本次更新' : `查看更早的 ${CHANGELOG.length - 1} 个版本`}
            </button>
          )}
        </div>

        <div className="border-t border-brand-100 px-4 py-3">
          <button className="btn-primary w-full" onClick={dismiss}>
            知道啦
          </button>
        </div>
      </div>
    </div>
  )
}
