import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  game2048SizeOf,
  listCoupleGame2048Board,
  listCoupleGameScores,
  type CoupleGameKey,
  type CoupleGameScoreRow,
} from '../lib/db'
import { POLL, useRealtime } from '../lib/realtime'

/**
 * 情侣小游戏成绩榜：三个离线游戏共用。
 * - 2048：按棋盘难度分组，每组两段——「共同历史最高分」一条（玩出更高分就顶替，永不清晰）+
 *   「双方今天的前 10 名」（按分数混排），按格子大小排序
 * - 消消乐：按分数取前 10，信息列显示关卡
 * - 合成大西瓜：按分数取前 10，无信息列
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
  const is2048 = game === 'star2048'
  /** 非 2048 游戏：按分数取的前 10 条 */
  const [rows, setRows] = useState<CoupleGameScoreRow[]>([])
  /** 2048：每难度的共同历史最高分一条 */
  const [records, setRecords] = useState<CoupleGameScoreRow[]>([])
  /** 2048：今天的全部成绩（服务端已按分数降序），展示时每难度取前 10 */
  const [todayRows, setTodayRows] = useState<CoupleGameScoreRow[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!myId || !friendId) {
      setRows([])
      setRecords([])
      setTodayRows([])
      setLoading(false)
      return
    }
    try {
      if (is2048) {
        const board = await listCoupleGame2048Board(myId, friendId)
        setRecords(board.records)
        setTodayRows(board.today)
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
   * 2048 按难度分组：组集合 = 有纪录的难度 ∪ 今天玩过的难度，按格子大小升序（3×3 → 8×8），
   * 解析不出难度的排最后；今天数据服务端已按分数降序，组内直接取前 10 即双方当日前 10 名
   */
  const groups = useMemo(() => {
    const recordBySize = new Map<string, CoupleGameScoreRow>()
    for (const r of records) {
      const key = game2048SizeOf(r.detail ?? '') ?? '未知'
      if (!recordBySize.has(key)) recordBySize.set(key, r)
    }
    const todayBySize = new Map<string, CoupleGameScoreRow[]>()
    for (const r of todayRows) {
      const key = game2048SizeOf(r.detail ?? '') ?? '未知'
      const arr = todayBySize.get(key) ?? []
      arr.push(r)
      todayBySize.set(key, arr)
    }
    const sizes = [...new Set([...recordBySize.keys(), ...todayBySize.keys()])].sort(
      (a, b) => (a === '未知' ? 1 : 0) - (b === '未知' ? 1 : 0) || sizeCells(a) - sizeCells(b)
    )
    return sizes.map((size) => ({
      size,
      record: recordBySize.get(size) ?? null,
      today: (todayBySize.get(size) ?? []).slice(0, 10),
    }))
  }, [records, todayRows])

  /** 行内显示的玩家名：自己的记录高亮成「我」 */
  const nameOf = useCallback(
    (row: CoupleGameScoreRow) => (row.player_id === myId ? '我' : names[row.player_id] || 'TA'),
    [myId, names]
  )
  const isMine = useCallback((row: CoupleGameScoreRow) => row.player_id === myId, [myId])

  return (
    <div className="space-y-2 rounded-2xl bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-slate-600">🏆 情侣排行榜</h4>
        <span className="text-[10px] text-slate-400">
          {is2048 ? '共同纪录 + 今日前 10' : '每局结束自动上榜'}
        </span>
      </div>

      {loading ? (
        <p className="py-2 text-center text-[11px] text-slate-400">加载中…</p>
      ) : is2048 ? (
        groups.length === 0 ? (
          <p className="py-2 text-center text-[11px] text-slate-400">还没有成绩，第一个上榜的就是你～</p>
        ) : (
          <div className="space-y-1.5">
            {groups.map((g) => (
              <div key={g.size} className="space-y-1 rounded-lg bg-white/60 px-2 py-1.5">
                {/* 组头：难度徽标 + 共同历史纪录 */}
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="shrink-0 rounded bg-brand-50 px-1 py-px text-[10px] font-semibold text-brand-600 tabular-nums">
                    {g.size}
                  </span>
                  {g.record ? (
                    <span className="min-w-0 flex-1 truncate text-slate-500">
                      纪录 <b className="tabular-nums text-amber-600">{g.record.score}</b>
                      <span className={`ml-1 text-slate-400 ${isMine(g.record) ? 'text-rose-400' : ''}`}>
                        {nameOf(g.record)}        {formatWhen(g.record.created_at)}
                      </span>
                    </span>
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-slate-400">暂无纪录</span>
                  )}
                </div>
                {/* 当天双方成绩前 10：按分数混排 */}
                {g.today.length > 0 && (
                  <ol className="space-y-0.5">
                    {g.today.map((row, i) => (
                      <li
                        key={row.id}
                        className={`flex items-center gap-1.5 rounded px-1 py-0.5 text-[11px] ${
                          isMine(row) ? 'bg-rose-50' : ''
                        }`}
                      >
                        <span className="w-4 shrink-0 text-center tabular-nums text-slate-400">{i + 1}</span>
                        <span
                          className={`w-14 shrink-0 truncate font-semibold ${isMine(row) ? 'text-rose-500' : 'text-slate-600'}`}
                          title={nameOf(row)}
                        >
                          {nameOf(row)}
                        </span>
                        
                        <span className="shrink-0 whitespace-nowrap text-center text-[10px] tabular-nums text-slate-300">
                          {formatWhen(row.created_at)}
                        </span>
                        <span className="min-w-0 flex-1" />
                        <span className="w-11 shrink-0 text-center font-bold tabular-nums text-indigo-600">{row.score}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
          </div>
        )
      ) : rows.length === 0 ? (
        <p className="py-2 text-center text-[11px] text-slate-400">还没有成绩，第一个上榜的就是你～</p>
      ) : (
        <ol className="space-y-1">
          {rows.map((row, i) => (
            <li
              key={row.id}
              className={`flex items-center gap-1.5 overflow-hidden rounded-lg px-2 py-1.5 text-[11px] ${
                isMine(row) ? 'bg-white shadow-sm' : 'bg-white/60'
              }`}
            >
              <span className="w-5 shrink-0 text-center tabular-nums text-slate-400">{MEDALS[i] ?? i + 1}</span>
              <span
                className={`w-14 shrink-0 truncate font-semibold ${isMine(row) ? 'text-rose-500' : 'text-slate-600'}`}
                title={nameOf(row)}
              >
                {nameOf(row)}
              </span>
              {/* 信息列：紧跟名字（2关），没有就不占位，行内不留多余空隙 */}
              {infoOf(game, row.detail ?? '') && (
                <span className="shrink-0 rounded bg-slate-100 px-1 py-px text-[10px] tabular-nums text-slate-400">
                  {infoOf(game, row.detail ?? '')}
                </span>
              )}
              <span className="min-w-0 flex-1" />
              <span className="shrink-0 whitespace-nowrap text-right text-[10px] tabular-nums text-slate-300">
                {formatWhen(row.created_at)}
              </span>
              <span className="w-11 shrink-0 text-right font-bold tabular-nums text-indigo-600">{row.score}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
