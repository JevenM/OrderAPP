/**
 * ============================================================================
 *  情侣刮刮乐 · 主题 & 奖池配置
 * ============================================================================
 *
 * 【换票面背景图】
 *   1. 准备一张竖版图（建议 1024 × 1536，中间留一块干净的空白区域放刮奖区）
 *   2. 丢进 public/scratch-themes/ 目录，例如 public/scratch-themes/xixiangfeng.jpg
 *   3. 把路径填到下面主题的 image 字段：image: '/scratch-themes/xixiangfeng.jpg'
 *   留空不要紧，会自动用 fallback 渐变 + 内置纹样兜底，画面一样完整。
 *
 * 【改中奖概率】
 *   改 SCRATCH_ODDS。三个数字加起来必须等于 1（代码里没有做归一化，写错了概率会偏）。
 *
 * 【改奖品文案】
 *   改 SCRATCH_POOL 对应档位的数组，想加多少条都行，抽奖时等概率随机。
 *
 * 【换生肖】
 *   改 SCRATCH_ZODIAC 即可（'龙' / '蛇' / '马' …），票面文字会跟着变。
 *
 * 说明：全部是情侣之间可兑现的虚拟奖励，不涉及任何真实金钱；
 *      没有充值、支付、提现入口，纯休闲娱乐。
 */

export type ScratchThemeId = 'xixiangfeng' | 'haoyunshibei' | 'dianshichengjin' | 'shengxiao'

export interface ScratchTheme {
  id: ScratchThemeId
  /** 票面主标题 */
  name: string
  /** 主题代号，用来生成彩票编号 */
  code: string
  /** 票头小印章里的字 */
  seal: string
  /** 票面副标题 */
  slogan: string
  /** 背景图 URL；留空走 CSS 兜底 */
  image: string
  /** 兜底背景（没有图时用） */
  fallback: string
  /** 票面主文字色 */
  ink: string
  /** 票面次要文字色 */
  inkSoft: string
  /** 主色：编号、边线、强调 */
  accent: string
  /** 刮奖区底色 */
  panel: string
  /** 刮奖区文字色（深色票面如点石成金要用浅字） */
  panelInk: string
  /** 无图时的暗纹配色 */
  motif: string
  /** 票面装饰符号 */
  decor: string
  /** 票头印章的文字色（印章底色用 accent） */
  sealInk: string
}

/* ------------------------------ 主题配置区 ------------------------------ */

export const SCRATCH_THEMES: ScratchTheme[] = [
  {
    id: 'xixiangfeng',
    name: '喜相逢',
    code: 'XXF',
    seal: '喜',
    slogan: '喜鹊登枝 · 好事成双',
    // 路径必须拼在 BASE_URL 后面：部署在 GitHub Pages 子路径（--base=/仓库/）时，
    // 写死的 /scratch-themes/... 会 404，这里跟着 base 走在本地和部署环境都成立
    image: `${import.meta.env.BASE_URL}scratch-themes/xixiangfeng.jpg`,
    fallback: 'linear-gradient(158deg,#a91b2a 0%,#d93636 34%,#f0746a 58%,#c0222f 100%)',
    ink: '#fff6e8',
    inkSoft: 'rgba(255,246,232,0.72)',
    accent: '#ffd98a',
    panel: '#fff8ec',
    panelInk: '#9a2230',
    motif: 'rgba(255,217,138,0.16)',
    decor: '🏮',
    sealInk: '#7a1420',
  },
  {
    id: 'haoyunshibei',
    name: '好运十倍',
    code: 'HYX',
    seal: '运',
    slogan: '金光满堂 · 好运翻倍',
    image: `${import.meta.env.BASE_URL}scratch-themes/haoyunshibei.jpg`,
    fallback: 'linear-gradient(158deg,#f7c948 0%,#eda01f 42%,#f8d777 66%,#cf8410 100%)',
    ink: '#5a2c00',
    inkSoft: 'rgba(90,44,0,0.62)',
    accent: '#8a4a00',
    panel: '#fffaf0',
    panelInk: '#8a4a00',
    motif: 'rgba(255,255,255,0.34)',
    decor: '🪙',
    sealInk: '#fff7e6',
  },
  {
    id: 'dianshichengjin',
    name: '点石成金',
    code: 'DSJ',
    seal: '金',
    slogan: '黑金鎏光 · 点石成金',
    image: `${import.meta.env.BASE_URL}scratch-themes/dianshichengjin.jpg`,
    fallback: 'linear-gradient(158deg,#0e0d10 0%,#221b11 40%,#4b3618 70%,#0b0a0c 100%)',
    ink: '#c39f11',
    inkSoft: 'rgba(174, 168, 156, 0.62)',
    accent: '#f0c466',
    panel: '#1b1712',
    panelInk: '#3ae24a',
    motif: 'rgba(240,196,102,0.18)',
    decor: '✨',
    sealInk: '#2a1c05',
  },
  {
    id: 'shengxiao',
    name: '生肖系列',
    code: 'SXL',
    seal: '肖',
    slogan: '祥云纳福 · 岁岁平安',
    image: `${import.meta.env.BASE_URL}scratch-themes/shengxiao.jpg`,
    fallback: 'linear-gradient(158deg,#8f1616 0%,#cf302c 40%,#efa13c 76%,#951d1d 100%)',
    ink: '#fff5e8',
    inkSoft: 'rgba(255,245,232,0.7)',
    accent: '#ffe0a3',
    panel: '#fff7ea',
    panelInk: '#a01f1f',
    motif: 'rgba(255,224,163,0.18)',
    decor: '🐉',
    sealInk: '#7a1414',
  },
]

/** 生肖系列当前生肖：换成 '蛇' / '马' / '羊' … 票面文字跟着变（图也可以换） */
export const SCRATCH_ZODIAC = '龙'

/** 生肖票面展示的生肖图案：换生肖时同步改这里 */
export const SCRATCH_ZODIAC_EMOJI: Record<string, string> = {
  鼠: '🐭', 牛: '🐮', 虎: '🐯', 兔: '🐰', 龙: '🐉', 蛇: '🐍',
  马: '🐴', 羊: '🐑', 猴: '🐵', 鸡: '🐔', 狗: '🐶', 猪: '🐷',
}

export const DEFAULT_THEME_ID: ScratchThemeId = 'xixiangfeng'

/** 按 id 取主题；旧卡没存主题时回落到第一套 */
export function themeOf(id?: string | null): ScratchTheme {
  return SCRATCH_THEMES.find((t) => t.id === id) ?? SCRATCH_THEMES[0]
}

/* ------------------------------ 奖池配置区 ------------------------------ */

export type ScratchTier = 'big' | 'small' | 'none'

/**
 * 中奖概率：三者之和必须 = 1
 * big 大奖 5% / small 小奖 38% / none 谢谢参与 57%
 *
 * 公平性：出票时每人各自独立调 drawScratchCells()（各自的 Math.random），
 * 双方走的是同一套概率与同一套奖池，任何一方都不存在额外倾向。
 */
export const SCRATCH_ODDS = {
  big: 0.05,
  small: 0.38,
  none: 0.57,
}

/**
 * 奖池：只有红包奖励，没有实物。
 * ⚠ 维护规则：所有奖项（big + small）金额互不重复——同一金额只允许出现一次，
 * 加新奖项前先检查这边已有的数字。
 */
export const SCRATCH_POOL: Record<ScratchTier, string[]> = {
  /** 大奖（5%）：大额红包 */
  big: [
    '红包 100 ¥',
    '红包 88 ¥',
    '红包 66 ¥',
    '红包 52 ¥',
    '红包 46 ¥',
    '红包 38 ¥',
    '红包 30 ¥',
    '红包 25 ¥',
    '红包 20 ¥',
  ],
  /** 小奖（38%）：小额红包，0.1~18，与大奖金额互不重复 */
  small: [
    '红包 18 ¥',
    '红包 15.2 ¥',
    '红包 13.8 ¥',
    '红包 12 ¥',
    '红包 10.5 ¥',
    '红包 9.9 ¥',
    '红包 9 ¥',
    '红包 8.8 ¥',
    '红包 8 ¥',
    '红包 7.7 ¥',
    '红包 7 ¥',
    '红包 6.6 ¥',
    '红包 6 ¥',
    '红包 5.5 ¥',
    '红包 5 ¥',
    '红包 4.9 ¥',
    '红包 4.5 ¥',
    '红包 4 ¥',
    '红包 3.8 ¥',
    '红包 3.5 ¥',
    '红包 3.3 ¥',
    '红包 3 ¥',
    '红包 2.8 ¥',
    '红包 2.5 ¥',
    '红包 2.2 ¥',
    '红包 2 ¥',
    '红包 1.8 ¥',
    '红包 1.5 ¥',
    '红包 1.2 ¥',
    '红包 1 ¥',
    '红包 0.88 ¥',
    '红包 0.66 ¥',
    '红包 0.5 ¥',
    '红包 0.3 ¥',
    '红包 0.1 ¥',
  ],
  /** 谢谢参与（57%）：也要说得甜一点，别让人扫兴 */
  none: [
    '谢谢惠顾，再接再厉～',
    '谢谢惠顾，刮个寂寞～',
    '谢谢惠顾，下次一定～',
    '谢谢惠顾，甜蜜正在路上～',
    '谢谢惠顾，今日好运攒下啦～',
    '谢谢惠顾，差一点点～',
    '谢谢惠顾，留到明天吧～',
    '谢谢惠顾，空手也是一种浪漫～',
    '谢谢惠顾，下张会更甜～',
    '谢谢惠顾，好运正在排队～',
  ],
}

const pickOne = (list: string[]): string => list[Math.floor(Math.random() * list.length)]

// 开发期兜底：万一有人在奖池里写了重复金额，控制台直接喊出来，别等到线上才发现
if (import.meta.env.DEV) {
  const all = [...SCRATCH_POOL.big, ...SCRATCH_POOL.small]
  const dup = all.filter((v, i) => all.indexOf(v) !== i)
  if (dup.length) console.warn('[刮刮乐] 奖池存在重复奖项（违反「不重复」规则）：', dup)
}

/** 抽一个结果：先掷概率，再在对应奖池里等概率选文案 */
export function drawScratchResult(): { tier: ScratchTier; prize: string } {
  const roll = Math.random()
  if (roll < SCRATCH_ODDS.big) return { tier: 'big', prize: pickOne(SCRATCH_POOL.big) }
  if (roll < SCRATCH_ODDS.big + SCRATCH_ODDS.small) return { tier: 'small', prize: pickOne(SCRATCH_POOL.small) }
  return { tier: 'none', prize: pickOne(SCRATCH_POOL.none) }
}

/** 旧卡没有 tier 字段时，用文案兜底推断（历史数据兼容） */
export function tierOf(card: { tier?: ScratchTier; prize: string }): ScratchTier {
  if (card.tier === 'big' || card.tier === 'small' || card.tier === 'none') return card.tier
  return card.prize.startsWith('谢谢惠顾') ? 'none' : 'small'
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** 彩票编号：代号-日期-4 位随机，和真票的游戏编号观感一致 */
export function makeTicketNo(theme: ScratchTheme, at = new Date()): string {
  const date = `${at.getFullYear()}${pad2(at.getMonth() + 1)}${pad2(at.getDate())}`
  const tail = String(Math.floor(Math.random() * 9000) + 1000)
  return `${theme.code}-${date}-${tail}`
}

/** 旧卡没存编号时，用卡 id 派生一个稳定编号（刷新不会变） */
export function fallbackTicketNo(cardId: string, theme: ScratchTheme): string {
  const digits = cardId.replace(/[^0-9]/g, '').slice(0, 4) || '0000'
  return `${theme.code}-${digits}`
}

/* ============================================================================
 *  多格刮奖配置区（仿纸质刮刮乐的「对号码」玩法）
 * ----------------------------------------------------------------------------
 *  玩法：票面上印着一个「中奖号码」（0-9），刮奖区是 3×3 个小涂层格，
 *  每格下面藏着一组「号码 + 文字」；刮开后号码 == 中奖号码的那格就是奖励，
 *  其余格子是安慰小字。全部格子刮开，整票才揭晓并记入历史。
 * ========================================================================== */

export interface ScratchCell {
  /** 印在这格涂层下的号码（0-9） */
  n: number
  /** 涂层下的文字：中奖格是奖品，其余是安慰话 */
  prize: string
  /** 号码是否等于中奖号码：等于就赢得这格 */
  win: boolean
}

/** 刮奖区格子数量（3×3）。改成 12 就会自动排成 4×3，布局自适应 */
export const SCRATCH_CELL_COUNT = 9

/** 号码取值范围：0 ~ SCRATCH_CELL_MAX（含） */
export const SCRATCH_CELL_MAX = 9

/** 单格刮开多少比例算「这格刮开了」 */
export const CELL_REVEAL_RATIO = 0.4

/** 没中奖的格子里刮出来的安慰小字（等概率随机，尽量不重复） */
export const SCRATCH_CELL_FILLER: string[] = [
  '好运攒一攒', '差一点点～', '再接再厉', '甜蜜在路上', '下次一定',
  '谢谢惠顾', '继续刮刮看', '好运排队中', '小小的遗憾', '甜味预告',
]

/**
 * 出一整张票：先按 SCRATCH_ODDS 掷档位，再摆格子。
 * - big / small：恰有一格号码命中，文案取对应奖池
 * - none：没有任何格命中，整票结果是谢谢参与
 * - prize 是整票结果（历史记录、通知里显示的就是它）
 */
export function drawScratchCells(): {
  tier: ScratchTier
  prize: string
  lucky: number
  cells: ScratchCell[]
} {
  const roll = Math.random()
  const tier: ScratchTier =
    roll < SCRATCH_ODDS.big ? 'big' : roll < SCRATCH_ODDS.big + SCRATCH_ODDS.small ? 'small' : 'none'
  const lucky = Math.floor(Math.random() * (SCRATCH_CELL_MAX + 1))

  const cells: ScratchCell[] = Array.from({ length: SCRATCH_CELL_COUNT }, () => ({ n: 0, prize: '', win: false }))
  const winPrize = tier === 'big' ? pickOne(SCRATCH_POOL.big) : tier === 'small' ? pickOne(SCRATCH_POOL.small) : ''
  if (tier !== 'none') {
    // 中奖格随机放一个位置，刮的时候才有悬念
    const idx = Math.floor(Math.random() * cells.length)
    cells[idx] = { n: lucky, prize: winPrize, win: true }
  }

  // 其余格子：号码必须避开中奖号码；安慰话洗一遍牌，格与格不重复
  const fillers = [...SCRATCH_CELL_FILLER].sort(() => Math.random() - 0.5)
  let fi = 0
  for (const cell of cells) {
    if (cell.win) continue
    let n = lucky
    while (n === lucky) n = Math.floor(Math.random() * (SCRATCH_CELL_MAX + 1))
    cell.n = n
    cell.prize = fillers[fi % fillers.length]
    fi += 1
  }

  return { tier, prize: tier === 'none' ? pickOne(SCRATCH_POOL.none) : winPrize, lucky, cells }
}
