import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadYearReview, type CoupleWeddingState } from '../../lib/db'
import { buildReviewText, EMPTY_YEAR_REVIEW, type YearReview } from '../../lib/keepsake'
import { EmptyState, SkeletonList } from '../States'
import { useToast } from '../Toast'

type Props = {
  memberId: string | null
  friendId: string | null
  myName: string
  friendName: string
  /** 备婚进度 / 台账 / 胶囊都存在这一行 jsonb 里，直接派生，不必再读一次库 */
  weddingState: CoupleWeddingState | null
  weddingTotal: number
}

/** 可选的年份：今年往前 4 年，够盖住从开始用到现在的时间 */
const yearOptions = (now: number) => {
  const y = new Date(now).getFullYear()
  return [y, y - 1, y - 2, y - 3, y - 4]
}

/** F4 年度回顾：把散在各张表里的痕迹聚成一份「年度账单」，可导出文本文档 */
export default function YearReviewBoard({ memberId, friendId, myName, friendName, weddingState, weddingTotal }: Props) {
  const toast = useToast()
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [review, setReview] = useState<YearReview | null>(null)
  const [loading, setLoading] = useState(true)
  const years = useMemo(() => yearOptions(Date.now()), [])

  const extra = useMemo(() => ({
    weddingDone: weddingState?.done.length ?? 0,
    weddingTotal,
    capsules: weddingState?.capsules?.length ?? 0,
    topics: weddingState?.topics ?? [],
  }), [weddingState, weddingTotal])

  const load = useCallback(async () => {
    if (!memberId || !friendId) {
      setReview({ ...EMPTY_YEAR_REVIEW, year })
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      setReview(await loadYearReview(memberId, friendId, year, extra))
    } catch (error) {
      toast.show((error as Error).message, 'err')
      setReview({ ...EMPTY_YEAR_REVIEW, year })
    } finally {
      setLoading(false)
    }
  }, [memberId, friendId, year, extra, toast])

  useEffect(() => { void load() }, [load])

  const data = review ?? { ...EMPTY_YEAR_REVIEW, year }
  const hasAny = data.meals + data.messages + data.quizzes + data.truths + data.wishes + data.photos +
    data.weddingDone + data.capsules + data.topicsTotal > 0
  const weddingPercent = data.weddingTotal ? Math.round((data.weddingDone / data.weddingTotal) * 100) : 0
  const topicPercent = data.topicsTotal ? Math.round((data.topicsSettled / data.topicsTotal) * 100) : 0

  const exportText = () => {
    const blob = new Blob([`\uFEFF${buildReviewText(data, myName, friendName)}`], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${myName}×${friendName}-${year}年度回顾.txt`
    a.click()
    URL.revokeObjectURL(url)
    toast.show('年度回顾已导出')
  }

  const bigStats = [
    { icon: '🍚', value: data.meals, unit: '次', label: '三餐打卡' },
    { icon: '🗓️', value: data.mealDays, unit: '天', label: '一起吃饭的日子' },
    { icon: '🔥', value: data.longestStreak, unit: '天', label: '最长连续打卡' },
  ]
  const rows = [
    { icon: '💬', label: '甜蜜留言', value: data.messages, unit: '条' },
    { icon: '💞', label: '同步抉择', value: data.quizzes, unit: '题' },
    { icon: '🎲', label: '真心话大冒险', value: data.truths, unit: '题' },
    { icon: '🎁', label: '秘密心愿', value: data.wishes, unit: '个' },
    { icon: '🖼️', label: '共同相册', value: data.photos, unit: '张照片' },
    { icon: '💌', label: '写给未来的信', value: data.capsules, unit: '封' },
  ]

  return (
    <section id="couple-active-module" className="card space-y-4">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">📊 我们的年度回顾</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            一整年的打卡、留言、答题和备婚进度，都收在这一页里。
          </p>
        </div>
        <button type="button" className="btn-ghost shrink-0 px-2 py-1 text-[11px]" disabled={loading} onClick={exportText}>⬇ 导出</button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {years.map((y) => (
          <button
            key={y}
            type="button"
            className={`rounded-full px-3 py-1 text-[11px] transition ${year === y ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-500'}`}
            onClick={() => setYear(y)}
          >
            {y} 年
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonList rows={4} />
      ) : !hasAny ? (
        <EmptyState icon="📊" title={`${year} 年还没有记录`} hint="换个年份看看，或者从今天起慢慢攒起来" />
      ) : (
        <>
          {/* 可截图的账单主视觉 */}
          <div className="rounded-2xl bg-gradient-to-br from-rose-500 via-rose-400 to-orange-400 p-4 text-white shadow-sm skeleton-fade">
            <div className="text-[11px] opacity-90">{year} 年度账单 · {myName} × {friendName}</div>
            <div className="mt-2 text-2xl font-bold">这一年，也一起走过来了 💕</div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {bigStats.map((s) => (
                <div key={s.label} className="rounded-xl bg-white/15 px-2 py-2.5 text-center backdrop-blur-sm">
                  <div className="text-base">{s.icon}</div>
                  <div className="mt-1 text-xl font-bold leading-none">{s.value}<span className="ml-0.5 text-[10px] font-normal">{s.unit}</span></div>
                  <div className="mt-1 text-[10px] leading-tight opacity-90">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-2">
                <span className="text-base">{r.icon}</span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-slate-500">{r.label}</span>
                <span className="shrink-0 text-sm font-semibold text-slate-700">{r.value}<span className="ml-0.5 text-[10px] font-normal text-slate-400">{r.unit}</span></span>
              </div>
            ))}
          </div>

          <div className="space-y-3 rounded-xl border border-slate-100 p-3">
            <div className="text-xs font-semibold text-slate-600">一起走的下一步</div>
            <div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>💍 备婚流程</span><span>{data.weddingDone}/{data.weddingTotal} 步 · {weddingPercent}%</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-gradient-to-r from-rose-400 to-orange-400" style={{ width: `${weddingPercent}%` }} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>🗂️ 沟通台账谈拢</span><span>{data.topicsSettled}/{data.topicsTotal} 项 · {topicPercent}%</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-400" style={{ width: `${topicPercent}%` }} />
              </div>
            </div>
          </div>

          <p className="text-center text-[11px] leading-relaxed text-slate-400">
            {year} 也一起走过来了，明年继续。<br />点右上角导出，可以把这份回顾存成文档。
          </p>
        </>
      )}
    </section>
  )
}
