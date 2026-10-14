import type { ModuleKey } from '../../lib/modules'

type CoupleModule = {
  id: string
  icon: string
  title: string
  detail: string
}

type Props = {
  modules: CoupleModule[]
  isEnabled: (key: ModuleKey) => boolean
  onSelect: (id: string) => void
}

export default function CoupleModuleGrid({ modules, isEnabled, onSelect }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {modules.filter((module) => isEnabled(module.id as ModuleKey)).map((module) => (
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
  )
}
