import { useCallback, useEffect, useMemo, useState } from 'react'
import { game2048SizeOf, listCoupleGameScores, type CoupleGameKey, type CoupleGameScoreRow } from '../lib/db'
import { POLL, useRealtime } from '../lib/realtime'

/**
 * 情侣小游戏成绩榜：三个离线游戏共用。
 * - 2048：按棋盘难度（3×3 / 4×4 …）分组，每个难度只显示今天的最高分一条，按格子大小排序，每天 0 点自动重开
 * - 消消乐：按分数取前 10，信息列显示关卡
 * - 合成大西瓜：按分数取前 10，无信息列
 */

const MEDALS = ['🥇', '🥈', '🥉']

/** 2048 榜单一天最多参与的难度条数上限：拉当天记录够用 */
const DAILY_FETCH_LIMIT = 500

interface Props {
  game: CoupleGameKey
  myId: string
  friendId: string
  /** 成员 id → 昵称 */
  names: Record<string, string>
  /** 外部成绩变化时 +1，用来主动刷新（实时推送之外的兜底） */
  version: number
}

/** 时间列：日期 + 时分（11-11 14:30），紧凑数字格式、两位补零保证等宽对齐 */
function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 消消乐 detail「第 2 关 · 通关」→「2关」，解析不出返回 null */
const animalLevelOf = (detail: string): string | null => {
  const m = /^第\s*(\d+)\s*关/.exec(detail ?? '')
  return m ? `${m[1]}关` : null
}

/** 各游戏的信息列文案：2048 显示棋盘难度，消消乐显示关卡，大西瓜没有信息列 */
const infoOf = (game: CoupleGameKey, detail: string): string | null => {
  if (game === 'star2048') return game2048SizeOf(detail)
  if (game === 'animalmatch') return animalLevelOf(detail)
  return null
}

/** 「4×4」→ 16：用来把 2048 榜按格子大小升序排 */
const sizeCells = (size: string): number => {
  const [a, b] = size.split('×').map((n) => Number.parseInt(n, 10))
  return (a || 0) * (b || 0)
}

export default function GameLeaderboard({ game, myId, friendId, names, version }: Props) {
  const [rows, setRows] = useState<CoupleGameScoreRow[]>([])
  const [loading, setLoading] = useState(true)
  const is2048 = game === 'star2048'

  const reload = useCallback(async () => {
    if (!myId || !friendId) {
      setRows([])
      setLoading(false)
      return
    }
    try {
      if (is2048) {
        // 2048 只看今天：本地 0 点转 UTC 范围查询，东八区不会差一天；每天 0 点榜单自动清空重开
        const dayStart = new Date()
        dayStart.setHours(0, 0, 0, 0)
        setRows(await listCoupleGameScores(myId, friendId, game, DAILY_FETCH_LIMIT, dayStart.toISOString()))
      } else {
        setRows(await listCoupleGameScores(myId, friendId, game, 10))
      }
    } catch (error) {
      console.warn('加载游戏排行榜失败', error)
    } finally {
      setLoading(false)
    }
  }, [myId, friendId, game, is2048])

  useEffect(() => {
    void reload()
  }, [reload, version])

  // 对方也在这局游戏里刷分时，这里能立刻看到名次变化
  useRealtime(
    `game-scores-${game}`,
    [
      {
        table: 'couple_game_scores',
        on: (p) => {
          const row = p.new as CoupleGameScoreRow | undefined
          if (!row || row.game !== game || !myId || !friendId) return
          const [a, b] = myId < friendId ? [myId, friendId] : [friendId, myId]
          if (row.member_a !== a || row.member_b !== b) return
          void reload()
        },
      },
    ],
    { enabled: !!myId && !!friendId, pollMs: POLL.warm, onPoll: () => void reload() }
  )

  /**
   * 展示行：
   * - 2048：服务端已按分数降序，逐条遍历「每个难度只取第一条」= 该难度今日最高分，
   *   再按格子大小升序排列（3×3 → 4×4 → …）；解析不出难度的排最后
   * - 其它游戏：直接用前 10 条
   */
  const displayRows = useMemo<CoupleGameScoreRow[]>(() => {
    if (!is2048) return rows
    const bySize = new Map<string, CoupleGameScoreRow>()
    for (const r of rows) {
      const key = game2048SizeOf(r.detail ?? '') ?? '未知'
      if (!bySize.has(key)) bySize.set(key, r)
    }
    const unknown = bySize.get('未知')
    bySize.delete('未知')
    const known = [...bySize.entries()]
      .sort((a, b) => sizeCells(a[0]) - sizeCells(b[0]))
      .map(([, r]) => r)
    return unknown ? [...known, unknown] : known
  }, [is2048, rows])

  return (
    <div className="space-y-2 rounded-2xl bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-slate-600">
          🏆 情侣排行榜 · {is2048 ? '今日各难度最高分' : '前 10'}
        </h4>
        <span className="text-[10px] text-slate-400">{is2048 ? '每天 0 点重新开始' : '每局结束自动上榜'}</span>
      </div>

      {loading ? (
        <p className="py-2 text-center text-[11px] text-slate-400">加载中…</p>
      ) : displayRows.length === 0 ? (
        <p className="py-2 text-center text-[11px] text-slate-400">还没有成绩，第一个上榜的就是你～</p>
      ) : (
        <ol className="space-y-1">
          {displayRows.map((row, i) => {
            const mine = row.player_id === myId
            const name = mine ? '我' : names[row.player_id] || 'TA'
            const info = infoOf(game, row.detail ?? '')
            return (
              <li
                key={row.id}
                className={`flex items-center gap-1.5 overflow-hidden rounded-lg px-2 py-1.5 text-[11px] ${
                  mine ? 'bg-white shadow-sm' : 'bg-white/60'
                }`}
              >
                {/* 2048 按难度排序，序号用纯数字；按分数排的榜单前三名给奖牌 */}
                <span className="w-5 shrink-0 text-center tabular-nums text-slate-400">
                  {is2048 ? i + 1 : (MEDALS[i] ?? i + 1)}
                </span>
                {/* 名字固定宽度截断：昵称再长也不把行挤成两行 */}
                <span
                  className={`w-14 shrink-0 truncate font-semibold ${mine ? 'text-rose-500' : 'text-slate-600'}`}
                  title={name}
                >
                  {name}
                </span>
                {/* 信息列：紧跟名字（4×4 / 2关），没有就不占位，行内不留多余空隙 */}
                {info && (
                  <span className="shrink-0 rounded bg-slate-100 px-1 py-px text-[10px] tabular-nums text-slate-400">
                    {info}
                  </span>
                )}
                <span className="min-w-0 flex-1" />
                <span className="shrink-0 whitespace-nowrap text-right text-[10px] tabular-nums text-slate-300">
                  {formatWhen(row.created_at)}
                </span>
                <span className="w-11 shrink-0 text-right font-bold tabular-nums text-indigo-600">{row.score}</span>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
