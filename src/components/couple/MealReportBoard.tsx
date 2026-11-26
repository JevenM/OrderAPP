import { useCallback, useEffect, useMemo, useState } from 'react'
import { listMealsForPeriod } from '../../lib/db'
import { exportTableCsv } from '../../lib/export'
import {
  analyzeMeals,
  buildMealReportText,
  listPeriods,
  mealDetailRows,
  type MealReport,
  type ReportKind,
} from '../../lib/mealReport'
import type { Meal } from '../../lib/types'
import { EmptyState, SkeletonList } from '../States'
import { useToast } from '../Toast'

type Props = {
  memberId: string | null
  friendId: string | null
  myName: string
  friendName: string
}

const KINDS: { key: ReportKind; label: string; count: number }[] = [
  { key: 'month', label: '月报', count: 12 },
  { key: 'half', label: '半年报', count: 6 },
  { key: 'year', label: '年报', count: 5 },
]

const PERCENT = (ratio: number) => `${Math.round(ratio * 100)}%`

/** 一条横向占比条：左侧标签、右侧数值，中间渐变进度 */
function Bar({ label, value, max, tone = 'rose' }: { label: string; value: number; max: number; tone?: 'rose' | 'emerald' | 'amber' }) {
  const width = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  const fill = tone === 'emerald' ? 'from-emerald-400 to-teal-400' : tone === 'amber' ? 'from-amber-400 to-orange-400' : 'from-rose-400 to-orange-400'
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-16 shrink-0 text-slate-500">{label}</span>
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full bg-gradient-to-r ${fill} transition-all duration-500`} style={{ width: `${width}%` }} />
      </div>
      <span className="w-8 shrink-0 text-right tabular-nums text-slate-400">{value}</span>
    </div>
  )
}

/** 三餐周期总结报告：月报 / 半年报 / 年报，含偏好、习惯、建议与导出 */
export default function MealReportBoard({ memberId, friendId, myName, friendName }: Props) {
  const toast = useToast()
  const [kind, setKind] = useState<ReportKind>('month')
  const [periodKey, setPeriodKey] = useState('')
  const [report, setReport] = useState<MealReport | null>(null)
  const [meals, setMeals] = useState<Meal[]>([])
  const [loading, setLoading] = useState(true)

  const count = KINDS.find((k) => k.key === kind)!.count
  const periods = useMemo(() => listPeriods(kind, count), [kind, count])
  const period = periods.find((p) => p.key === periodKey) ?? periods[0]
  const pair = useMemo(
    () => (memberId && friendId ? ([memberId, friendId] as const) : null),
    [memberId, friendId]
  )

  const load = useCallback(async () => {
    if (!pair || !period) {
      setReport(null)
      setMeals([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const rows = await listMealsForPeriod(period.start, period.end, pair)
      setMeals(rows)
      setReport(analyzeMeals(period, rows, pair))
    } catch (error) {
      toast.show((error as Error).message, 'err')
      setReport(null)
    } finally {
      setLoading(false)
    }
  }, [pair, period, toast])

  useEffect(() => { void load() }, [load])

  const switchKind = (next: ReportKind) => {
    setKind(next)
    setPeriodKey('') // 回到该粒度的当前周期
  }

  const exportText = () => {
    if (!report) return
    const blob = new Blob([`\uFEFF${buildMealReportText(report, myName, friendName)}`], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${myName}×${friendName}-${report.period.key}-三餐报告.txt`
    a.click()
    URL.revokeObjectURL(url)
    toast.show('报告已导出')
  }

  const exportDetail = () => {
    if (!pair) return
    exportTableCsv(
      `${myName}×${friendName}-${period.key}-三餐明细.csv`,
      ['日期', '餐次', '状态', '吃了什么', '备注', '照片', '提交时间'],
      mealDetailRows(meals, pair)
    )
    toast.show('明细已导出')
  }

  const slotMax = report ? Math.max(1, ...Object.values(report.bySlot)) : 1
  const tasteMax = report ? Math.max(1, ...report.tastes.map((t) => t.count)) : 1

  return (
    <section id="couple-active-module" className="card space-y-4">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">🍚 三餐总结报告</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            报告吃饭偏好与习惯。
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button type="button" className="btn-ghost px-2 py-1 text-[11px]" disabled={loading || !report} onClick={exportText}>⬇ 报告</button>
          <button type="button" className="btn-ghost px-2 py-1 text-[11px]" disabled={loading || !report} onClick={exportDetail}>⬇ 明细</button>
        </div>
      </div>

      {/* 粒度 + 周期两级切换 */}
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-50 p-1">
        {KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            className={`rounded-md py-1 text-[11px] transition ${kind === k.key ? 'bg-white font-semibold text-rose-600 shadow-sm' : 'text-slate-400'}`}
            onClick={() => switchKind(k.key)}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {periods.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`shrink-0 rounded-full px-3 py-1 text-[11px] transition ${
              p.key === period.key ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-500'
            }`}
            onClick={() => setPeriodKey(p.key)}
          >
            {p.label}{p.closed ? '' : ' · 进行中'}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonList rows={4} />
      ) : !pair ? (
        <EmptyState icon="💞" title="还没有绑定对象" hint="先和对方加为好友，才能生成属于你们俩的报告。" />
      ) : !report || report.total === 0 ? (
        <EmptyState
          icon="🍽️"
          title={`${period.label}还没有打卡记录`}
          hint="去「干饭 → 三餐」记下吃的第一餐，攒几天就能看出习惯啦。"
        />
      ) : (
        <>
          {/* 主视觉：一眼看到覆盖率、打卡量与连续天数 */}
          <div className="rounded-2xl bg-gradient-to-br from-rose-500 via-rose-400 to-orange-400 p-4 text-white shadow-sm">
            <div className="text-[11px] opacity-90">{period.label} · {period.days} 天 · 我们俩</div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-2xl font-semibold tabular-nums">{report.total}</div>
                <div className="text-[10px] opacity-90">次打卡</div>
              </div>
              <div>
                <div className="text-2xl font-semibold tabular-nums">{report.days}</div>
                <div className="text-[10px] opacity-90">天有记录</div>
              </div>
              <div>
                <div className="text-2xl font-semibold tabular-nums">{report.longestStreak}</div>
                <div className="text-[10px] opacity-90">最长连续</div>
              </div>
            </div>
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-[10px] opacity-90">
                <span>打卡覆盖率</span><span>{PERCENT(report.coverage)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/30">
                <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${Math.round(report.coverage * 100)}%` }} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="mb-2 text-[11px] font-semibold text-slate-600">🍽️ 饮食习惯</div>
              <div className="space-y-1.5">
                <Bar label="早餐" value={report.bySlot.breakfast} max={slotMax} />
                <Bar label="午餐" value={report.bySlot.lunch} max={slotMax} />
                <Bar label="晚餐" value={report.bySlot.dinner} max={slotMax} />
                <Bar label="加餐" value={report.bySlot.snack} max={slotMax} />
              </div>
              <div className="mt-2 border-t border-slate-200 pt-2 text-[10px] leading-relaxed text-slate-500">
                吃了 {report.byStatus.eaten} · 吃得少 {report.byStatus.little} · 没吃 {report.byStatus.skipped}
                <br />按时记录 {PERCENT(report.onTimeRate)} · 带照片 {report.photoCount} 条
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="mb-2 text-[11px] font-semibold text-slate-600">🥗 吃饭偏好</div>
              <div className="space-y-1.5">
                {report.tastes.map((t) => (
                  <Bar key={t.key} label={t.label} value={t.count} max={tasteMax} tone={t.key === 'veg' ? 'emerald' : t.key === 'heavy' ? 'amber' : 'rose'} />
                ))}
              </div>
              <div className="mt-2 border-t border-slate-200 pt-2 text-[10px] leading-relaxed text-slate-500">
                {report.topFoods.length
                  ? `常吃：${report.topFoods.slice(0, 5).map((f) => f.name).join('、')}`
                  : '还没识别出常吃的食物'}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-rose-100 bg-rose-50/60 p-3">
            <div className="mb-2 text-[11px] font-semibold text-rose-600">💡 给你的建议</div>
            <ol className="space-y-1.5">
              {report.suggestions.map((s, i) => (
                <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-slate-600">
                  <span className="shrink-0 text-rose-400">{i + 1}.</span><span className="min-w-0 break-words">{s}</span>
                </li>
              ))}
            </ol>
          </div>

          <p className="text-center text-[10px] leading-relaxed text-slate-400">
            数据来自情侣 · 按时率按记录首次提交时间估算 · 品类可重叠计数
            {report.unattributed ? ` · 另有 ${report.unattributed} 条无归属记录未计入` : ''}
          </p>
        </>
      )}
    </section>
  )
}
