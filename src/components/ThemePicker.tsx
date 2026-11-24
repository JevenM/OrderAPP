import { useState } from 'react'
import { THEMES, applyDark, applyTheme, readDark, readThemeId, themeGradient } from '../lib/themes'

/** 一键换肤弹窗：从右上角「更多」菜单进入，选中即生效并记住 */
export default function ThemePicker({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState(readThemeId)
  const [dark, setDark] = useState(readDark)

  const pick = (id: string) => {
    applyTheme(id)
    setCurrent(id)
  }
  const toggleDark = () => {
    const next = !dark
    applyDark(next)
    setDark(next)
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="animate-slide-up w-full max-w-xs rounded-2xl border border-slate-100 bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-slate-700">🎨 一键换肤</h3>
          <button type="button" className="text-slate-400 transition active:text-slate-600" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => pick(t.id)}
              className={`relative overflow-hidden rounded-xl p-2.5 text-left transition active:scale-[0.98] ${
                t.id === current ? 'ring-2 ring-slate-800' : 'ring-1 ring-slate-200'
              }`}
            >
              <span className="block h-10 w-full rounded-lg" style={{ background: themeGradient(t) }} />
              <span className="mt-1.5 block text-xs font-medium text-slate-600">
                {t.emoji} {t.name}
                {t.id === current && <span className="ml-1 text-[10px] text-slate-400">✓ 使用中</span>}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={toggleDark}
          className={`mt-3 flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-sm transition active:scale-[0.98] ${
            dark ? 'border-slate-600 bg-slate-700 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-700'
          }`}
        >
          <span>{dark ? '🌙 深色模式' : '☀️ 浅色模式'}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] ${dark ? 'bg-slate-600 text-slate-200' : 'bg-white text-slate-500'}`}>
            {dark ? '点击切换' : '点击切换'}
          </span>
        </button>
        <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-400">全站配色立即生效，每台设备独立记忆</p>
      </div>
    </div>
  )
}
