import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listDishRequests, listDishes, removeDish, resolveDishRequest, saveDish } from '../lib/db'
import { useToast } from '../components/Toast'
import { useRealtime } from '../lib/realtime'
import { timeCn } from '../lib/date'
import { useMembers } from '../store/members'
import { useUnread } from '../store/unread'
import { DISH_REQUEST_STATUS, type Dish, type DishRequest } from '../lib/types'

const CATEGORIES = ['家常菜', '荤菜', '素菜', '汤羹', '主食', '西餐', '轻食', '奶茶', '饮品', '小吃', '甜品', '夜宵']

/** 常用图标：按场景分组，点一下就能用 */
const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  { label: '奶茶饮品', emojis: ['🧋', '🥤', '☕', '🍵', '🧉', '🥛', '🍹', '🍺', '🧊', '🫖'] },
  { label: '中餐', emojis: ['🍜', '🍚', '🍲', '🥘', '🍛', '🥟', '🍱', '🥡', '🍢', '🥠'] },
  { label: '肉菜海鲜', emojis: ['🍖', '🍗', '🥩', '🍤', '🦐', '🐟', '🦀', '🥓', '🍔', '🌭'] },
  { label: '素菜', emojis: ['🥦', '🥬', '🍆', '🥔', '🌽', '🥕', '🧄', '🧅', '🍄', '🥒'] },
  { label: '主食点心', emojis: ['🍞', '🥐', '🧇', '🍕', '🍝', '🌮', '🍙', '🍘', '🥞', '🍟'] },
  { label: '甜品水果', emojis: ['🍰', '🧁', '🍦', '🍩', '🍪', '🍓', '🍉', '🍇', '🥝', '🍮'] },
]

/** 当前 emoji 所属的图标分组，找不到就回到第一组 */
const groupOf = (emoji?: string) => {
  const i = EMOJI_GROUPS.findIndex((g) => g.emojis.includes(emoji ?? ''))
  return i >= 0 ? i : 0
}

/** 按菜名猜一个分类和图标，审核时少点几下 */
const GUESS: { keywords: string[]; category: string; emoji: string }[] = [
  { keywords: ['奶茶', '奶绿', '拿铁', '啵啵', '波波', '芋泥', '甘露', '奶昔', '奶茶类'], category: '奶茶', emoji: '🧋' },
  { keywords: ['可乐', '雪碧', '果汁', '汽水', '柠檬', '苏打', '凉茶', '豆浆', '咖啡'], category: '饮品', emoji: '🥤' },
  { keywords: ['炒饭', '盖饭', '盖浇', '煲仔', '饭团', '寿司', '饭'], category: '主食', emoji: '🍚' },
  { keywords: ['面', '粉', '意面', '拉面', '凉皮', '河粉'], category: '主食', emoji: '🍜' },
  { keywords: ['包', '饺', '馄饨', '饼', '馒头', '包子'], category: '主食', emoji: '🥟' },
  { keywords: ['粥'], category: '主食', emoji: '🥣' },
  { keywords: ['汤', '羹'], category: '汤羹', emoji: '🍲' },
  { keywords: ['牛排', '披萨', '沙拉', '汉堡', '薯条', '芝士'], category: '西餐', emoji: '🍕' },
  { keywords: ['蛋糕', '布丁', '冰激凌', '冰淇淋', '雪糕', '甜'], category: '甜品', emoji: '🍰' },
  { keywords: ['烤串', '炸鸡', '炸', '串', '零食', '薯片'], category: '小吃', emoji: '🍢' },
  { keywords: ['鱼', '虾', '蟹', '肉', '鸡', '牛', '排骨', '鸭'], category: '荤菜', emoji: '🍖' },
  { keywords: ['青菜', '西兰花', '菠菜', '豆', '土豆', '茄子', '素'], category: '素菜', emoji: '🥦' },
]

const guess = (name: string): { category: string; emoji: string } => {
  const hit = GUESS.find((g) => g.keywords.some((k) => name.includes(k)))
  return hit ? { category: hit.category, emoji: hit.emoji } : { category: '家常菜', emoji: '🍽️' }
}

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
  const { members } = useMembers()
  const { refresh } = useUnread()
  const [dishes, setDishes] = useState<Dish[]>([])
  const [requests, setRequests] = useState<DishRequest[]>([])
  const [showDone, setShowDone] = useState(false)
  const [reviewId, setReviewId] = useState<string | null>(null)
  const [editing, setEditing] = useState<(Partial<Dish> & { name: string }) | null>(null)
  const [saving, setSaving] = useState(false)
  const [iconTab, setIconTab] = useState(0)
  const [keyword, setKeyword] = useState('')
  const formRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      setDishes(await listDishes())
    } catch (e) {
      toast.show((e as Error).message, 'err')
    }
  }, [toast])

  const loadRequests = useCallback(async () => {
    try {
      setRequests(await listDishRequests())
    } catch {
      // 还没执行迁移脚本时先忽略，不影响菜单本身
    }
  }, [])

  useEffect(() => {
    void load()
    void loadRequests()
  }, [load, loadRequests])

  useRealtime(
    'admin-dishes',
    [
      { table: 'dishes', on: () => void load() },
      { table: 'dish_requests', on: () => void loadRequests() },
    ],
    {
      onPoll: () => {
        void load()
        void loadRequests()
      },
    }
  )

  const pending = useMemo(() => requests.filter((r) => r.status === 'pending'), [requests])
  const done = useMemo(() => requests.filter((r) => r.status !== 'pending').slice(0, 10), [requests])
  const who = (id: string | null) => members.find((m) => m.id === id)?.name ?? '她'

  const openForm = (d: Partial<Dish> & { name: string }) => {
    setEditing(d)
    setIconTab(groupOf(d.emoji))
    // 表单在列表上方，编辑列表底部的菜时把页面滚上去，避免「点了没反应」的错觉
    window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  /** 审核通过：用她的菜名预填表单，保存后自动标记申请已收录 */
  const approve = (r: DishRequest) => {
    const g = guess(r.name)
    setReviewId(r.id)
    openForm({
      name: r.name,
      category: g.category,
      emoji: g.emoji,
      description: r.note || '',
      price: 0,
      available: true,
      sort_order: 0,
    })
  }

  const reject = async (r: DishRequest) => {
    try {
      await resolveDishRequest(r.id, 'rejected')
      toast.show('已婉拒')
      await loadRequests()
      refresh()
    } catch (e) {
      toast.show((e as Error).message, 'err')
    }
  }

  const save = async () => {
    if (!editing?.name.trim()) return toast.show('菜名不能为空', 'err')
    setSaving(true)
    try {
      await saveDish(editing)
      let msg = '已保存'
      if (reviewId) {
        await resolveDishRequest(reviewId, 'approved')
        msg = '已收进菜单，她那边立刻能点啦'
      }
      setEditing(null)
      setReviewId(null)
      toast.show(msg)
      await load()
      await loadRequests()
      refresh()
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

  const list = useMemo(() => {
    const kw = keyword.trim()
    if (!kw) return dishes
    return dishes.filter((d) => d.name.includes(kw) || d.category.includes(kw) || d.description.includes(kw))
  }, [dishes, keyword])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-600">菜单管理（{dishes.length} 道）</h2>
        <button className="btn-primary text-xs" onClick={() => openForm(blank())}>
          + 加菜
        </button>
      </div>

      {pending.length > 0 && (
        <div className="card space-y-2 border-amber-200 bg-amber-50/70">
          <h3 className="text-xs font-semibold text-amber-700">⏳ 她想吃的新菜（{pending.length}）</h3>
          {pending.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center gap-2 border-t border-amber-100 pt-2 first:border-0 first:pt-0"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">🆕 {r.name}</div>
                <div className="text-[11px] text-slate-500">
                  {who(r.member_id)} · {timeCn(r.created_at)}
                  {r.note ? ` · ${r.note}` : ''}
                </div>
              </div>
              <button className="btn-primary px-2 py-1 text-xs" onClick={() => approve(r)}>
                收进菜单
              </button>
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => reject(r)}>
                婉拒
              </button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div ref={formRef} className="card space-y-2 border-brand-200">
          {reviewId && (
            <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-700">
              🆕 这是她申请的新菜，确认完分类 / 图标后点「保存」就会收进菜单
            </p>
          )}
          <div className="flex gap-2">
            <input
              className="input w-16 text-center text-lg"
              value={editing.emoji ?? '🍽️'}
              onChange={(e) => setEditing({ ...editing, emoji: e.target.value })}
            />
            <input
              className="input flex-1"
              placeholder="菜名，比如：珍珠奶茶"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </div>

          <div className="rounded-xl border border-slate-200 p-2">
            <div className="mb-1.5 flex flex-wrap gap-1">
              {EMOJI_GROUPS.map((g, i) => (
                <button
                  key={g.label}
                  type="button"
                  onClick={() => setIconTab(i)}
                  className={`chip ${i === iconTab ? 'border-brand-400 bg-brand-50 text-brand-600' : 'border-slate-200 text-slate-400'}`}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-8 gap-1">
              {EMOJI_GROUPS[iconTab].emojis.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEditing({ ...editing, emoji: e })}
                  className={`rounded-lg py-1 text-xl leading-none transition ${
                    editing.emoji === e ? 'bg-brand-100 ring-2 ring-brand-300' : 'bg-slate-50 active:scale-95'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">点图标直接选用，也可以自己往左上角的框里输入 emoji</p>
          </div>

          <input
            className="input"
            placeholder="描述（可不填，比如：常温 / 三分糖）"
            value={editing.description ?? ''}
            onChange={(e) => setEditing({ ...editing, description: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="mb-1 text-[11px] text-slate-400">分类</div>
              <select
                className="input"
                value={editing.category}
                onChange={(e) => setEditing({ ...editing, category: e.target.value })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="mb-1 text-[11px] text-slate-400">价格（元，不填就写 0）</div>
              <input
                className="input"
                type="number"
                min="0"
                step="1"
                inputMode="decimal"
                value={editing.price ?? 0}
                onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })}
              />
            </div>
            <div>
              <div className="mb-1 text-[11px] text-slate-400">排序（数字越小越靠前）</div>
              <input
                className="input"
                type="number"
                step="1"
                inputMode="numeric"
                value={editing.sort_order ?? 0}
                onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })}
              />
            </div>
            <div className="flex items-end justify-center pb-2">
              <label className="flex items-center gap-1 text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={editing.available ?? true}
                  onChange={(e) => setEditing({ ...editing, available: e.target.checked })}
                />
                上架（取消勾选她就看不见了）
              </label>
            </div>
          </div>

          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={saving} onClick={save}>
              {saving ? '保存中…' : '保存'}
            </button>
            <button
              className="btn-ghost"
              onClick={() => {
                setEditing(null)
                setReviewId(null)
              }}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {done.length > 0 && (
        <button className="text-xs text-slate-400" onClick={() => setShowDone((v) => !v)}>
          {showDone ? '收起' : '查看'}已处理的申请（{done.length}）
        </button>
      )}
      {showDone &&
        done.map((r) => (
          <div key={r.id} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs shadow-card">
            <span className="min-w-0 flex-1 truncate text-slate-500">{r.name}</span>
            <span className={`chip ${DISH_REQUEST_STATUS[r.status].cls}`}>
              {DISH_REQUEST_STATUS[r.status].emoji} {DISH_REQUEST_STATUS[r.status].label}
            </span>
          </div>
        ))}

      <input className="input" placeholder="🔍 搜索菜名 / 分类" value={keyword} onChange={(e) => setKeyword(e.target.value)} />

      {list.map((d) => (
        <div key={d.id} className={`card flex items-center gap-3 ${d.available ? '' : 'opacity-50'}`}>
          <span className="text-2xl">{d.emoji}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{d.name}</div>
            <div className="text-[11px] text-slate-400">
              {d.category}
              {d.price > 0 ? ` · ¥${d.price}` : ''}
              {d.description ? ` · ${d.description}` : ''}
            </div>
          </div>
          <button className="btn-soft px-2 py-1 text-xs" onClick={() => toggle(d)}>
            {d.available ? '下架' : '上架'}
          </button>
          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => openForm({ ...d })}>
            编辑
          </button>
          <button className="px-1 text-xs text-slate-300" onClick={() => del(d)}>
            删除
          </button>
        </div>
      ))}

      {list.length === 0 && <p className="py-8 text-center text-sm text-slate-400">还没有菜品，点右上角「+ 加菜」加一道～</p>}
    </div>
  )
}
