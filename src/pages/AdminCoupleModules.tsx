import { useCallback, useEffect, useState } from 'react'
import {
  deleteCoupleTruthPrompts,
  listAllCoupleCountdown,
  listAllCoupleScratch,
  listAllCoupleTruthPromptBank,
  listAllCoupleWatermelonLogs,
  type CoupleCountdownRow,
  type CoupleScratchRow,
  type CoupleTruthPromptRow,
  type CoupleWatermelonLogRow,
} from '../lib/db'
import Pager from '../components/Pager'
import { useToast } from '../components/Toast'
import { useMembers } from '../store/members'

const fmt = (time: string) => new Date(time).toLocaleString('zh-CN')
/** 后台列表每页条数：列表卡片较高，比互动历史少一些页数的同时避免一次铺太长 */
const ADMIN_PAGE_SIZE = 20

export default function AdminCoupleModules() {
  const toast = useToast()
  const { members } = useMembers()
  const [watermelon, setWatermelon] = useState<CoupleWatermelonLogRow[]>([])
  const [countdowns, setCountdowns] = useState<CoupleCountdownRow[]>([])
  const [scratches, setScratches] = useState<CoupleScratchRow[]>([])
  const [prompts, setPrompts] = useState<CoupleTruthPromptRow[]>([])
  const [loading, setLoading] = useState(true)
  /* 长列表分页：内部滚动条在苹果设备上划不动，改为翻页 */
  const [watermelonPage, setWatermelonPage] = useState(0)
  const [promptsPage, setPromptsPage] = useState(0)

  const nameOf = (id: string) => members.find((member) => member.id === id)?.name ?? '未知成员'
  const pairLabel = (a: string, b: string) => `${nameOf(a)} ↔ ${nameOf(b)}`

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [scoreLogs, countdownRows, scratchRows, promptRows] = await Promise.all([
        listAllCoupleWatermelonLogs(),
        listAllCoupleCountdown(),
        listAllCoupleScratch(),
        listAllCoupleTruthPromptBank(),
      ])
      setWatermelon(scoreLogs)
      setCountdowns(countdownRows)
      setScratches(scratchRows)
      setPrompts(promptRows)
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { void reload() }, [reload])

  const removePrompts = async () => {
    if (!prompts.length || !window.confirm(`确定删除全部 ${prompts.length} 条自定义真心话题目吗？`)) return
    try {
      await deleteCoupleTruthPrompts(prompts.map((row) => row.id))
      setPrompts([])
      toast.show('自定义题库已清空')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    }
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold">🧩 新增互动模块管理</h2>
            <p className="mt-1 text-xs text-slate-400">管理西瓜分、重要日、刮刮乐和情侣自定义真心话题库。</p>
          </div>
          <button className="btn-ghost px-2 py-1 text-xs" disabled={loading} onClick={() => void reload()}>{loading ? '加载中…' : '刷新'}</button>
        </div>
      </section>

      <section className="card space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-700">🍉 西瓜分变更记录（{watermelon.length}）</h3>
        </div>
        {watermelon.length === 0 ? <p className="text-xs text-slate-400">暂无记录</p> : (
          <div className="space-y-2">
            {watermelon.slice(watermelonPage * ADMIN_PAGE_SIZE, (watermelonPage + 1) * ADMIN_PAGE_SIZE).map((row) => (
              <div key={row.id} className="rounded-xl bg-slate-50 p-3 text-xs">
                <div className="font-medium text-slate-700">{pairLabel(row.member_a, row.member_b)}</div>
                <div className="mt-1 text-slate-500">{nameOf(row.sender_id)} 给 {nameOf(row.target_member)} {row.delta > 0 ? `加 ${row.delta}` : `减 ${Math.abs(row.delta)}`} 分：{row.reason}</div>
                <div className="mt-1 text-[10px] text-slate-400">{fmt(row.created_at)}</div>
              </div>
            ))}
            <Pager page={watermelonPage} total={watermelon.length} pageSize={ADMIN_PAGE_SIZE} onChange={setWatermelonPage} />
          </div>
        )}
      </section>

      <section className="card space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">📅 重要日倒计时（{countdowns.length} 对）</h3>
        {countdowns.length === 0 ? <p className="text-xs text-slate-400">暂无倒计时</p> : countdowns.map((row) => (
          <div key={`${row.member_a}-${row.member_b}`} className="rounded-xl bg-slate-50 p-3 text-xs">
            <div className="font-medium text-slate-700">{pairLabel(row.member_a, row.member_b)}</div>
            <div className="mt-1 text-slate-500">{row.state.items.length} 个日期 · 最近更新 {fmt(row.updated_at)}</div>
            <div className="mt-2 space-y-1 text-slate-600">{row.state.items.map((item) => <div key={item.id}>{item.emoji ?? '📅'} {item.title} · {item.date}</div>)}</div>
          </div>
        ))}
      </section>

      <section className="card space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">🎫 刮刮乐状态（{scratches.length} 对）</h3>
        {scratches.length === 0 ? <p className="text-xs text-slate-400">暂无刮刮乐记录</p> : scratches.map((row) => (
          <div key={`${row.member_a}-${row.member_b}`} className="rounded-xl bg-slate-50 p-3 text-xs">
            <div className="font-medium text-slate-700">{pairLabel(row.member_a, row.member_b)} · {fmt(row.updated_at)}</div>
            <div className="mt-2 space-y-1 text-slate-600">
              {Object.values(row.state.cards ?? {}).map((card) => <div key={card.id}>{nameOf(card.created_by)}：{card.revealed_at ? `已刮开「${card.prize}」` : '已抽取，未刮开'}</div>)}
            </div>
          </div>
        ))}
      </section>

      <section className="card space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-700">💬 自定义真心话题库（{prompts.length}）</h3>
          <button className="btn-ghost px-2 py-1 text-[11px] text-rose-600" disabled={!prompts.length} onClick={() => void removePrompts()}>清空题库</button>
        </div>
        {prompts.length === 0 ? <p className="text-xs text-slate-400">暂无自定义题目</p> : (
          <div className="space-y-2">{prompts.slice(promptsPage * ADMIN_PAGE_SIZE, (promptsPage + 1) * ADMIN_PAGE_SIZE).map((row) => (
            <div key={row.id} className="rounded-xl bg-slate-50 p-3 text-xs">
              <div className="break-words text-slate-700">{row.prompt}</div>
              <div className="mt-1 text-[10px] text-slate-400">{pairLabel(row.member_a, row.member_b)} · {nameOf(row.created_by)} · {fmt(row.created_at)}</div>
            </div>
          ))}
            <Pager page={promptsPage} total={prompts.length} pageSize={ADMIN_PAGE_SIZE} onChange={setPromptsPage} />
          </div>
        )}
      </section>
    </div>
  )
}
