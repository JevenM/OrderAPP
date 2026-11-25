import { useState } from 'react'
import { CHANGELOG, KIND_LABEL, type ChangelogKind } from '../lib/changelog'
import { useChangelog } from '../store/changelog'
import { Modal } from './Modal'

const KIND_CLASS: Record<ChangelogKind, string> = {
  new: 'border-ok-200 bg-ok-50 text-ok-700',
  improve: 'border-brand-200 bg-brand-50 text-brand-600',
  fix: 'border-warn-200 bg-warn-50 text-warn-700',
}

export default function ChangelogModal() {
  const { latest, shouldShow, manual, dismiss } = useChangelog()
  const [showAll, setShowAll] = useState(false)

  const open = !!latest && (shouldShow || manual)
  // 自动弹出时只展示本次更新，手动打开时展示全部历史
  const list = showAll || manual ? CHANGELOG : CHANGELOG.slice(0, 1)

  return (
    <Modal open={open} onClose={dismiss} title={manual ? '🎉 更新日志' : `🎉 更新到 ${latest?.version ?? ''}`}>
      <div className="px-4 pb-3 pt-2 text-xs text-slate-400">
        {manual ? `当前版本 ${latest?.version ?? ''}` : `发布时间 ${latest?.date ?? ''}`}
      </div>

      <div className="max-h-[60vh] space-y-4 overflow-y-auto px-4 py-2">
        {list.map((entry, i) => (
          <section key={entry.version} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-700">v{entry.version}</span>
              {i === 0 && !manual && <span className="badge px-2">最新</span>}
              <span className="text-xs text-slate-400">{entry.date}</span>
              {entry.title && <span className="text-xs text-slate-500">· {entry.title}</span>}
            </div>
            <ul className="space-y-2">
              {entry.items.map((it, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span
                    className={`mt-0.5 shrink-0 rounded-md border px-1.5 py-0.5 text-2xs font-medium ${
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

      <div className="border-t border-brand-100 px-4 pb-safe py-3">
        <button className="btn-primary w-full" onClick={dismiss}>
          知道啦
        </button>
      </div>
    </Modal>
  )
}
