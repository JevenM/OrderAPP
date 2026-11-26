import { useCallback, useEffect, useState } from 'react'
import { loadWarmthInput } from '../../lib/db'
import { computeWarmth, type WarmthResult } from '../../lib/warmth'
import { shiftDay, todayStr } from '../../lib/date'

/**
 * 关系温度计卡片（互动入口页顶部）。
 *
 * 不是独立模块：进「情侣空间」第一眼就能看到 0-100 的温度，
 * 点一下展开六项分项明细，收起态不占地方。
 *
 * 十个请求换一个数字，所以带 90 秒内存缓存：在模块之间来回切不会反复打接口。
 */

const TTL = 90_000
const cache = new Map<string, { at: number; data: WarmthResult }>()

/** 色阶一律写字面量，别拼 `from-${x}-400`——Tailwind 扫不到会被 purge */
const TONE = {
  hot: { bar: 'from-rose-400 to-orange-400', emoji: '🔥' },
  warm: { bar: 'from-amber-400 to-orange-400', emoji: '☀️' },
  mild: { bar: 'from-sky-400 to-teal-400', emoji: '🌤️' },
  cold: { bar: 'from-slate-300 to-slate-400', emoji: '🧊' },
} as const

const TREND = {
  up: { text: '↗ 升温', cls: 'border-rose-200 bg-rose-50 text-rose-600' },
  flat: { text: '→ 平稳', cls: 'border-slate-200 bg-slate-50 text-slate-500' },
  down: { text: '↘ 降温', cls: 'border-sky-200 bg-sky-50 text-sky-600' },
} as const

export default function WarmthCard({
  memberId,
  friendId,
}: {
  memberId: string | null
  friendId: string | null
}) {
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<WarmthResult | null>(null)
  const [loading, setLoading] = useState(true)

  const key = memberId && friendId ? `${memberId}|${friendId}` : ''

  const load = useCallback(async () => {
    if (!memberId || !friendId) return
    const today = todayStr()
    const cached = cache.get(key)
    if (cached && Date.now() - cached.at < TTL) {
      setResult(cached.data)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const input = await loadWarmthInput(memberId, friendId, shiftDay(today, -13))
      const data = computeWarmth(input, today, [memberId, friendId] as const)
      cache.set(key, { at: Date.now(), data })
      setResult(data)
    } finally {
      setLoading(false)
    }
  }, [memberId, friendId, key])

  useEffect(() => {
    void load()
  }, [load])

  // 还没绑定另一半时不显示，避免入口页顶部挂一张空卡
  if (!memberId || !friendId) return null

  const tone = TONE[result?.band ?? 'cold']
  const trend = TREND[result?.trend ?? 'flat']
  const temp = result?.temp ?? 0

  return (
    <section className="card">
      <button
        type="button"
        className="flex w-full items-start gap-3 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-slate-700">关系温度</span>
            <span className={`chip shrink-0 px-1.5 py-0.5 text-2xs ${trend.cls}`}>{trend.text}</span>
          </div>

          <div className="mt-1 flex items-baseline gap-1">
            {loading && !result ? (
              <span className="skeleton h-7 w-12" aria-label="加载中" />
            ) : (
              <span className="text-[30px] font-bold leading-none tabular-nums text-slate-800">{temp}</span>
            )}
            <span className="shrink-0 text-2xs text-slate-400">/100</span>
            <span className="ml-auto shrink-0 text-2xs text-slate-400">近 7 天</span>
          </div>

          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${tone.bar} transition-all duration-500`}
              style={{ width: `${temp}%` }}
            />
          </div>

          <p className="mt-1.5 truncate text-2xs text-slate-400">
            {loading && !result ? '正在算你们的温度…' : (result?.advice ?? '还没有足够的数据')}
          </p>
        </div>

        <span className="shrink-0 self-center text-3xl leading-none" aria-hidden>
          {tone.emoji}
        </span>
      </button>

      {/* 展开区：外层不留 padding/margin，间距全放在被 overflow:hidden 裁切的子元素里，
          这样收起时高度真的是 0，不会留一段空白 */}
      <div className={`collapse-grid ${open ? 'is-open' : ''}`}>
        <div>
          <div className="space-y-1.5 border-t border-slate-100 pt-3">
            {(result?.parts ?? []).map((p) => (
              <div key={p.key} className="flex items-center gap-2">
                <span className="w-14 shrink-0 truncate text-2xs text-slate-500">{p.label}</span>
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-rose-400 to-orange-400 transition-all duration-500"
                    style={{ width: `${Math.round(p.value * 100)}%` }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right text-2xs tabular-nums text-slate-400">
                  {p.count}/{p.cap}
                </span>
              </div>
            ))}
            {!result && (
              <p className="py-1 text-center text-2xs text-slate-400">展开后这里会显示六项明细</p>
            )}
            <p className="pt-1 text-2xs leading-relaxed text-slate-400">
              {`按近 7 天的三餐、留言、一起玩、心愿、投喂与动态综合计算，比上周${
                result?.trend === 'up' ? '升温' : result?.trend === 'down' ? '降温' : '基本持平'
              }。`}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
