import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { addCoupleGameScore } from '../lib/db'
import { setSfxEnabled, sfx, sfxEnabled, subscribeSfx } from '../lib/sfx'
import GameLeaderboard from './GameLeaderboard'

/**
 * 动物世界消消乐：多层堆叠遮挡式三消（羊了个羊式玩法），单机。
 *
 * 规则：
 * - 底部 7 个卡槽；点上方「没被压住」的牌落进卡槽，同种图案自动排在一起
 * - 同种凑满 3 张立即消除、释放槽位（没有 2 消 / 4 消）
 * - 卡槽 7 格全满且无三消 → 失败；场上牌全部消完 → 通关
 * - 只有最上层没被覆盖的牌能点，上层清掉后下层自动解锁
 * - 道具：移出（卡槽末尾 3 张回棋盘）、撤销（回退一步）、洗牌（场上图案重排）、复活（满槽时救一次）
 * - 8 关：层数、牌数、图案种数逐关递增，高关卡道具还会被砍，难度阶梯式上升；
 *   第 5 关就是原来的「地狱」，它上面还有 3 关更难的
 * - 每日重置：牌局用「日期 + 关卡」做种子，同一天布局固定，跨天换新
 */

const SLOT_SIZE = 7
const CLEAR_SCORE = 100

/** 动物 / 植物图案池（关卡按需取前 N 种） */
const SPECIES = [
  '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸',
  '🐵', '🐔', '🐧', '🐦', '🦄', '🐝', '🦋', '🐢', '🐙', '🦀',
  '🐡', '🐬', '🌵', '🌻', '🍄', '🌰', '🌸', '🍁', '🌿', '🪴',
]

/** 坐标单位是「半格」：卡牌宽高都是 2 个单位（1 格），中心距 < 2 就算压住 */
const CARD_UNITS = 2

interface Card {
  id: string
  kind: number
  layer: number
  col: number
  row: number
}

interface LayerDef {
  cols: number[]
  rows: number[]
}

interface LevelDef {
  name: string
  tag: string
  desc: string
  speciesCount: number
  layers: LayerDef[]
  viewCols: number
  viewRows: number
  winBonus: number
  /** 本关道具配置（存档接口 Items 在下面定义，类型提前引用没问题） */
  items: Items
}

type LevelId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

const LEVEL_IDS: LevelId[] = [1, 2, 3, 4, 5, 6, 7, 8]

/**
 * 金字塔层：第 i 层从坐标 i 开始每 2 格一张，到 span-i 结束，
 * 层层中心对称、半格错位——上层牌正好压在下层四张的交叉点上。
 * span = 2 × (层数 - 1)，总位置数 = 1²+2²+…+层数²。
 */
function pyramidLayers(total: number): LayerDef[] {
  const span = 2 * (total - 1)
  const line = (start: number, end: number) => {
    const out: number[] = []
    for (let c = start; c <= end; c += 2) out.push(c)
    return out
  }
  return Array.from({ length: total }, (_, i) => ({ cols: line(i, span - i), rows: line(i, span - i) }))
}

/**
 * 关卡难度表：想加新关就往后填，层数用 pyramidLayers(n) 生成。
 * 总牌数不用凑 3 的倍数，buildLevel 会自动从底层角上拿掉多余的几张。
 * 难度三件套：层数（遮挡）→ 图案种数（凑三概率）→ 道具（高关被砍）。
 */
const LEVELS: Record<LevelId, LevelDef> = {
  1: {
    name: '第 1 关 · 新手',
    tag: '必通关',
    desc: '单层平铺、3 种图案，随便点都能过',
    speciesCount: 3,
    layers: [{ cols: [0, 3, 6], rows: [0, 3, 6] }],
    viewCols: 8,
    viewRows: 8,
    winBonus: 200,
    items: { remove: 1, undo: 1, shuffle: 1, revive: 1 },
  },
  2: {
    name: '第 2 关 · 入门',
    tag: '双层错位',
    desc: '4×4 压着错位的 3×3，24 张 6 种图案，开始要动脑了',
    speciesCount: 6,
    layers: [
      { cols: [0, 2, 4, 6], rows: [0, 2, 4, 6] },
      { cols: [1, 3, 5], rows: [1, 3, 5] },
    ],
    viewCols: 8,
    viewRows: 8,
    winBonus: 500,
    items: { remove: 1, undo: 1, shuffle: 1, revive: 1 },
  },
  3: {
    name: '第 3 关 · 进阶',
    tag: '金字塔',
    desc: '4 层金字塔 30 张、6 种图案，深埋的牌要一层层挖出来',
    speciesCount: 6,
    layers: pyramidLayers(4),
    viewCols: 8,
    viewRows: 8,
    winBonus: 800,
    items: { remove: 1, undo: 1, shuffle: 1, revive: 1 },
  },
  4: {
    name: '第 4 关 · 熟练',
    tag: '无复活',
    desc: '5 层金字塔 54 张、8 种图案，复活用不上了——因为根本没有',
    speciesCount: 8,
    layers: pyramidLayers(5),
    viewCols: 10,
    viewRows: 10,
    winBonus: 1000,
    items: { remove: 1, undo: 1, shuffle: 1, revive: 0 },
  },
  5: {
    name: '第 5 关 · 地狱',
    tag: '经典',
    desc: '6 层金字塔 90 张、10 种图案，原来的「地狱」只是这里的中场',
    speciesCount: 10,
    layers: pyramidLayers(6),
    viewCols: 12,
    viewRows: 12,
    winBonus: 1500,
    items: { remove: 1, undo: 1, shuffle: 1, revive: 0 },
  },
  6: {
    name: '第 6 关 · 噩梦',
    tag: '无洗牌',
    desc: '7 层金字塔 138 张、12 种图案，洗牌没了，走错就得认',
    speciesCount: 12,
    layers: pyramidLayers(7),
    viewCols: 14,
    viewRows: 14,
    winBonus: 2500,
    items: { remove: 1, undo: 1, shuffle: 0, revive: 0 },
  },
  7: {
    name: '第 7 关 · 深渊',
    tag: '无撤销',
    desc: '7 层金字塔 138 张、15 种图案，撤销也没了，只剩一个移出',
    speciesCount: 15,
    layers: pyramidLayers(7),
    viewCols: 14,
    viewRows: 14,
    winBonus: 3500,
    items: { remove: 1, undo: 0, shuffle: 0, revive: 0 },
  },
  8: {
    name: '第 8 关 · 传奇',
    tag: '终极',
    desc: '7 层金字塔 138 张、18 种图案，道具只剩一个移出，敢来吗',
    speciesCount: 18,
    layers: pyramidLayers(7),
    viewCols: 14,
    viewRows: 14,
    winBonus: 5000,
    items: { remove: 1, undo: 0, shuffle: 0, revive: 0 },
  },
}

/* ------------------------------ 随机与每日种子 ------------------------------ */

const hashStr = (s: string): number => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** 固定种子的伪随机：同一天打开同一关，牌局完全一致 */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffleWith<T>(arr: T[], rand: () => number): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** 本地日期 YYYY-MM-DD（不能用 toISOString，那是 UTC，东八区凌晨会差一天） */
const dayKey = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* ------------------------------ 关卡生成 ------------------------------ */

interface BuiltLevel {
  cards: Card[]
  viewCols: number
  viewRows: number
}

function buildLevel(level: LevelId, day: string): BuiltLevel {
  const def = LEVELS[level]
  const rand = mulberry32(hashStr(`${day}-${level}`))
  let positions: Array<{ layer: number; col: number; row: number }> = []
  def.layers.forEach((layerDef, layer) => {
    for (const row of layerDef.rows) {
      for (const col of layerDef.cols) {
        positions.push({ layer, col, row })
      }
    }
  })

  // 总牌数必须是 3 的倍数（每种 3 张一组）：差几张就从最底层角上拿掉几张。
  // 金字塔底层的四个角只被斜向压住，拿掉不影响堆叠关系
  const overflow = positions.length % 3
  if (overflow > 0) {
    const bottom = def.layers[0]
    const corners: Array<{ col: number; row: number }> = [
      { col: bottom.cols[0], row: bottom.rows[0] },
      { col: bottom.cols[bottom.cols.length - 1], row: bottom.rows[0] },
      { col: bottom.cols[0], row: bottom.rows[bottom.rows.length - 1] },
      { col: bottom.cols[bottom.cols.length - 1], row: bottom.rows[bottom.rows.length - 1] },
    ].slice(0, overflow)
    const doomed = new Set(corners.map((c) => `0-${c.col}-${c.row}`))
    positions = positions.filter((p) => !doomed.has(`${p.layer}-${p.col}-${p.row}`))
  }

  // 每 3 张同种为一组，分组轮转取图案保证分布均匀，再整体洗牌
  const groups = Math.floor(positions.length / 3)
  const kinds: number[] = []
  for (let g = 0; g < groups; g++) {
    const k = g % def.speciesCount
    kinds.push(k, k, k)
  }
  const shuffled = shuffleWith(kinds, rand)

  const cards = positions.map((p, i) => ({
    id: `${level}-${p.layer}-${p.col}-${p.row}`,
    kind: shuffled[i] ?? 0,
    layer: p.layer,
    col: p.col,
    row: p.row,
  }))
  return { cards, viewCols: def.viewCols, viewRows: def.viewRows }
}

/** 被上层任何一张牌压住就点不动 */
function isBlocked(card: Card, cards: Card[]): boolean {
  for (const o of cards) {
    if (o.id === card.id || o.layer <= card.layer) continue
    if (Math.abs(o.col - card.col) < CARD_UNITS && Math.abs(o.row - card.row) < CARD_UNITS) return true
  }
  return false
}

/** 同种图案插到一起（原版卡槽里相同图案是相邻的） */
function insertToSlot(slot: Card[], card: Card): Card[] {
  const out = [...slot]
  let at = out.length
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].kind === card.kind) {
      at = i + 1
      break
    }
  }
  out.splice(at, 0, card)
  return out
}

/** 凑满 3 张就消掉（每种一局只消 3 张） */
function resolveSlot(slot: Card[]): { slot: Card[]; cleared: number } {
  const counts = new Map<number, number>()
  for (const c of slot) counts.set(c.kind, (counts.get(c.kind) ?? 0) + 1)
  const need = new Map<number, number>()
  let cleared = 0
  counts.forEach((n, kind) => {
    if (n >= 3) {
      need.set(kind, 3)
      cleared += 1
    }
  })
  if (!cleared) return { slot, cleared: 0 }
  const next: Card[] = []
  for (const c of slot) {
    const left = need.get(c.kind) ?? 0
    if (left > 0) {
      need.set(c.kind, left - 1)
      continue
    }
    next.push(c)
  }
  return { slot: next, cleared }
}

/* ------------------------------ 存档 ------------------------------ */

interface Items {
  remove: number
  undo: number
  shuffle: number
  revive: number
}

interface SaveData {
  day: string
  level: number
  cards: Card[]
  slot: Card[]
  score: number
  items: Items
}

const SAVE_KEY = 'couple-animal-save'
const BEST_KEY = 'couple-animal-best'

/** 本关的道具：由关卡表配置，高关卡会被砍 */
const freshItems = (level: LevelId): Items => ({ ...LEVELS[level].items })

const loadSave = (): SaveData | null => {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as SaveData
    // 跨天作废：每日关卡重置
    if (s?.day !== dayKey()) return null
    if (!LEVELS[s.level as LevelId]) return null
    if (!Array.isArray(s.cards) || !Array.isArray(s.slot)) return null
    return { ...s, items: { ...freshItems(s.level as LevelId), ...s.items } }
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

interface Props {
  myId: string
  friendId: string
  names: Record<string, string>
}

export default function AnimalMatch({ myId, friendId, names }: Props) {
  const [phase, setPhase] = useState<'home' | 'play'>('home')
  const [level, setLevel] = useState<LevelId>(1)
  const [cards, setCards] = useState<Card[]>([])
  const [slot, setSlot] = useState<Card[]>([])
  const [score, setScore] = useState(0)
  const [items, setItems] = useState<Items>(() => freshItems(1))
  const [result, setResult] = useState<null | 'win' | 'lose'>(null)
  const [view, setView] = useState({ cols: 12, rows: 12 })
  const [best, setBest] = useState(loadBest)
  const [sfxOn, setSfxOn] = useState(sfxEnabled)
  const [tip, setTip] = useState('')
  const [lbVersion, setLbVersion] = useState(0)
  const [saveHint, setSaveHint] = useState<SaveData | null>(null)
  /** 撤销快照：只保留最近一步 */
  const undoRef = useRef<{ cards: Card[]; slot: Card[]; score: number } | null>(null)
  /** 这一局的成绩是否已经上报 */
  const reportedRef = useRef(false)
  const today = dayKey()

  useEffect(() => subscribeSfx(() => setSfxOn(sfxEnabled())), [])
  useEffect(() => setSaveHint(loadSave()), [])

  // 进度存档：结果出来就清掉（跨天自动作废），免得首页一直提示「有一局没打完」
  useEffect(() => {
    if (phase !== 'play') return
    try {
      if (result) {
        localStorage.removeItem(SAVE_KEY)
        return
      }
      localStorage.setItem(SAVE_KEY, JSON.stringify({ day: today, level, cards, slot, score, items } satisfies SaveData))
    } catch {
      // 写不进去最多是刷新后重开
    }
  }, [phase, result, today, level, cards, slot, score, items])

  useEffect(() => {
    if (score <= best) return
    setBest(score)
    try {
      localStorage.setItem(BEST_KEY, String(score))
    } catch {
      // ignore
    }
  }, [score, best])

  /** 开局：牌局由「日期 + 关卡」种子决定，同一天同一关布局固定 */
  const startLevel = useCallback((next: LevelId) => {
    const built = buildLevel(next, dayKey())
    setLevel(next)
    setCards(built.cards)
    setView({ cols: built.viewCols, rows: built.viewRows })
    setSlot([])
    setScore(0)
    setItems(freshItems(next))
    setResult(null)
    setTip('')
    undoRef.current = null
    reportedRef.current = false
    setPhase('play')
  }, [])

  /** 回首页：顺手刷新「未打完」提示，否则通关后还挂着旧的那条 */
  const backHome = useCallback(() => {
    setPhase('home')
    setSaveHint(loadSave())
  }, [])

  const resume = useCallback(() => {
    const s = loadSave()
    if (!s) return
    const lv = s.level as LevelId
    setLevel(lv)
    setCards(s.cards)
    setSlot(s.slot)
    setScore(s.score)
    setItems(s.items)
    setResult(null)
    setTip('')
    undoRef.current = null
    reportedRef.current = false
    const built = buildLevel(lv, dayKey())
    setView({ cols: built.viewCols, rows: built.viewRows })
    setPhase('play')
  }, [])

  /** 结算：通关加关卡奖励，失败就按当前分；两种都只上报一次 */
  const settle = useCallback(
    (kind: 'win' | 'lose', finalScore: number) => {
      setResult(kind)
      if (reportedRef.current) return
      reportedRef.current = true
      const detail = `第 ${level} 关 · ${kind === 'win' ? '通关' : '失败'}`
      if (finalScore <= 0 || !myId || !friendId) return
      void addCoupleGameScore({
        userA: myId,
        userB: friendId,
        game: 'animalmatch',
        playerId: myId,
        score: finalScore,
        detail,
      })
        .then(() => setLbVersion((v) => v + 1))
        .catch(() => {
          // 上传失败不影响游戏
        })
    },
    [level, myId, friendId]
  )

  const clickCard = useCallback(
    (card: Card) => {
      if (phase !== 'play' || result) return
      if (slot.length >= SLOT_SIZE) return
      if (isBlocked(card, cards)) {
        setTip('这张被上面的牌压住了，先把上层清掉～')
        return
      }
      undoRef.current = { cards, slot, score }

      const remaining = cards.filter((c) => c.id !== card.id)
      const resolved = resolveSlot(insertToSlot(slot, card))
      const gained = resolved.cleared * CLEAR_SCORE
      const nextScore = score + gained

      setCards(remaining)
      setSlot(resolved.slot)
      setTip('')
      if (gained > 0) {
        setScore(nextScore)
        sfx.match()
      } else {
        sfx.place()
      }

      // 通关：场上牌清空且卡槽也空了
      if (!remaining.length && !resolved.slot.length) {
        const total = nextScore + LEVELS[level].winBonus
        setScore(total)
        sfx.win()
        settle('win', total)
        return
      }
      // 失败：卡槽满了，或者场上没牌了但卡槽还剩着凑不齐的卡
      if (resolved.slot.length >= SLOT_SIZE || (!remaining.length && resolved.slot.length > 0)) {
        sfx.lose()
        settle('lose', nextScore)
      }
    },
    [phase, result, slot, cards, score, level, settle]
  )

  /** 移出：卡槽末尾 3 张回到棋盘顶部（可以重新点） */
  const useRemove = useCallback(() => {
    if (result || items.remove <= 0 || slot.length === 0) return
    const take = slot.slice(-Math.min(3, slot.length))
    const topLayer = cards.reduce((m, c) => Math.max(m, c.layer), 0) + 1
    undoRef.current = { cards, slot, score }
    setSlot(slot.slice(0, slot.length - take.length))
    setCards([...cards, ...take.map((c) => ({ ...c, layer: topLayer }))])
    setItems({ ...items, remove: items.remove - 1 })
    setTip(`${take.length} 张牌已移回棋盘顶部`)
    sfx.hint()
  }, [result, items, slot, cards, score])

  /** 撤销：回退上一步（卡牌、卡槽、分数一起回滚） */
  const useUndo = useCallback(() => {
    if (result || items.undo <= 0 || !undoRef.current) return
    const snap = undoRef.current
    undoRef.current = null
    setCards(snap.cards)
    setSlot(snap.slot)
    setScore(snap.score)
    setItems({ ...items, undo: 0 })
    setTip('已撤回上一步')
    sfx.hint()
  }, [result, items])

  /** 洗牌：位置与层级不动，场上图案重新分配 */
  const useShuffle = useCallback(() => {
    if (result || items.shuffle <= 0 || !cards.length) return
    undoRef.current = { cards, slot, score }
    const rand = Math.random
    const kinds = shuffleWith(cards.map((c) => c.kind), rand)
    setCards(cards.map((c, i) => ({ ...c, kind: kinds[i] })))
    setItems({ ...items, shuffle: 0 })
    setTip('全场牌面已重新打乱')
    sfx.hint()
  }, [result, items, cards, slot, score])

  /** 复活：满槽时把末尾 3 张移回棋盘，继续这一局 */
  const useRevive = useCallback(() => {
    if (result !== 'lose' || items.revive <= 0) return
    const take = slot.slice(-Math.min(3, slot.length))
    const topLayer = cards.reduce((m, c) => Math.max(m, c.layer), 0) + 1
    setSlot(slot.slice(0, slot.length - take.length))
    setCards([...cards, ...take.map((c) => ({ ...c, layer: topLayer }))])
    setItems({ ...items, revive: 0 })
    setResult(null)
    // 复活等于把这一局救回来，最终成绩要重新上报一次（排行榜取最高）
    reportedRef.current = false
    setTip('复活成功！3 张牌已回到棋盘')
    sfx.hint()
  }, [result, items, slot, cards])

  const blockedIds = useMemo(() => {
    const set = new Set<string>()
    for (const c of cards) if (isBlocked(c, cards)) set.add(c.id)
    return set
  }, [cards])

  const cardW = `${(CARD_UNITS / view.cols) * 100}%`
  const cardH = `${(CARD_UNITS / view.rows) * 100}%`

  const itemButton = (label: string, icon: string, left: number, onClick: () => void, disabled: boolean) => (
    <button
      type="button"
      className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] transition-all ${
        disabled ? 'bg-slate-100 text-slate-300' : 'bg-white text-slate-600 shadow-sm active:scale-95'
      }`}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="text-base leading-none">{icon}</span>
      <span>
        {label}
        {left > 0 ? ` ×${left}` : ''}
      </span>
    </button>
  )

  /* ------------------------------ 首页：选关卡 ------------------------------ */
  if (phase === 'home') {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl bg-gradient-to-br from-emerald-50 via-lime-50 to-amber-50 p-4 text-center">
          <div className="text-3xl">🌿</div>
          <h3 className="mt-1 text-sm font-bold text-emerald-700">动物世界消消乐</h3>
          {/* <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            点没被压住的牌收进卡槽，同种凑三张就消掉。卡槽只有 7 格，塞满就结束。
          </p> */}
          <p className="mt-1.5 text-[10px] text-emerald-500">今日牌局 {today} · 每天 0 点换新</p>
        </div>

        {saveHint && (
          <button
            type="button"
            className="w-full rounded-xl bg-amber-50 p-2.5 text-left text-[11px] text-amber-700 ring-1 ring-amber-200"
            onClick={resume}
          >
            ⏯️ 有一局没打完（第 {saveHint.level} 关 · {saveHint.score} 分），点这里继续
          </button>
        )}

        {/* 关卡按难度分四档配色：绿（新手）→ 黄（熟练）→ 橙（硬核）→ 红（终极） */}
        {LEVEL_IDS.map((lv) => {
          const def = LEVELS[lv]
          const chip =
            lv <= 3
              ? 'bg-emerald-50 text-emerald-600'
              : lv <= 5
                ? 'bg-amber-50 text-amber-600'
                : lv <= 7
                  ? 'bg-orange-50 text-orange-600'
                  : 'bg-rose-50 text-rose-600'
          return (
            <button
              key={lv}
              type="button"
              className="w-full rounded-xl bg-white p-3 text-left shadow-sm ring-1 ring-slate-100 transition-transform active:scale-[0.99]"
              onClick={() => startLevel(lv)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-700">{def.name}</span>
                <span className={`chip shrink-0 border-0 ${chip}`}>{def.tag}</span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{def.desc}</p>
            </button>
          )
        })}

        <p className="text-center text-[11px] text-slate-400">
          我的最高分 <span className="font-bold tabular-nums text-amber-500">{best}</span>
        </p>

        <GameLeaderboard game="animalmatch" myId={myId} friendId={friendId} names={names} version={lbVersion} />
      </div>
    )
  }

  /* ------------------------------ 对局中 ------------------------------ */
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="chip border-0 bg-emerald-50 text-emerald-600">{LEVELS[level].name}</span>
        <span className="text-[11px] text-slate-400">剩 {cards.length} 张</span>
        <span className="ml-auto text-sm font-bold tabular-nums text-indigo-600">{score}</span>
        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setSfxEnabled(!sfxOn)}>
          {sfxOn ? '🔔' : '🔕'}
        </button>
        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={backHome}>
          返回
        </button>
      </div>

      {/* 牌堆：多层交叉堆叠，按百分比定位保证自适应 */}
      <div className="relative rounded-2xl bg-gradient-to-b from-emerald-100 to-lime-50 p-1.5">
        <div className="relative w-full" style={{ aspectRatio: `${view.cols} / ${view.rows}` }}>
          {cards.map((c) => {
            const blocked = blockedIds.has(c.id)
            return (
              <button
                key={c.id}
                type="button"
                className={`absolute flex items-center justify-center rounded-lg border bg-white shadow-sm transition-all duration-200 ${
                  blocked
                    ? 'cursor-not-allowed border-slate-200 brightness-90'
                    : 'border-emerald-100 hover:-translate-y-0.5 active:scale-95'
                }`}
                style={{
                  width: cardW,
                  height: cardH,
                  left: `${(c.col / view.cols) * 100}%`,
                  top: `${(c.row / view.rows) * 100}%`,
                  zIndex: c.layer + 1,
                }}
                onClick={() => clickCard(c)}
              >
                <span className={`text-[min(1.6rem,5.2vw)] leading-none ${blocked ? 'opacity-60' : ''}`}>
                  {SPECIES[c.kind]}
                </span>
                {blocked && <span className="absolute inset-0 rounded-lg bg-slate-900/10" />}
              </button>
            )
          })}
        </div>

        {(result || tip) && (
          <p className="mt-1 text-center text-[11px] text-emerald-700/80">{result ? '' : tip}</p>
        )}
      </div>

      {/* 卡槽：固定 7 格 */}
      <div className="flex items-center gap-1.5 rounded-xl bg-white p-1.5 shadow-sm">
        {Array.from({ length: SLOT_SIZE }).map((_, i) => {
          const card = slot[i]
          return (
            <div
              key={i}
              className={`flex aspect-square flex-1 items-center justify-center rounded-lg text-lg ${
                card ? 'bg-amber-50 ring-1 ring-amber-200' : 'border border-dashed border-slate-200 bg-slate-50/60'
              }`}
            >
              {card && <span className="animate-pop-in leading-none">{SPECIES[card.kind]}</span>}
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-between px-1 text-[10px] text-slate-400">
        <span>卡槽 {slot.length}/{SLOT_SIZE}</span>
        <span>{LEVELS[level].desc}</span>
      </div>

      {/* 道具 */}
      <div className="flex gap-1.5">
        {itemButton('移出', '🧺', items.remove, useRemove, !!result || items.remove <= 0 || slot.length === 0)}
        {itemButton('撤销', '↩️', items.undo, useUndo, !!result || items.undo <= 0 || !undoRef.current)}
        {itemButton('洗牌', '🔀', items.shuffle, useShuffle, !!result || items.shuffle <= 0 || cards.length === 0)}
      </div>

      {/* 结算 */}
      {result && (
        <div className="animate-fade space-y-2 rounded-2xl bg-white p-3 text-center shadow-sm ring-1 ring-slate-100">
          <div className="text-3xl">{result === 'win' ? '🏆' : '🧺'}</div>
          <p className="text-sm font-bold text-slate-700">
            {result === 'win' ? `第 ${level} 关通关！` : '卡槽塞满了，本局结束'}
          </p>
          <p className="text-[11px] text-slate-400">
            得分 {score}
            {result === 'win' ? `（含通关奖励 ${LEVELS[level].winBonus}）` : ''} · 成绩已记入情侣排行榜
          </p>
          <div className="flex justify-center gap-2">
            {result === 'lose' && items.revive > 0 && (
              <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={useRevive}>
                💗 复活继续（每局 1 次）
              </button>
            )}
            <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => startLevel(level)}>
              重玩本关
            </button>
            <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={backHome}>
              回首页
            </button>
          </div>
        </div>
      )}

      <GameLeaderboard game="animalmatch" myId={myId} friendId={friendId} names={names} version={lbVersion} />
    </div>
  )
}
