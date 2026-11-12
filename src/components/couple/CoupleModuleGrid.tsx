import type { ModuleKey } from '../../lib/modules'

type CoupleModule = {
  id: string
  icon: string
  title: string
  detail: string
}

/** 互动入口的一个分类（如「情感交流」「单机小游戏」） */
export type CoupleModuleSection = {
  /** 分类标题前的图标 */
  icon: string
  title: string
  modules: CoupleModule[]
}

type Props = {
  sections: CoupleModuleSection[]
  isEnabled: (key: ModuleKey) => boolean
  onSelect: (id: string) => void
}

/**
 * 互动模块入口网格（按分类分组渲染）：
 * - 模块多了以后平铺一长串要下拉很久，按分类切成几段，每段一个小标题 + 两列卡片
 * - 某个分类下的模块全部被管理员关闭时，整个分类直接隐藏（不留空标题）
 */
export default function CoupleModuleGrid({ sections, isEnabled, onSelect }: Props) {
  const visibleSections = sections
    .map((section) => ({
      ...section,
      modules: section.modules.filter((module) => isEnabled(module.id as ModuleKey)),
    }))
    .filter((section) => section.modules.length > 0)

  return (
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
              <button
                key={module.id}
                type="button"
                className="card flex min-h-28 flex-col items-start justify-between gap-3 text-left transition hover:border-brand-200"
                onClick={() => onSelect(module.id)}
              >
                <span className="text-2xl">{module.icon}</span>
                <span>
                  <span className="block text-sm font-semibold text-slate-700">{module.title}</span>
                  <span className="mt-1 block text-[11px] text-slate-400">{module.detail}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
