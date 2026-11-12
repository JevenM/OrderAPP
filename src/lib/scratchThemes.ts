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
    ink: '#f7e7c2',
    inkSoft: 'rgba(247,231,194,0.62)',
    accent: '#f0c466',
    panel: '#1b1712',
    panelInk: '#f2d391',
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
 * big 大奖 / small 小奖 / none 谢谢参与
 */
export const SCRATCH_ODDS = {
  big: 0.05,
  small: 0.55,
  none: 0.4,
}

export const SCRATCH_POOL: Record<ScratchTier, string[]> = {
  /** 大奖（5%）：虚拟币 / 值钱实物，真的能兑现 */
  big: [
    '奖金 50 ¥',
    '奖金 30 ¥',
    '奖金 20 ¥',
    '一份甜品',
    '一顿火锅',
    '一顿烤肉',
    '电影票一张',
    '一份夜宵',
    '奖金 100 ¥',
  ],
  /** 小奖（55%）：虚拟币 / 实物小奖品，明码标价、真的能换 */
  small: [
    '虚拟币 5 元', '虚拟币 1 元', '虚拟币 3 元',
    '虚拟币 0.5 元', '虚拟币 0.1 元',
    '可口可乐', '农夫山泉',
    '雪碧', '芬达', '脉动', '冰红茶', '绿茶',
    '红烧牛肉面', '蜜雪冰城冰淇淋', '野人先生', '水果拼盘',
    '零食大礼包', '夜宵', '一瓶酸奶', '一顿刘文祥',
    '一杯果茶', '小蛋糕', '一包辣条', '一份炸鸡',
    '一份鸡柳大人', '一瓶三得利', '一份关东煮', '一个巴布卡',
    '一盒牛奶', '一个贝果',
    '一份烤冷面', '一份小笼包', '一份佛卡夏', '一份烧烤小串',
    '一杯恰巴塔', '一份杨枝甘露', '一根烤肠',
    '一根雪糕', '一份法棍', '一份可颂',
    '一份丹麦酥', '一杯双皮奶', '一份肥姨妈',
    '一份馄饨', '一份炒饭', '一份粥', '一份牛筋面',
  ],
  /** 谢谢参与：也要说得甜一点，别让人扫兴 */
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
export const CELL_REVEAL_RATIO = 0.6

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
