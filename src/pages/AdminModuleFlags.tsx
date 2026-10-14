import { useCallback, useMemo, useState } from 'react'
import { useToast } from '../components/Toast'
import { ALL_MODULE_KEYS, MODULE_GROUPS, modulesOfGroup, type ModuleKey } from '../lib/modules'
import { useMembers } from '../store/members'
import { useModuleFlags } from '../store/moduleFlags'

/** 模块管理：管理员控制普通用户登录后展示并可用的模块（全局默认 + 按成员单独配置） */
export default function AdminModuleFlags() {
  const toast = useToast()
  const { rows, loading, save, clearForMember, reload } = useModuleFlags()
  const { members } = useMembers()

  /** '' = 编辑全局默认；其他值 = 编辑该成员的单独配置 */
  const [scope, setScope] = useState('')
  const [busy, setBusy] = useState<ModuleKey | null>(null)

  const isMemberScope = scope !== ''

  const enabledOf = useCallback(
    (key: ModuleKey): boolean => {
      const scoped = rows.find((row) => row.key === key && row.member_id === (isMemberScope ? scope : null))
      if (scoped) return scoped.enabled
      if (isMemberScope) {
        const global = rows.find((row) => row.key === key && row.member_id === null)
        if (global) return global.enabled
      }
      return true
    },
    [rows, scope, isMemberScope]
  )

  /** 成员视角下：这个模块是否已有单独配置（有才能「恢复跟随全局」） */
  const hasOwnFlag = useCallback(
    (key: ModuleKey) => rows.some((row) => row.key === key && row.member_id === scope),
    [rows, scope]
  )

  const disabledCount = useMemo(
    () => ALL_MODULE_KEYS.filter((key) => !enabledOf(key)).length,
    [enabledOf]
  )

  const toggle = async (key: ModuleKey, nextEnabled: boolean) => {
    setBusy(key)
    try {
      await save(key, nextEnabled, isMemberScope ? scope : null)
      toast.show(nextEnabled ? '模块已开放' : '模块已关闭')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setBusy(null)
    }
  }

  const resetOne = async (key: ModuleKey) => {
    setBusy(key)
    try {
      await clearForMember(key, scope)
      toast.show('已恢复跟随全局设置')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setBusy(null)
    }
  }

  const setGroupAll = async (keys: ModuleKey[], nextEnabled: boolean) => {
    setBusy(keys[0])
    try {
      for (const key of keys) await save(key, nextEnabled, isMemberScope ? scope : null)
      toast.show(nextEnabled ? '该分组已全部开放' : '该分组已全部关闭')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-semibold">🧩 模块管理</h2>
            <p className="mt-1 break-words text-xs text-slate-400">
              控制普通用户登录后能看到、能用哪些模块。关闭后入口会直接隐藏，对方也无法通过通知链接进入。你自己（管理员）不受限制。
            </p>
          </div>
          <span className="chip shrink-0 border-brand-200 bg-brand-50 text-brand-600">管理员</span>
        </div>

        <label className="block text-xs text-slate-500">
          配置对象
          <select className="input mt-1" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="">🌐 全局默认（所有普通用户）</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                👧 {m.name}（单独配置）
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <span className={`chip ${disabledCount ? 'border-rose-200 bg-rose-50 text-rose-600' : 'border-emerald-200 bg-emerald-50 text-emerald-600'}`}>
            {isMemberScope
              ? `${members.find((m) => m.id === scope)?.name ?? '该成员'}：已关闭 ${disabledCount} 个`
              : `全局：已关闭 ${disabledCount} 个`}
          </span>
          <button className="btn-ghost px-2 py-1 text-xs" disabled={loading} onClick={() => void reload()}>
            {loading ? '加载中…' : '刷新'}
          </button>
        </div>

        {isMemberScope && (
          <p className="rounded-xl bg-amber-50 p-2 text-[11px] leading-relaxed text-amber-700">
            正在为单个成员配置：有单独记录的模块以这里为准，没有的跟随全局默认。点「恢复跟随」可删掉该成员的单独设置。
          </p>
        )}
      </section>

      {MODULE_GROUPS.map((group) => {
        const defs = modulesOfGroup(group.key)
        const keys = defs.map((d) => d.key)
        return (
          <section key={group.key} className="card space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-700">{group.title}</h3>
                <p className="mt-0.5 break-words text-[11px] text-slate-400">{group.hint}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button className="btn-ghost px-2 py-1 text-[11px]" disabled={busy !== null} onClick={() => void setGroupAll(keys, true)}>
                  全开
                </button>
                <button className="btn-ghost px-2 py-1 text-[11px]" disabled={busy !== null} onClick={() => void setGroupAll(keys, false)}>
                  全关
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {defs.map((def) => {
                const on = enabledOf(def.key)
                return (
                  <div
                    key={def.key}
                    className={`flex items-center gap-2 rounded-2xl border p-3 ${on ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-slate-50'}`}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-lg shadow-sm">{def.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="break-words text-sm font-semibold text-slate-700">{def.title}</div>
                      <div className="mt-0.5 break-words text-[11px] text-slate-400">{def.desc}</div>
                    </div>
                    {isMemberScope && hasOwnFlag(def.key) && (
                      <button className="btn-ghost shrink-0 px-2 py-1 text-[11px]" disabled={busy !== null} onClick={() => void resetOne(def.key)}>
                        恢复跟随
                      </button>
                    )}
                    <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-brand-500"
                        checked={on}
                        disabled={busy === def.key}
                        onChange={(e) => void toggle(def.key, e.target.checked)}
                      />
                      <span className={on ? 'text-emerald-600' : 'text-slate-400'}>{on ? '可用' : '已隐藏'}</span>
                    </label>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
