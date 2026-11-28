import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createCoupleGoal,
  deleteCoupleGoal,
  listCoupleGoals,
  patchCoupleGoal,
  type CoupleGoalRow,
} from '../../lib/db'
import {
  GOAL_TEMPLATES,
  daysLeft,
  goalMetaLine,
  goalPercent,
  goalValueText,
  toggleCheckin,
  weeklyCheckins,
  type GoalKind,
} from '../../lib/goals'
import { lastDays, todayStr, weekdayCn } from '../../lib/date'
import { POLL, useRealtime } from '../../lib/realtime'
import WheelDateField from '../WheelDateField'
import { Modal, useConfirm } from '../Modal'
import { EmptyState, SkeletonList } from '../States'
import { useToast } from '../Toast'

/**
 * 共建目标：存钱 / 旅行 / 习惯 / 自定义。
 *
 * 一个目标一行存在 couple_goals，写操作用 updated_at 乐观锁：
 * 两人同时打卡时返回 false，这里重拉后提示「已同步」，不会静默吞掉对方的进度。
 * 习惯的打卡日期存在 checkins 数组里，连续天数在前端算，不需要第二张表。
 */

type Draft = {
  kind: GoalKind
  emoji: string
  title: string
  target: string
  unit: string
  deadline: string
  note: string
}

const emptyDraft = (kind: GoalKind = 'save'): Draft => {
  const tpl = GOAL_TEMPLATES.find((t) => t.kind === kind) ?? GOAL_TEMPLATES[0]
  return {
    kind,
    emoji: tpl.emoji,
    title: '',
    target: tpl.defaultTarget ? String(tpl.defaultTarget) : '',
    unit: tpl.unit,
    deadline: '',
    note: '',
  }
}

/** 状态徽章的色阶写字面量，别拼字符串 */
function statusCls(status: CoupleGoalRow['status']): string {
  if (status === 'done') return 'border-ok-200 bg-ok-50 text-ok-600'
  if (status === 'archived') return 'border-slate-200 bg-slate-50 text-slate-400'
  return 'border-brand-200 bg-brand-50 text-brand-600'
}

export default function CoupleGoals({
  memberId,
  friendId,
  myName,
  friendName,
}: {
  memberId: string | null
  friendId: string | null
  myName: string
  friendName: string
}) {
  const toast = useToast()
  const confirm = useConfirm()
  const pair = useMemo(
    () => (memberId && friendId ? ([memberId, friendId] as const) : null),
    [memberId, friendId]
  )

  const today = todayStr()
  const week = useMemo(() => lastDays(7), [])

  const [goals, setGoals] = useState<CoupleGoalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => emptyDraft())
  /** 存钱/自定义的「记一笔」弹窗 */
  const [amountFor, setAmountFor] = useState<CoupleGoalRow | null>(null)
  const [amount, setAmount] = useState('')

  const load = useCallback(
    async (silent = false) => {
      if (!pair) {
        setLoading(false)
        return
      }
      if (!silent) setLoading(true)
      try {
        setGoals(await listCoupleGoals(pair[0], pair[1]))
      } catch (e) {
        toast.show(e instanceof Error ? e.message : '加载共建目标失败', 'err')
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [pair, toast]
  )

  useEffect(() => {
    void load()
  }, [load])

  useRealtime(
    useMemo(() => `couple-goals:${pair ? pair.join(':') : 'none'}`, [pair]),
    [{ table: 'couple_goals', on: () => void load(true) }],
    { enabled: !!pair, pollMs: POLL.warm, pair, onPoll: () => void load(true) }
  )

  const stats = useMemo(() => {
    const active = goals.filter((g) => g.status === 'active').length
    const done = goals.filter((g) => g.status === 'done').length
    const checkins = goals.reduce((n, g) => n + g.checkins.length, 0)
    return { active, done, checkins }
  }, [goals])

  const sorted = useMemo(() => {
    const order: Record<CoupleGoalRow['status'], number> = { active: 0, done: 1, archived: 2 }
    return [...goals].sort((a, b) => order[a.status] - order[b.status] || b.created_at.localeCompare(a.created_at))
  }, [goals])

  /** 统一写入口：先乐观更新，撞到乐观锁就重拉，失败回滚 */
  const mutate = async (goal: CoupleGoalRow, change: Partial<CoupleGoalRow>): Promise<boolean> => {
    setBusy(goal.id)
    setGoals((prev) => prev.map((g) => (g.id === goal.id ? { ...g, ...change } : g)))
    try {
      const ok = await patchCoupleGoal(goal.id, change, goal.updated_at)
      await load(true)
      if (!ok) toast.show('对方刚更新过，已经同步成最新进度')
      return ok
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '保存失败', 'err')
      await load(true)
      return false
    } finally {
      setBusy(null)
    }
  }

  const create = async () => {
    if (!pair) return
    const title = draft.title.trim()
    if (!title) return toast.show('先给目标起个名字', 'err')
    const target = draft.kind === 'habit' ? null : draft.target ? Number(draft.target) : null
    if (draft.kind !== 'habit' && draft.target && (!Number.isFinite(target) || (target ?? 0) <= 0)) {
      return toast.show('目标数值要大于 0', 'err')
    }
    setSaving(true)
    try {
      const row = await createCoupleGoal({
        userA: pair[0],
        userB: pair[1],
        title,
        kind: draft.kind,
        emoji: draft.emoji,
        target,
        unit: draft.unit,
        deadline: draft.deadline || null,
        note: draft.note,
        createdBy: memberId,
      })
      setGoals((prev) => [row, ...prev])
      setCreating(false)
      setDraft(emptyDraft())
      toast.show('目标已加进来')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '新建目标失败', 'err')
    } finally {
      setSaving(false)
    }
  }

  const toggleDone = (goal: CoupleGoalRow) => {
    void mutate(goal, { status: goal.status === 'done' ? 'active' : 'done' })
  }

  const checkin = (goal: CoupleGoalRow) => {
    const already = goal.checkins.includes(today)
    void mutate(goal, { checkins: toggleCheckin(goal.checkins, today) }).then((ok) => {
      if (ok) toast.show(already ? '已取消今天的打卡' : '今天也坚持了 ✓')
    })
  }

  const addAmount = () => {
    if (!amountFor) return
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) return toast.show('填一个大于 0 的数值', 'err')
    const next = Number((amountFor.current + n).toFixed(2))
    void mutate(amountFor, { current: next }).then((ok) => {
      if (ok) toast.show('已记一笔')
    })
    setAmountFor(null)
    setAmount('')
  }

  const remove = async (goal: CoupleGoalRow) => {
    const ok = await confirm({
      title: '删除这个目标？',
      message: `「${goal.title}」的进度和打卡记录会一起删掉，无法恢复。`,
      okText: '删除',
      danger: true,
    })
    if (!ok) return
    try {
      await deleteCoupleGoal(goal.id)
      setGoals((prev) => prev.filter((g) => g.id !== goal.id))
      toast.show('已删除')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '删除失败', 'err')
    }
  }

  const editingTpl = GOAL_TEMPLATES.find((t) => t.kind === draft.kind) ?? GOAL_TEMPLATES[0]
  const needTarget = draft.kind !== 'habit'

  // 「记一笔」的单位跟着目标走：钱用元，其他自定义单位就按「件/部/次」加数量
  const amountUnit = amountFor
    ? amountFor.unit || (amountFor.kind === 'save' || amountFor.kind === 'travel' ? '元' : '')
    : '元'
  const moneyTarget = amountUnit === '' || amountUnit === '元'
  const unitLabel = amountUnit || '次'

  return (
    <section id="couple-active-module" className="card space-y-4">
      <div>
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold">🌱 共建目标</h3>
            <p className="mt-1 truncate text-xs text-slate-400">
              一起攒钱、一起出发、一起养成一件事
            </p>
          </div>
          <button
            type="button"
            className="btn-primary btn-sm shrink-0"
            onClick={() => {
              setDraft(emptyDraft())
              setCreating(true)
            }}
          >
            ＋ 新目标
          </button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            { label: '进行中', value: stats.active },
            { label: '已完成', value: stats.done },
            { label: '累计打卡', value: stats.checkins },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-slate-50 py-2">
              <div className="text-base font-semibold tabular-nums text-slate-700">{s.value}</div>
              <div className="mt-0.5 text-2xs text-slate-400">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {loading && goals.length === 0 ? (
        <SkeletonList rows={4} variant="grid" />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon="🌱"
          title="还没有一起定过目标"
          hint="从存钱、旅行、习惯里挑一个开始，比空想要实在"
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 skeleton-fade">
          {sorted.map((g) => {
            const percent = goalPercent(g, today)
            const left = daysLeft(g.deadline, today)
            const done = g.status === 'done'
            const checkedToday = g.checkins.includes(today)
            return (
              <article key={g.id} className="space-y-2 rounded-xl border border-slate-100 bg-white p-3">
                <div className="flex items-start gap-2">
                  <span className="shrink-0 text-lg leading-none" aria-hidden>
                    {g.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-700">{g.title}</p>
                    <p className="mt-0.5 truncate text-2xs text-slate-400">{goalMetaLine(g, today)}</p>
                  </div>
                  <span className={`chip shrink-0 px-1.5 py-0.5 text-2xs ${statusCls(g.status)}`}>
                    {done ? '已完成' : g.status === 'archived' ? '已归档' : '进行中'}
                  </span>
                </div>

                {g.kind === 'habit' ? (
                  /* 连续天数已经在副标题里了，这里只放七个格子；格子用 flex-1 撑满，
                     320px 窄屏也不会和右边的文字挤在一起 */
                  <div className="flex gap-1">
                    {week.map((d) => (
                      <span
                        key={d}
                        className={`h-6 flex-1 rounded-md text-center text-2xs leading-6 ${
                          g.checkins.includes(d) ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-300'
                        }`}
                      >
                        {weekdayCn(d).slice(-1)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="flex items-end justify-between gap-2">
                      <span className="min-w-0 truncate text-2xs text-slate-500">
                        <b className="text-base font-semibold tabular-nums text-brand-600">
                          {goalValueText(g, today)}
                        </b>
                      </span>
                      <span className="shrink-0 text-2xs tabular-nums text-slate-400">{percent}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-rose-400 to-orange-400 transition-all duration-500"
                        style={{ width: `${Math.max(percent > 0 ? 4 : 0, percent)}%` }}
                      />
                    </div>
                  </>
                )}

                <div className="flex gap-2">
                  {g.kind === 'habit' ? (
                    <button
                      type="button"
                      className={`btn-sm flex-1 ${checkedToday ? 'btn-ghost' : 'btn-soft'}`}
                      disabled={busy === g.id}
                      aria-label={checkedToday ? '今天已打卡，再点一次取消' : '今天打卡'}
                      onClick={() => checkin(g)}
                    >
                      {checkedToday ? '已打卡' : '今天打卡'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-soft btn-sm flex-1"
                      disabled={busy === g.id}
                      onClick={() => {
                        setAmountFor(g)
                        setAmount('')
                      }}
                    >
                      记一笔
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-ghost btn-sm flex-1"
                    disabled={busy === g.id}
                    onClick={() => toggleDone(g)}
                  >
                    {done ? '重新开始' : '标记完成'}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost btn-sm shrink-0 px-2 text-slate-400 hover:text-danger-600"
                    aria-label="删除目标"
                    onClick={() => void remove(g)}
                  >
                    删除
                  </button>
                </div>

                {g.note && <p className="truncate text-2xs text-slate-400">📝 {g.note}</p>}
                {g.kind !== 'habit' && left !== null && left >= 0 && left <= 7 && (
                  <p className="text-2xs text-warn-600">
                    {left === 0 ? '今天截止，加油' : `只剩 ${left} 天`}
                  </p>
                )}
                {g.kind === 'habit' && weeklyCheckins(g.checkins, today) >= 7 && (
                  <p className="text-2xs text-ok-600">这一周每天都打卡了，厉害</p>
                )}
              </article>
            )
          })}
        </div>
      )}

      <p className="text-2xs leading-relaxed text-slate-400">
        {friendName
          ? `进度和打卡会和${friendName}实时同步；两人同时操作时以最后同步的为准，不会互相覆盖，我的操作记在「${myName}」名下。`
          : `进度和打卡会实时同步；两人同时操作时以最后同步的为准，不会互相覆盖，我的操作记在「${myName}」名下。`}
      </p>

      {/* 新建目标 */}
      <Modal open={creating} onClose={() => !saving && setCreating(false)} title="新建目标" className="max-w-sm">
        <div className="space-y-3 px-5 pb-5">
          <div className="grid grid-cols-2 gap-2">
            {GOAL_TEMPLATES.map((t) => (
              <button
                key={t.kind}
                type="button"
                className={`rounded-xl border p-2 text-left transition ${
                  draft.kind === t.kind
                    ? 'border-brand-400 bg-brand-50 text-brand-600'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
                onClick={() => setDraft({ ...emptyDraft(t.kind), title: draft.title, note: draft.note })}
              >
                <div className="text-base leading-none">{t.emoji}</div>
                <div className="mt-1 text-xs font-semibold">{t.title}</div>
                <div className="mt-0.5 truncate text-2xs opacity-70">{t.desc}</div>
              </button>
            ))}
          </div>

          <label className="block text-2xs text-slate-500">
            {draft.kind === 'travel' ? '想去哪儿' : draft.kind === 'habit' ? '想坚持什么' : '目标名称'}
            <input
              className="input mt-1"
              maxLength={40}
              value={draft.title}
              placeholder={draft.kind === 'travel' ? '去一次北海道' : draft.kind === 'habit' ? '每天一起散步' : '一起攒旅行基金'}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>

          {needTarget && (
            <div className="flex gap-2">
              <label className="block min-w-0 flex-1 text-2xs text-slate-500">
                目标值
                <input
                  className="input mt-1"
                  inputMode="decimal"
                  value={draft.target}
                  placeholder={editingTpl.defaultTarget ? String(editingTpl.defaultTarget) : '不填就只记累计'}
                  onChange={(e) => setDraft({ ...draft, target: e.target.value.replace(/[^\d.]/g, '') })}
                />
              </label>
              <label className="block w-20 shrink-0 text-2xs text-slate-500">
                单位
                <input
                  className="input mt-1"
                  maxLength={6}
                  value={draft.unit}
                  placeholder="元"
                  onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                />
              </label>
            </div>
          )}

          {draft.kind !== 'habit' && (
            <div>
              <div className="mb-1 text-2xs text-slate-500">截止日（可选）</div>
              <WheelDateField value={draft.deadline} onChange={(v) => setDraft({ ...draft, deadline: v })} placeholder="不设截止日" />
            </div>
          )}

          <label className="block text-2xs text-slate-500">
            备注（可选）
            <textarea
              className="input mt-1 h-16 resize-none"
              maxLength={120}
              value={draft.note}
              placeholder="为什么想一起做这件事"
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
          </label>

          <div className="flex gap-2">
            <button type="button" className="btn-primary flex-1" disabled={saving} onClick={() => void create()}>
              {saving ? '创建中…' : '创建目标'}
            </button>
            <button type="button" className="btn-ghost flex-1" disabled={saving} onClick={() => setCreating(false)}>
              取消
            </button>
          </div>
        </div>
      </Modal>

      {/* 记一笔金额 */}
      <Modal open={!!amountFor} onClose={() => setAmountFor(null)} title="记一笔" className="max-w-xs">
        <div className="space-y-3 px-5 pb-5">
          <p className="truncate text-xs text-slate-500">
            {amountFor ? `${amountFor.emoji} ${amountFor.title} · 当前 ${goalValueText(amountFor, today)}` : ''}
          </p>
          <input
            className="input text-center text-lg tabular-nums"
            inputMode="decimal"
            autoFocus
            value={amount}
            placeholder={moneyTarget ? '金额' : `加几${unitLabel}`}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
          />
          <div className="flex gap-2">
            {(moneyTarget ? [100, 200, 500] : [1, 5, 10]).map((n) => (
              <button
                key={n}
                type="button"
                className="btn-ghost btn-sm flex-1"
                onClick={() => setAmount(String((Number(amount) || 0) + n))}
              >
                +{n}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-primary flex-1" onClick={addAmount}>
              确认
            </button>
            <button type="button" className="btn-ghost flex-1" onClick={() => setAmountFor(null)}>
              取消
            </button>
          </div>
          <p className="text-center text-2xs text-slate-400">
            {amountFor ? `记下的数值会累加到「${amountFor.title}」的进度里` : ''}
          </p>
        </div>
      </Modal>
    </section>
  )
}
