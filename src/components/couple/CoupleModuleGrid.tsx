import { memo, useMemo, useState } from 'react'
import { isModuleNew, moduleDef, type ModuleKey } from '../../lib/modules'

type CoupleModule = {
  id: string
  icon: string
  title: string
  detail: string
}

/** 互动入口的一个分类（如「情感交流」「单机小游戏」） */
export type CoupleModuleSection = {
  icon: string
  title: string
  modules: CoupleModule[]
}

type Props = {
  sections: CoupleModuleSection[]
  isEnabled: (key: ModuleKey) => boolean
  onSelect: (id: string) => void
  /** 最近使用的模块 id（最多 6 个），非空时在顶部渲染快捷区 */
  recent?: string[]
}

function ModuleCard({ module, onSelect }: { module: CoupleModule; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      className="card relative flex min-h-28 flex-col items-start justify-between gap-3 text-left transition hover:border-brand-200"
      onClick={() => onSelect(module.id)}
    >
      {isModuleNew(module.id) && (
        <span className="animate-pop-in absolute -right-1 -top-1.5 rounded-full bg-gradient-to-r from-rose-500 to-orange-400 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white shadow-sm">
          NEW
        </span>
      )}
      <span className="text-2xl">{module.icon}</span>
      <span>
        <span className="block text-sm font-semibold text-slate-700">{module.title}</span>
        <span className="mt-1 block text-[11px] text-slate-400">{module.detail}</span>
      </span>
    </button>
  )
}

/**
 * 互动模块入口网格（按分类分组渲染）：
 * - 顶部搜索框按「名称 / 说明 / 图标」实时过滤，且始终遵守管理员的模块开关
 * - 有最近使用记录时，置顶一排快捷入口
 * - 某分类下模块全被关闭或搜不到时，整个分类隐藏
 * memo：父组件有大量 state，sections 由父级 useMemo 稳定后才有效
 */
function CoupleModuleGrid({ sections, isEnabled, onSelect, recent = [] }: Props) {
  const [keyword, setKeyword] = useState('')

  const visibleSections = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return sections
      .map((section) => ({
        ...section,
        modules: section.modules.filter((module) => {
          if (!isEnabled(module.id as ModuleKey)) return false
          if (!kw) return true
          return `${module.title} ${module.detail} ${module.icon}`.toLowerCase().includes(kw)
        }),
      }))
      .filter((section) => section.modules.length > 0)
  }, [sections, keyword, isEnabled])

  const visibleRecent = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return recent
      .map((id) => moduleDef(id as ModuleKey))
      .filter((def) => isEnabled(def.key))
      .filter((def) => !kw || `${def.title} ${def.desc} ${def.icon}`.toLowerCase().includes(kw))
      .slice(0, 6)
  }, [recent, keyword, isEnabled])

  const total = visibleSections.reduce((n, s) => n + s.modules.length, 0)

  return (
    <div className="space-y-4">
      <input
        className="input"
        placeholder="🔍 搜索模块"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        aria-label="搜索互动模块"
      />
      {kwEmpty(visibleRecent, visibleSections, keyword) && (
        <p className="py-8 text-center text-sm text-slate-400">没有匹配的模块</p>
      )}
      {visibleRecent.length > 0 && (
        <section className="space-y-2">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
            <span className="text-sm">🕘</span>最近使用
          </h4>
          <div className="grid grid-cols-2 gap-3">
            {visibleRecent.map((def) => (
              <button
                key={def.key}
                type="button"
                className="card flex items-center gap-2 text-left transition hover:border-brand-200"
                onClick={() => onSelect(def.key)}
              >
                <span className="text-xl">{def.icon}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{def.title}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      <div className="space-y-5">
        {visibleSections.map((section) => (
          <section key={section.title} className="space-y-2.5">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
              <span className="text-sm">{section.icon}</span>
              {section.title}
              <span className="font-normal text-slate-300">· {section.modules.length} 个</span>
            </h4>
            <div className="grid grid-cols-2 gap-3">
              {section.modules.map((module) => (
                <ModuleCard key={module.id} module={module} onSelect={onSelect} />
              ))}
            </div>
          </section>
        ))}
      </div>
      {keyword.trim() && total > 0 && (
        <p className="text-center text-[11px] text-slate-400">找到 {total} 个模块</p>
      )}
    </div>
  )
}

function kwEmpty(recent: { key: string }[], sections: CoupleModuleSection[], keyword: string): boolean {
  return Boolean(keyword.trim()) && recent.length === 0 && sections.every((s) => s.modules.length === 0)
}

export default memo(CoupleModuleGrid)
