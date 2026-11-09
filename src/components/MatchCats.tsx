import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { setSfxEnabled, sfx, sfxEnabled, subscribeSfx } from '../lib/sfx'

/**
 * 合成猫猫：羊了个羊式手牌 + 三连棋式合成，纯单机。
 * - 点手牌选中，再点棋盘空格放下；三只相同猫猫横 / 竖 / 斜连成一线就合成消失
 * - 分数 / 最高分 / 合成次数；合成过的猫收进「猫猫图鉴」
 * - 刷新手牌（旧手牌放回牌堆重抽）、提示一步（找一步能成三连的落点）
 * - 牌全部用完 = 通关；棋盘放满 = 结束
 * - 牌堆每局 42 张、每种猫保底 3 张（否则那种猫永远合不成）；进度存 localStorage
 */

const SIZE = 6
const HAND_MAX = 5
const DECK_TOTAL = 42
const BEST_KEY = 'couple-cats-best'
const DEX_KEY = 'couple-cats-dex'
const SAVE_KEY = 'couple-cats-save'

interface CatDef {
  emoji: string
  name: string
}

const CATS: CatDef[] = [
  { emoji: '🐱', name: '团团' },
  { emoji: '😺', name: '欢欢' },
  { emoji: '😸', name: '眯眯' },
  { emoji: '😹', name: '无奈' },
  { emoji: '😻', name: '心动' },
  { emoji: '😼', name: '傲娇' },
  { emoji: '😽', name: '香香' },
  { emoji: '🙀', name: '吓吓' },
  { emoji: '😿', name: '委屈' },
  { emoji: '😾', name: '气鼓' },
]

/** 合成线基础分，每多连一只 +50；一步同时触发多条线时第二条起翻倍 */
const LINE_SCORE = 100
const EXTRA_PER_CAT = 50
const WIN_BONUS = 500

type Board = Array<number | null>

/** 一局的可存档状态：棋盘 / 手牌 / 牌堆 / 分数 / 合成次数（图鉴跨局单独存） */
interface GameState {
  board: Board
  hand: number[]
  deck: number[]
  score: number
  matches: number
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** 每种猫保底 3 张，剩下的随机补齐后洗牌 */
function buildDeck(): number[] {
  const deck: number[] = []
  for (let k = 0; k < CATS.length; k++) for (let i = 0; i < 3; i++) deck.push(k)
  while (deck.length < DECK_TOTAL) deck.push(Math.floor(Math.random() * CATS.length))
  return shuffle(deck)
}

function drawHand(deck: number[]): { deck: number[]; hand: number[] } {
  const rest = [...deck]
  const hand: number[] = []
  while (hand.length < HAND_MAX && rest.length) hand.push(rest.shift() as number)
  return { deck: rest, hand }
}

function newGameState(): GameState {
  const { deck, hand } = drawHand(buildDeck())
  return { board: Array.from({ length: SIZE * SIZE }, () => null), hand, deck, score: 0, matches: 0 }
}

/** 四个方向：横、竖、两条斜线 */
const DIRS: Array<[number, number]> = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
]

/** 假设在 idx 放下 kind，收集四个方向上连成一线（≥3）的格子，按线分组 */
function findMatches(board: Board, idx: number, kind: number): Array<number[]> {
  const row = Math.floor(idx / SIZE)
  const col = idx % SIZE
  const lines: Array<number[]> = []
  for (const [dr, dc] of DIRS) {
    const seg = [idx]
    let r = row + dr
    let c = col + dc
    while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r * SIZE + c] === kind) {
      seg.push(r * SIZE + c)
      r += dr
      c += dc
    }
    r = row - dr
    c = col - dc
    while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r * SIZE + c] === kind) {
      seg.unshift(r * SIZE + c)
      r -= dr
      c -= dc
    }
    if (seg.length >= 3) lines.push(seg)
  }
  return lines
}

const emptyCells = (board: Board): number[] => {
  const out: number[] = []
  for (let i = 0; i < board.length; i++) if (board[i] === null) out.push(i)
  return out
}

/** 找一步能直接成三连的落点；找不到返回 null */
function findHint(board: Board, hand: number[]): { handIdx: number; cellIdx: number } | null {
  for (let hi = 0; hi < hand.length; hi++) {
    for (const cell of emptyCells(board)) {
      const probe = [...board]
      probe[cell] = hand[hi]
      if (findMatches(probe, cell, hand[hi]).length) return { handIdx: hi, cellIdx: cell }
    }
  }
  return null
}

const loadSaved = (): GameState | null => {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as GameState
    if (!Array.isArray(s.board) || s.board.length !== SIZE * SIZE || !Array.isArray(s.hand) || !Array.isArray(s.deck)) return null
    return s
  } catch {
    return null
  }
}

const loadBest = (): number => {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0
  } catch {
    return 0
  }
}

const loadDex = (): number[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(DEX_KEY) ?? '[]') as number[]
    return Array.isArray(raw) && raw.length === CATS.length ? raw : CATS.map(() => 0)
  } catch {
    return CATS.map(() => 0)
  }
}

export default function MatchCats() {
  const [game, setGame] = useState<GameState>(() => loadSaved() ?? newGameState())
  const { board, hand, deck, score, matches } = game
  const [dex, setDex] = useState<number[]>(loadDex)
  const [best, setBest] = useState(loadBest)
  const [over, setOver] = useState<null | 'win' | 'full'>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [hint, setHint] = useState<{ handIdx: number; cellIdx: number } | null>(null)
  const [hintMsg, setHintMsg] = useState('')
  const [showDex, setShowDex] = useState(false)
  const [sfxOn, setSfxOn] = useState(sfxEnabled)
  const [floats, setFloats] = useState<Array<{ id: number; text: string }>>([])
  const [confirmReset, setConfirmReset] = useState(false)
  const floatSeed = useRef(1)

  useEffect(() => subscribeSfx(() => setSfxOn(sfxEnabled())), [])

  // 进度与最高分落 localStorage
  useEffect(() => {
    if (over) return
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(game satisfies GameState))
    } catch {
      // ignore
    }
  }, [game, over])
  useEffect(() => {
    if (score <= best) return
    setBest(score)
    try {
      localStorage.setItem(BEST_KEY, String(score))
    } catch {
      // ignore
    }
  }, [score, best])

  const pushFloat = useCallback((text: string) => {
    const id = floatSeed.current++
    setFloats((prev) => [...prev, { id, text }])
    window.setTimeout(() => setFloats((prev) => prev.filter((f) => f.id !== id)), 900)
  }, [])

  const reset = useCallback(() => {
    setGame(newGameState())
    setOver(null)
    setSelected(null)
    setHint(null)
    setHintMsg('')
    setConfirmReset(false)
  }, [])

  /** 刷新手牌：旧手牌放回牌堆尾，重新抽 5 张（不限次） */
  const refreshHand = useCallback(() => {
    if (over) return
    const next = drawHand([...deck, ...hand])
    setGame((prev) => ({ ...prev, deck: next.deck, hand: next.hand }))
    setSelected(null)
    setHint(null)
    setHintMsg('')
    sfx.hint()
  }, [deck, hand, over])

  const showHint = useCallback(() => {
    if (over) return
    const found = findHint(board, hand)
    if (found) {
      setHint(found)
      setSelected(found.handIdx)
      setHintMsg('')
      sfx.hint()
    } else {
      setHint(null)
      setHintMsg('暂时没有一步成型的组合，先放一只凑凑位置吧～')
    }
  }, [board, hand, over])

  const place = useCallback(
    (handIdx: number, cellIdx: number) => {
      if (over || hand[handIdx] === undefined || board[cellIdx] !== null) return
      const kind = hand[handIdx]
      let next = [...board]
      next[cellIdx] = kind
      const restHand = hand.filter((_, i) => i !== handIdx)
      const restDeck = [...deck]

      const lines = findMatches(next, cellIdx, kind)
      let gained = 0
      const removed = new Set<number>()
      const gainedDex = [...dex]
      lines.forEach((seg, i) => {
        seg.forEach((ix) => removed.add(ix))
        gained += (LINE_SCORE + (seg.length - 3) * EXTRA_PER_CAT) * (i === 0 ? 1 : 2)
      })
      if (removed.size) {
        removed.forEach((ix) => {
          const k = next[ix]
          if (k !== null) gainedDex[k] += 1
        })
        next = next.map((v, ix) => (removed.has(ix) ? null : v))
        setDex(gainedDex)
        try {
          localStorage.setItem(DEX_KEY, JSON.stringify(gainedDex))
        } catch {
          // ignore
        }
      }

      // 放下的从手牌移走，再从牌堆补足
      while (restHand.length < HAND_MAX && restDeck.length) restHand.push(restDeck.shift() as number)

      const nextScore = score + gained
      const nextMatches = matches + lines.length
      setGame({ board: next, hand: restHand, deck: restDeck, score: nextScore, matches: nextMatches })
      setSelected(null)
      setHint(null)
      setHintMsg('')

      if (removed.size) {
        sfx.match()
        pushFloat(`+${gained}`)
      } else {
        sfx.place()
      }

      // 结束判定：牌全用完 = 通关；棋盘放满 = 结束
      if (!restHand.length && !restDeck.length) {
        setGame({ board: next, hand: restHand, deck: restDeck, score: nextScore + WIN_BONUS, matches: nextMatches })
        setOver('win')
        sfx.win()
        pushFloat(`通关 +${WIN_BONUS}`)
      } else if (!emptyCells(next).length) {
        setOver('full')
        sfx.lose()
      }
    },
    [board, hand, deck, score, matches, dex, over, pushFloat]
  )

  const onCell = (idx: number) => {
    if (selected !== null) {
      place(selected, idx)
      return
    }
    if (board[idx] !== null) setHintMsg('棋盘上的猫挪不动，从手牌里选一只放到空格上吧～')
  }

  const remaining = hand.length + deck.length
  const onBoard = SIZE * SIZE - emptyCells(board).length

  const hintStyle = (idx: number): CSSProperties | undefined => {
    if (!hint || hint.cellIdx !== idx) return undefined
    return { boxShadow: '0 0 0 3px rgb(244 114 182 / 0.7)' }
  }

  return (
    <div className="space-y-3">
      {showDex ? (
        /* ------------------------------ 猫猫图鉴 ------------------------------ */
        <div className="space-y-3 rounded-2xl bg-gradient-to-b from-rose-50 to-orange-50 p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-600">📔 猫猫图鉴</h4>
            <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => setShowDex(false)}>
              返回游戏
            </button>
          </div>
          <p className="text-[11px] text-slate-400">在棋盘上合成过的小猫会亮起来，数字是一共合成过多少只。</p>
          <div className="grid grid-cols-5 gap-2">
            {CATS.map((cat, k) => {
              const seen = (dex[k] ?? 0) > 0
              return (
                <div
                  key={cat.emoji}
                  className={`flex flex-col items-center gap-0.5 rounded-xl p-2 text-center ${
                    seen ? 'bg-white shadow-sm' : 'bg-white/40'
                  }`}
                >
                  <span className={`text-2xl ${seen ? '' : 'opacity-25 grayscale'}`}>{cat.emoji}</span>
                  <span className={`text-[10px] ${seen ? 'font-semibold text-slate-600' : 'text-slate-300'}`}>
                    {seen ? cat.name : '？？？'}
                  </span>
                  <span className={`text-[10px] tabular-nums ${seen ? 'text-rose-400' : 'text-slate-200'}`}>
                    ×{dex[k] ?? 0}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="text-center text-[11px] text-slate-400">
            已收录 {dex.filter((n) => n > 0).length} / {CATS.length} 种
          </p>
        </div>
      ) : (
        <>
          {/* 顶栏：分数 / 最高分 / 合成次数 / 剩余牌 */}
          <div className="grid grid-cols-4 gap-1.5 text-center">
            <div className="rounded-xl bg-rose-50 px-1 py-1.5">
              <div className="text-[10px] text-rose-400">分数</div>
              <div className="text-sm font-bold tabular-nums text-rose-600">{score}</div>
            </div>
            <div className="rounded-xl bg-amber-50 px-1 py-1.5">
              <div className="text-[10px] text-amber-400">最高分</div>
              <div className="text-sm font-bold tabular-nums text-amber-600">{best}</div>
            </div>
            <div className="rounded-xl bg-pink-50 px-1 py-1.5">
              <div className="text-[10px] text-pink-400">合成</div>
              <div className="text-sm font-bold tabular-nums text-pink-600">{matches}</div>
            </div>
            <div className="rounded-xl bg-slate-100 px-1 py-1.5">
              <div className="text-[10px] text-slate-400">剩牌</div>
              <div className="text-sm font-bold tabular-nums text-slate-600">{remaining}</div>
            </div>
          </div>

          {/* 工具行 */}
          <div className="flex gap-2">
            <button type="button" className="btn-ghost flex-1 py-1.5 text-xs" disabled={!!over} onClick={refreshHand}>
              🔄 刷新手牌
            </button>
            <button type="button" className="btn-ghost flex-1 py-1.5 text-xs" disabled={!!over} onClick={showHint}>
              💡 提示一步
            </button>
            <button type="button" className="btn-ghost flex-1 py-1.5 text-xs" onClick={() => setShowDex(true)}>
              📔 猫猫图鉴
            </button>
            <button
              type="button"
              className="btn-ghost shrink-0 px-3 py-1.5 text-xs"
              onClick={() => setSfxEnabled(!sfxOn)}
              title="音效开关"
            >
              {sfxOn ? '🔔' : '🔕'}
            </button>
          </div>

          {/* 棋盘 */}
          <div className="relative rounded-2xl bg-gradient-to-b from-rose-100 to-orange-50 p-2">
            <div className="grid grid-cols-6 gap-1.5">
              {board.map((kind, idx) => (
                <button
                  key={idx}
                  type="button"
                  style={hintStyle(idx)}
                  className={`flex aspect-square items-center justify-center rounded-lg text-xl transition-all ${
                    kind !== null ? 'bg-white shadow-sm' : 'border border-dashed border-rose-200/80 bg-white/30'
                  } ${selected !== null && kind === null ? 'active:scale-95' : ''}`}
                  onClick={() => onCell(idx)}
                >
                  {kind !== null && <span className="animate-pop-in">{CATS[kind].emoji}</span>}
                </button>
              ))}
            </div>
            {/* 飘分 */}
            <div className="pointer-events-none absolute inset-x-0 top-1 flex flex-col items-center">
              {floats.map((f) => (
                <span key={f.id} className="animate-fade text-sm font-bold text-rose-500 drop-shadow">
                  {f.text}
                </span>
              ))}
            </div>
            {/* 结束遮罩 */}
            {over && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl bg-white/85 backdrop-blur-sm">
                <div className="text-4xl">{over === 'win' ? '🏆' : '🧶'}</div>
                <p className="font-bold text-rose-600">{over === 'win' ? '牌全部用完，通关！' : '棋盘放满了，本局结束'}</p>
                <p className="text-xs text-slate-500">
                  {over === 'win' ? `最终得分 ${score}（含通关奖励 ${WIN_BONUS}）` : `最终得分 ${score} · 合成 ${matches} 次`}
                </p>
                <button type="button" className="btn-primary px-4 py-1.5 text-xs" onClick={reset}>
                  再来一局
                </button>
              </div>
            )}
          </div>

          {/* 手牌槽 */}
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: HAND_MAX }).map((_, i) => {
              const kind = hand[i]
              const isSelected = selected === i
              return (
                <button
                  key={i}
                  type="button"
                  disabled={kind === undefined}
                  className={`flex h-14 items-center justify-center rounded-xl text-3xl transition-all ${
                    kind === undefined
                      ? 'bg-slate-100/60'
                      : isSelected
                        ? '-translate-y-1 scale-110 bg-rose-100 shadow-md ring-2 ring-rose-400'
                        : 'bg-white shadow-sm active:scale-95'
                  } ${hint?.handIdx === i ? 'ring-2 ring-amber-400' : ''}`}
                  onClick={() => {
                    if (kind === undefined) return
                    setSelected(isSelected ? null : i)
                    setHint(null)
                    setHintMsg('')
                  }}
                >
                  {kind !== undefined && <span>{CATS[kind].emoji}</span>}
                </button>
              )
            })}
          </div>

          <p className="text-center text-[11px] leading-relaxed text-slate-400">
            {hintMsg || '先点下面手牌选中一只猫，再点棋盘空格放下；三只相同猫猫横、竖、斜连成一线就会合成消失～'}
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              className="btn-ghost flex-1 py-1.5 text-xs"
              onClick={() => {
                if (confirmReset) {
                  reset()
                } else {
                  setConfirmReset(true)
                  window.setTimeout(() => setConfirmReset(false), 3000)
                }
              }}
            >
              {confirmReset ? '再点一次确认重开' : '🔄 重开一局'}
            </button>
            <p className="flex-1 self-center text-right text-[11px] text-slate-300">
              棋盘上还有 {onBoard} 只猫 · 牌堆剩 {deck.length} 张
            </p>
          </div>
        </>
      )}
    </div>
  )
}
