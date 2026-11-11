import { useCallback, useEffect, useState } from 'react'
import { listCoupleGameScores, type CoupleGameKey, type CoupleGameScoreRow } from '../lib/db'
import { POLL, useRealtime } from '../lib/realtime'

/**
 * 情侣小游戏成绩榜：两个离线游戏共用。
 * 游戏本身是单机玩法，成绩每局结束落一行 couple_game_scores，双方按分数取前 10 共享展示。
 */

const MEDALS = ['🥇', '🥈', '🥉']

interface Props {
  game: CoupleGameKey
  myId: string
  friendId: string
  /** 成员 id → 昵称 */
  names: Record<string, string>
  /** 外部成绩变化时 +1，用来主动刷新（实时推送之外的兜底） */
  version: number
}

/** 月日 + 具体时间，精确到秒；两位补零保证等宽对齐 */
function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export default function GameLeaderboard({ game, myId, friendId, names, version }: Props) {
  const [rows, setRows] = useState<CoupleGameScoreRow[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!myId || !friendId) {
      setRows([])
      setLoading(false)
      return
    }
    try {
      setRows(await listCoupleGameScores(myId, friendId, game, 10))
    } catch (error) {
      console.warn('加载游戏排行榜失败', error)
    } finally {
      setLoading(false)
    }
  }, [myId, friendId, game])

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

  return (
    <div className="space-y-2 rounded-2xl bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-slate-600">🏆 情侣排行榜 · 前 10</h4>
        <span className="text-[10px] text-slate-400">每局结束自动上榜</span>
      </div>

      {loading ? (
        <p className="py-2 text-center text-[11px] text-slate-400">加载中…</p>
      ) : rows.length === 0 ? (
        <p className="py-2 text-center text-[11px] text-slate-400">还没有成绩，第一个上榜的就是你～</p>
      ) : (
        <ol className="space-y-1">
          {rows.map((row, i) => {
            const mine = row.player_id === myId
            const name = mine ? '我' : names[row.player_id] || 'TA'
            return (
              <li
                key={row.id}
                className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] ${
                  mine ? 'bg-white shadow-sm' : 'bg-white/60'
                }`}
              >
                <span className="w-5 shrink-0 text-center tabular-nums text-slate-400">
                  {MEDALS[i] ?? i + 1}
                </span>
                {/* 名字固定宽度截断：昵称再长也不把行挤成两行 */}
                <span
                  className={`w-14 shrink-0 truncate font-semibold ${mine ? 'text-rose-500' : 'text-slate-600'}`}
                  title={name}
                >
                  {name}
                </span>
                <span className="min-w-0 flex-1 truncate text-slate-400">{row.detail}</span>
                {/* 时间列固定宽、不换行，秒级时间戳也能和别的行对齐 */}
                <span className="w-[104px] shrink-0 whitespace-nowrap text-right tabular-nums text-slate-300">
                  {formatWhen(row.created_at)}
                </span>
                <span className="w-12 shrink-0 text-right font-bold tabular-nums text-indigo-600">{row.score}</span>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
