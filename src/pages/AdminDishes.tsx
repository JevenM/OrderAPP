import { useCallback, useEffect, useState } from 'react'
import { listDishes, removeDish, saveDish } from '../lib/db'
import { useToast } from '../components/Toast'
import type { Dish } from '../lib/types'

const CATEGORIES = ['家常菜', '荤菜', '素菜', '汤羹', '主食', '西餐', '轻食', '甜品']

const blank = (): Partial<Dish> & { name: string } => ({
  name: '',
  category: '家常菜',
  emoji: '🍽️',
  description: '',
  price: 0,
  available: true,
  sort_order: 0,
})

export default function AdminDishes() {
  const toast = useToast()
  const [dishes, setDishes] = useState<Dish[]>([])
  const [editing, setEditing] = useState<(Partial<Dish> & { name: string }) | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      setDishes(await listDishes())
    } catch (e) {
      toast.show((e as Error).message, 'err')
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    if (!editing?.name.trim()) return toast.show('菜名不能为空', 'err')
    setSaving(true)
    try {
      await saveDish(editing)
      setEditing(null)
      toast.show('已保存')
      void load()
    } catch (e) {
      toast.show((e as Error).message, 'err')
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (d: Dish) => {
    try {
      await saveDish({ ...d, available: !d.available })
      void load()
    } catch (e) {
      toast.show((e as Error).message, 'err')
    }
  }

  const del = async (d: Dish) => {
    if (!confirm(`删除「${d.name}」？`)) return
    try {
      await removeDish(d.id)
      toast.show('已删除')
      void load()
    } catch (e) {
      toast.show((e as Error).message, 'err')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-600">菜单管理（{dishes.length} 道）</h2>
        <button className="btn-primary text-xs" onClick={() => setEditing(blank())}>
          + 加菜
        </button>
      </div>

      {editing && (
        <div className="card space-y-2 border-brand-200">
          <div className="flex gap-2">
            <input
              className="input w-16 text-center text-lg"
              value={editing.emoji ?? '🍽️'}
              onChange={(e) => setEditing({ ...editing, emoji: e.target.value })}
            />
            <input
              className="input flex-1"
              placeholder="菜名"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </div>
          <input
            className="input"
            placeholder="描述（可不填）"
            value={editing.description ?? ''}
            onChange={(e) => setEditing({ ...editing, description: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              className="input"
              value={editing.category}
              onChange={(e) => setEditing({ ...editing, category: e.target.value })}
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <input
              className="input"
              type="number"
              placeholder="价格"
              value={editing.price ?? 0}
              onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })}
            />
            <input
              className="input"
              type="number"
              placeholder="排序"
              value={editing.sort_order ?? 0}
              onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })}
            />
            <label className="flex items-center justify-center gap-1 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={editing.available ?? true}
                onChange={(e) => setEditing({ ...editing, available: e.target.checked })}
              />
              上架
            </label>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={saving} onClick={save}>
              {saving ? '保存中…' : '保存'}
            </button>
            <button className="btn-ghost" onClick={() => setEditing(null)}>
              取消
            </button>
          </div>
        </div>
      )}

      {dishes.map((d) => (
        <div key={d.id} className={`card flex items-center gap-3 ${d.available ? '' : 'opacity-50'}`}>
          <span className="text-2xl">{d.emoji}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{d.name}</div>
            <div className="text-[11px] text-slate-400">
              {d.category}
              {d.description ? ` · ${d.description}` : ''}
            </div>
          </div>
          <button className="btn-soft px-2 py-1 text-xs" onClick={() => toggle(d)}>
            {d.available ? '下架' : '上架'}
          </button>
          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditing({ ...d })}>
            编辑
          </button>
          <button className="px-1 text-xs text-slate-300" onClick={() => del(d)}>
            删除
          </button>
        </div>
      ))}
    </div>
  )
}
