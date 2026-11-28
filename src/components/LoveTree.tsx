import { loveTreeVisual } from '../lib/loveTree'

const GROUND_Y = 150

/** 天空配色，随阶段从清晨走到绚烂（对应 LOVE_TREE_STAGES 的 8 个阶段） */
const SKY_THEMES: [string, string][] = [
  ['#eaf4ff', '#fff4e8'],
  ['#e0f2fe', '#fff1e6'],
  ['#dbeafe', '#fef3c7'],
  ['#e0e7ff', '#ffe4e6'],
  ['#f3e8ff', '#ffe4e6'],
  ['#fce7f3', '#ffedd5'],
  ['#fbcfe8', '#fed7aa'],
  ['#f9a8d4', '#fde68a'],
]

/** 树冠中心爱心的固定位置 [x, y, 旋转角, 大小倍率]：位置写死，树才不会每次渲染都跳 */
const CROWN_SPOTS: [number, number, number, number][] = [
  [0, 2, 0, 1.18],
  [-13, -4, -13, 1],
  [13, -4, 13, 1],
  [-8, -15, -17, 1.05],
  [8, -15, 17, 1.05],
  [0, -22, 0, 1.1],
  [-21, -9, -22, 0.88],
  [21, -9, 22, 0.88],
  [0, -31, 0, 0.92],
]

const FLOWER_SPOTS: [number, number][] = [
  [-17, -7],
  [17, -7],
  [-10, -20],
  [10, -20],
  [0, -27],
]

const FRUIT_SPOTS: [number, number][] = [
  [-20, 3],
  [20, 3],
  [-13, -12],
  [13, -12],
]

/**
 * 一级枝条：从树干不同高度向两侧伸出。
 * at 是树干高度比例，len / rise 决定枝条长度与翘起角度。
 */
const BRANCH_SPECS: { at: number; dir: -1 | 1; len: number; rise: number }[] = [
  { at: 0.56, dir: -1, len: 15, rise: 14 },
  { at: 0.56, dir: 1, len: 15, rise: 14 },
  { at: 0.73, dir: -1, len: 24, rise: 22 },
  { at: 0.73, dir: 1, len: 24, rise: 22 },
  { at: 0.88, dir: -1, len: 28, rise: 28 },
  { at: 0.88, dir: 1, len: 28, rise: 28 },
]

const CLOUDS: { x: number; y: number; s: number }[] = [
  { x: 36, y: 34, s: 1 },
  { x: 152, y: 52, s: 0.72 },
]

/** 草地上的小草（x, y, 倾斜方向） */
const GRASS_TUFTS: [number, number, number][] = [
  [26, 154, -1],
  [42, 158, 1],
  [64, 156, -1],
  [138, 157, 1],
  [162, 154, -1],
  [182, 158, 1],
]

/** 飘落粒子的固定参数：位置/延时都写死，避免每次渲染重新随机导致闪烁 */
const PETALS = [
  { left: '7%', delay: '0s', dur: '7.5s', glyph: '🌺', size: '13px' },
  { left: '14%', delay: '1s', dur: '5.5s', glyph: '🍂', size: '13px' },
  { left: '21%', delay: '2.6s', dur: '9s', glyph: '🌸', size: '12px' },
  { left: '28%', delay: '4.6s', dur: '7s', glyph: '🍁', size: '12px' },
  { left: '35%', delay: '1.2s', dur: '8.2s', glyph: '✨', size: '11px' },
  { left: '42%', delay: '4.2s', dur: '5.2s', glyph: '🍎', size: '12px' },
  { left: '49%', delay: '4.1s', dur: '7.8s', glyph: '💕', size: '13px' },
  { left: '56%', delay: '6.1s', dur: '5.8s', glyph: '🍊', size: '13px' },
  { left: '63%', delay: '0.7s', dur: '8.8s', glyph: '💗', size: '12px' },
  { left: '70%', delay: '3.7s', dur: '4.8s', glyph: '🍅', size: '12px' },
  { left: '77%', delay: '3.3s', dur: '9.4s', glyph: '🌼', size: '12px' },
  { left: '83%', delay: '7.3s', dur: '6.4s', glyph: '🍓', size: '12px' },
  { left: '88%', delay: '1.9s', dur: '8s', glyph: '🏵️', size: '11px' },
  { left: '94%', delay: '5s', dur: '7.2s', glyph: '🌻', size: '12px' },
]

type Spot = { x: number; y: number; rot?: number; mul?: number }
type PlainSpot = { x: number; y: number }

export default function LoveTree({
  streak,
  water,
  wateredMine,
  wateredPeer,
}: {
  streak: number
  water: number
  wateredMine: boolean
  wateredPeer: boolean
}) {
  const v = loveTreeVisual(streak, water)
  const { size, canopy, stageIndex, dormant, seed, cotyledon } = v
  const [skyFrom, skyTo] = SKY_THEMES[stageIndex] ?? SKY_THEMES[0]

  // 树干：随累计浇水长高长粗，断签也不缩回去
  const trunkH = 14 + size * 62
  const trunkW0 = 3.2 + size * 9.5
  const trunkW1 = 1.5 + size * 3.8
  const rootW = trunkW0 + 2 + size * 3.4
  const topY = GROUND_Y - trunkH

  // 树冠：贴着树干顶，只随繁茂度往上抬
  const crownCy = topY - 2 - canopy * 12
  const spread = 0.5 + canopy * 0.6
  const leafScale = 0.32 + canopy * 0.5

  // 枝条几何：一级枝 + 末梢细枝，都随树的大小一起舒展
  const branchGeo = BRANCH_SPECS.map((s) => {
    const grow = 0.45 + size * 0.8
    const baseY = GROUND_Y - trunkH * s.at
    const baseX = 100 + s.dir * trunkW0 * (1 - s.at * 0.5) * 0.55
    const tipX = baseX + s.dir * s.len * grow
    const tipY = baseY - s.rise * grow
    const ctrlX = baseX + s.dir * s.len * grow * 0.55
    const ctrlY = baseY - s.rise * grow * 0.12
    const twigX = tipX + s.dir * (3.5 + v.twigPerBranch * 2)
    const twigY = tipY - (6 + v.twigPerBranch * 2.5)
    const twig2X = tipX + s.dir * (6 + v.twigPerBranch * 1.5)
    const twig2Y = tipY + 2 + v.twigPerBranch
    return { dir: s.dir, baseX, baseY, tipX, tipY, ctrlX, ctrlY, twigX, twigY, twig2X, twig2Y }
  })
  const activeBranches = branchGeo.slice(0, v.branchCount)

  // 树冠中心的候选点，轮着塞进下面各列，避免心/花/果只堆在中间
  const centerHearts: Spot[] = CROWN_SPOTS.map(([sx, sy, rot, mul]) => ({
    x: 100 + sx * spread,
    y: crownCy + sy * spread,
    rot,
    mul,
  }))
  const centerFlowers: PlainSpot[] = FLOWER_SPOTS.map(([sx, sy]) => ({
    x: 100 + sx * spread,
    y: crownCy + sy * spread,
  }))
  const centerFruits: PlainSpot[] = FRUIT_SPOTS.map(([sx, sy]) => ({
    x: 100 + sx * spread,
    y: crownCy + sy * spread,
  }))

  // 心 / 花 / 果都按「所有枝尖 → 树冠 → 枝中 / 细枝」排序，
  // 这样哪怕只有几颗，也会先均匀挂到每根枝条上，而不是全堆在中间
  const heartSpots: Spot[] = []
  activeBranches.forEach((g) => heartSpots.push({ x: g.tipX, y: g.tipY, rot: g.dir * 16, mul: 0.9 }))
  activeBranches.forEach((_, i) => {
    if (centerHearts[i]) heartSpots.push(centerHearts[i])
  })
  activeBranches.forEach((g) =>
    heartSpots.push({
      x: g.baseX + (g.tipX - g.baseX) * 0.5,
      y: g.baseY + (g.tipY - g.baseY) * 0.5,
      rot: g.dir * 8,
      mul: 0.78,
    })
  )
  activeBranches.forEach((g) => heartSpots.push({ x: g.twigX, y: g.twigY, rot: g.dir * 22, mul: 0.72 }))
  heartSpots.push(...centerHearts.slice(activeBranches.length))

  const flowerSpots: PlainSpot[] = []
  activeBranches.forEach((g) => flowerSpots.push({ x: g.tipX, y: g.tipY - 4 }))
  activeBranches.forEach((_, i) => {
    if (centerFlowers[i]) flowerSpots.push(centerFlowers[i])
  })
  activeBranches.forEach((g) => flowerSpots.push({ x: g.twigX, y: g.twigY - 2 }))
  activeBranches.forEach((g) =>
    flowerSpots.push({
      x: g.baseX + (g.tipX - g.baseX) * 0.6,
      y: g.baseY + (g.tipY - g.baseY) * 0.6 - 3,
    })
  )
  flowerSpots.push(...centerFlowers.slice(activeBranches.length))

  const fruitSpots: PlainSpot[] = []
  activeBranches.forEach((g) => fruitSpots.push({ x: g.tipX + g.dir * 2, y: g.tipY + 3 }))
  activeBranches.forEach((_, i) => {
    if (centerFruits[i]) fruitSpots.push(centerFruits[i])
  })
  activeBranches.forEach((g) => fruitSpots.push({ x: g.twigX, y: g.twigY + 3 }))
  fruitSpots.push(...centerFruits.slice(activeBranches.length))

  // 花苞：顶芽 + 每根枝条的枝尖与细枝末梢
  const budSpots: Spot[] = [{ x: 100, y: topY - 2, mul: 1 }]
  activeBranches.forEach((g) => {
    budSpots.push({ x: g.tipX, y: g.tipY, mul: 0.9 })
    budSpots.push({ x: g.twigX, y: g.twigY, mul: 0.75 })
  })

  const showGlow = canopy > 0.78
  const showStars = stageIndex >= 5
  const showGroundFlowers = stageIndex >= 4
  const petalCount = Math.min(PETALS.length, Math.floor(canopy * 8))

  // 休眠时叶子转灰：树还在，只是状态不好
  const leafFrom = dormant ? '#f0a0b0' : '#fb7185'
  const leafTo = dormant ? '#be6b7c' : '#e11d48'
  const heartNodes = heartSpots.slice(0, v.heartCount)

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <svg viewBox="0 0 200 170" className="block w-full" role="img" aria-label={`爱心树，累计浇水 ${water} 次`}>
        <defs>
          <linearGradient id="lt-sky" x1="0" y1="0" x2="0.35" y2="1">
            <stop offset="0%" stopColor={skyFrom} />
            <stop offset="100%" stopColor={skyTo} />
          </linearGradient>
          <linearGradient id="lt-grass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#86efac" />
            <stop offset="55%" stopColor="#4ade80" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
          <linearGradient id="lt-trunk" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#7c4a30" />
            <stop offset="38%" stopColor="#b9825b" />
            <stop offset="70%" stopColor="#96603f" />
            <stop offset="100%" stopColor="#6b3f28" />
          </linearGradient>
          <linearGradient id="lt-branch" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#8b5a3c" />
            <stop offset="100%" stopColor="#5b3320" />
          </linearGradient>
          <linearGradient id="lt-leaf" x1="0.15" y1="0" x2="0.8" y2="1">
            <stop offset="0%" stopColor={leafFrom} />
            <stop offset="100%" stopColor={leafTo} />
          </linearGradient>
          <linearGradient id="lt-fruit" x1="0.2" y1="0" x2="0.8" y2="1">
            <stop offset="0%" stopColor="#fb7185" />
            <stop offset="100%" stopColor="#9f1239" />
          </linearGradient>
          <radialGradient id="lt-glow">
            <stop offset="0%" stopColor="#fff1f2" stopOpacity="0.7" />
            <stop offset="55%" stopColor="#fecdd3" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#fecdd3" stopOpacity="0" />
          </radialGradient>
          {/* 以 (0,0) 为中心的心形，方便用 transform 摆放 */}
          <g id="lt-heart">
            <path d="M0 9.35l-1.45-1.32C-6.6 3.36-10 0.28-10-3.5c0-3.08 2.42-5.5 5.5-5.5 1.74 0 3.41.81 4.5 2.09C1.09-8.19 2.76-9 4.5-9 7.58-9 10-6.58 10-3.5c0 3.78-3.4 6.86-8.55 11.54L0 9.35z" />
          </g>
          {/* 小小的花苞：尖端朝上的水滴 */}
          <g id="lt-bud">
            <path d="M0 0 C-2.1 -2.2 -2.6 -4.6 0 -7 C2.6 -4.6 2.1 -2.2 0 0 Z" />
          </g>
          {/* 果实：带果柄和小叶的爱心果，比叶子更圆润，一眼能认出是果子 */}
          <g id="lt-apple">
            <circle cx="0" cy="1" r="5" fill="url(#lt-fruit)" />
            <path d="M0 -4 q1 -3 3 -3.5" stroke="#7c2d12" strokeWidth="1" fill="none" strokeLinecap="round" />
            <ellipse cx="2.4" cy="-6" rx="2.6" ry="1.3" fill="#4ade80" transform="rotate(-25 2.4 -6)" />
            <ellipse cx="-1.7" cy="-1.2" rx="1.5" ry="2.2" fill="#fff" opacity="0.55" />
            <path d="M0 3 q0.8 -1.2 1.6 0" stroke="#be123c" strokeWidth="0.6" fill="none" opacity="0.6" />
          </g>
          <g id="lt-flower">
            {[0, 72, 144, 216, 288].map((deg) => (
              <circle key={deg} cx="0" cy="-3.3" r="2.2" fill="#fff" transform={`rotate(${deg})`} />
            ))}
            <circle cx="0" cy="0" r="1.7" fill="#fbbf24" />
          </g>
        </defs>

        <rect x="0" y="0" width="200" height="170" fill="url(#lt-sky)" />

        {/* 太阳：三层叠出柔光 */}
        <circle cx="164" cy="28" r="21" fill="#fde68a" opacity="0.18" />
        <circle cx="164" cy="28" r="13" fill="#fde68a" opacity="0.45" />
        <circle cx="164" cy="28" r="7.5" fill="#fef9c3" opacity="0.95" />

        {/* 云 */}
        {CLOUDS.map((c, i) => (
          <g key={i} opacity="0.5" transform={`translate(${c.x} ${c.y}) scale(${c.s})`}>
            <ellipse cx="0" cy="0" rx="12" ry="5.5" fill="#fff" />
            <ellipse cx="-7" cy="2.5" rx="8" ry="4.5" fill="#fff" />
            <ellipse cx="7" cy="2" rx="9" ry="5" fill="#fff" />
          </g>
        ))}

        {/* 高阶段的星星 */}
        {showStars &&
          [
            [22, 20],
            [44, 36],
            [136, 14],
            [154, 52],
            [68, 16],
            [96, 30],
          ].map(([x, y], i) => (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="1.2"
              fill="#fff"
              className="lt-twinkle"
              style={{ animationDelay: `${i * 0.7}s` }}
            />
          ))}

        {/* 远山剪影 */}
        <path
          d="M0 133 Q26 116 52 129 Q84 143 118 126 Q152 112 200 131 L200 152 L0 152 Z"
          fill="#93b4dc"
          opacity="0.3"
        />

        {/* 草地：深浅两层叠出厚度 */}
        <ellipse cx="100" cy={GROUND_Y + 8} rx="98" ry="22" fill="url(#lt-grass)" />
        <ellipse cx="100" cy={GROUND_Y + 3} rx="74" ry="14" fill="#6ee7b7" opacity="0.45" />

        {/* 树的投影 */}
        {!seed && (
          <ellipse cx="100" cy={GROUND_Y + 6} rx={13 + size * 17} ry={3.6 + size * 3} fill="#14532d" opacity="0.15" />
        )}

        {/* 小草 */}
        {GRASS_TUFTS.map(([x, y, dir], i) => (
          <g key={i} stroke="#22c55e" strokeWidth="0.9" fill="none" strokeLinecap="round" opacity="0.7">
            <path d={`M${x} ${y} q${dir * 1.5} -4 ${dir * 2.5} -7`} />
            <path d={`M${x + dir * 2} ${y} q${dir * 2} -3 ${dir * 3.5} -5`} />
          </g>
        ))}

        {/* 地上的小野花 */}
        {showGroundFlowers &&
          [
            [34, 160],
            [70, 163],
            [148, 161],
            [176, 164],
          ].map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r="1.5" fill="#fff" />
              <circle cx={x} cy={y} r="0.7" fill="#fbbf24" />
            </g>
          ))}

        {showGlow && <circle cx="100" cy={crownCy} r={32 + canopy * 14} fill="url(#lt-glow)" />}

        {seed ? (
          /* 一次都还没浇过水：地里躺着一颗等待浇水的种子 */
          <g>
            <ellipse cx="100" cy={GROUND_Y - 2} rx="9" ry="6.5" fill="#a97c50" />
            <ellipse cx="100" cy={GROUND_Y - 3.5} rx="9" ry="6.5" fill="#d9b98a" />
            <path d={`M95 ${GROUND_Y - 6} q5 -4.5 10 0`} stroke="#8b5a3c" strokeWidth="1.3" fill="none" strokeLinecap="round" />
            <ellipse cx="97" cy={GROUND_Y - 6} rx="2.4" ry="1.4" fill="#fff" opacity="0.45" />
          </g>
        ) : (
          <g>
            {/* 枝条：先画枝再画干，枝根才会被树干盖住 */}
            {activeBranches.map((g, i) => (
              <g key={i} fill="none" stroke="url(#lt-branch)" strokeLinecap="round" opacity={dormant ? 0.75 : 0.95}>
                <path
                  d={`M${g.baseX} ${g.baseY} Q${g.ctrlX} ${g.ctrlY} ${g.tipX} ${g.tipY}`}
                  strokeWidth={0.9 + size * 1.8}
                />
                {v.twigPerBranch >= 1 && (
                  <path
                    d={`M${g.tipX} ${g.tipY} Q${g.tipX + g.dir * 2} ${g.tipY - 4} ${g.twigX} ${g.twigY}`}
                    strokeWidth={0.6 + size * 0.9}
                  />
                )}
                {v.twigPerBranch >= 2 && (
                  <path
                    d={`M${g.tipX} ${g.tipY} Q${g.tipX + g.dir * 4} ${g.tipY + 1} ${g.twig2X} ${g.twig2Y}`}
                    strokeWidth={0.5 + size * 0.7}
                  />
                )}
              </g>
            ))}

            {/* 树干：底部树根隆起，中段收窄，顶部再收 */}
            <path
              d={`M${100 - rootW} ${GROUND_Y + 5}
                  C${100 - rootW} ${GROUND_Y - 1}, ${100 - trunkW0} ${GROUND_Y - 6}, ${100 - trunkW0} ${GROUND_Y - trunkH * 0.25}
                  C${100 - trunkW0 * 0.82} ${GROUND_Y - trunkH * 0.62}, ${100 - trunkW1 * 2.1} ${GROUND_Y - trunkH * 0.82}, ${100 - trunkW1} ${topY}
                  L${100 + trunkW1} ${topY}
                  C${100 + trunkW1 * 2.1} ${GROUND_Y - trunkH * 0.82}, ${100 + trunkW0 * 0.82} ${GROUND_Y - trunkH * 0.62}, ${100 + trunkW0} ${GROUND_Y - trunkH * 0.25}
                  C${100 + trunkW0} ${GROUND_Y - 6}, ${100 + rootW} ${GROUND_Y - 1}, ${100 + rootW} ${GROUND_Y + 5} Z`}
              fill="url(#lt-trunk)"
            />

            {/* 大树才有的根须，向两侧抓进土里 */}
            {size > 0.3 && (
              <g fill="none" stroke="#6b3f28" strokeWidth={0.7 + size * 0.8} strokeLinecap="round" opacity="0.75">
                <path d={`M${100 - rootW + 1} ${GROUND_Y + 5} q-7 0.5 -11 4`} />
                <path d={`M${100 + rootW - 1} ${GROUND_Y + 5} q7 0.5 11 4`} />
              </g>
            )}

            {/* 树皮纹理：两条暗线 + 一条亮线，避免树干是一块死板的色块 */}
            <g fill="none" strokeLinecap="round">
              <path
                d={`M${100 - trunkW0 * 0.45} ${GROUND_Y + 2} C${100 - trunkW0 * 0.4} ${GROUND_Y - trunkH * 0.4}, ${100 - trunkW1 * 0.5} ${GROUND_Y - trunkH * 0.72}, ${100 - trunkW1 * 0.45} ${topY + 3}`}
                stroke="#5b3320"
                strokeWidth="0.8"
                opacity="0.35"
              />
              <path
                d={`M${100 + trunkW0 * 0.5} ${GROUND_Y + 2} C${100 + trunkW0 * 0.45} ${GROUND_Y - trunkH * 0.4}, ${100 + trunkW1 * 0.55} ${GROUND_Y - trunkH * 0.72}, ${100 + trunkW1 * 0.5} ${topY + 3}`}
                stroke="#5b3320"
                strokeWidth="0.8"
                opacity="0.3"
              />
              <path
                d={`M${100 - trunkW0 * 0.08} ${GROUND_Y + 1} C${100 - trunkW0 * 0.06} ${GROUND_Y - trunkH * 0.45}, ${100 - trunkW1 * 0.1} ${GROUND_Y - trunkH * 0.75}, ${100 - trunkW1 * 0.08} ${topY + 4}`}
                stroke="#d9b08a"
                strokeWidth="0.7"
                opacity="0.4"
              />
            </g>

            {/* 破土嫩芽：两片子叶先探出头 */}
            {cotyledon && (
              <g transform={`translate(100 ${topY})`}>
                <path d="M0 1 Q-8 -2 -10 -10 Q-3 -9 0 -2 Z" fill="#86efac" />
                <path d="M0 1 Q8 -2 10 -10 Q3 -9 0 -2 Z" fill="#4ade80" />
                <path d="M0 2 L0 -8" stroke="#3f9142" strokeWidth="1" strokeLinecap="round" />
                <ellipse cx="-6" cy="-7" rx="2" ry="1" fill="#fff" opacity="0.4" transform="rotate(-35 -6 -7)" />
              </g>
            )}

            {/* 花苞：顶芽与枝头的小尖尖，先于心与花出现 */}
            {v.budCount > 0 &&
              budSpots.slice(0, v.budCount).map((s, i) => (
                <g key={`b${i}`} transform={`translate(${s.x} ${s.y}) scale(${s.mul ?? 1})`}>
                  <use href="#lt-bud" fill={cotyledon ? '#f9a8d4' : dormant ? '#d8a0ad' : '#fda4af'} />
                  <ellipse cx="-0.7" cy="-4.4" rx="0.7" ry="1.2" fill="#fff" opacity="0.5" />
                </g>
              ))}

            {/* 心形叶：树冠中心 + 每根枝条的枝尖 / 枝中 / 细枝末梢 */}
            {heartNodes.length > 0 && (
              <g>
                {/* 后层：整体右下偏移一点，给树冠垫出厚度 */}
                <g opacity="0.3" transform="translate(2.6 3.2)">
                  {heartNodes.map((s, i) => (
                    <use
                      key={`back${i}`}
                      href="#lt-heart"
                      fill="#7f1d3a"
                      transform={`translate(${s.x} ${s.y}) rotate(${s.rot ?? 0}) scale(${leafScale * (s.mul ?? 1)})`}
                    />
                  ))}
                </g>
                {/* 主层 */}
                {heartNodes.map((s, i) => (
                  <use
                    key={i}
                    href="#lt-heart"
                    fill="url(#lt-leaf)"
                    transform={`translate(${s.x} ${s.y}) rotate(${s.rot ?? 0}) scale(${leafScale * (s.mul ?? 1)})`}
                  />
                ))}
                {/* 高光：每片叶子左上角点一下，立体感就出来了 */}
                {heartNodes.map((s, i) => {
                  const r = s.rot ?? 0
                  const mul = s.mul ?? 1
                  return (
                    <ellipse
                      key={`h${i}`}
                      cx={s.x - 3.4 * leafScale * mul}
                      cy={s.y - 4.4 * leafScale * mul}
                      rx={2.7 * leafScale * mul}
                      ry={1.9 * leafScale * mul}
                      fill="#fff"
                      opacity="0.36"
                      transform={`rotate(${r} ${s.x} ${s.y})`}
                    />
                  )
                })}
              </g>
            )}

            {/* 花：开在树冠外沿与每根枝条上 */}
            {flowerSpots.slice(0, v.flowerCount).map((s, i) => (
              <use
                key={`f${i}`}
                href="#lt-flower"
                transform={`translate(${s.x} ${s.y}) scale(${0.5 + canopy * 0.4})`}
              />
            ))}

            {/* 果：带柄的小苹果，压在枝头与细枝上 */}
            {fruitSpots.slice(0, v.fruitCount).map((s, i) => (
              <use
                key={`r${i}`}
                href="#lt-apple"
                transform={`translate(${s.x} ${s.y}) scale(${0.6 + canopy * 0.25})`}
              />
            ))}

            {/* 高阶段的萤火虫光点 */}
            {canopy > 0.65 &&
              [
                [74, 96],
                [126, 88],
                [88, 70],
                [116, 62],
              ].map(([x, y], i) => (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r="1.8"
                  fill="#fef08a"
                  className="lt-twinkle"
                  style={{ animationDelay: `${i * 0.9}s` }}
                />
              ))}
          </g>
        )}

        {/* 今日浇水：两滴水，谁打完三餐谁那滴就落下来 */}
        {!seed && (
          <g>
            {(
              [
                { x: 62, on: wateredMine },
                { x: 138, on: wateredPeer },
              ] as const
            ).map(({ x, on }) => (
              <g key={x} className={on ? 'lt-drop' : undefined} opacity={on ? 1 : 0.25}>
                <path
                  d={`M${x} 18 c4 5, 6.5 8, 6.5 11 a6.5 6.5 0 0 1 -13 0 c0 -3, 2.5 -6, 6.5 -11 z`}
                  fill={on ? '#38bdf8' : '#94a3b8'}
                />
                <ellipse cx={x - 2} cy="27" rx="1.6" ry="2.2" fill="#fff" opacity={on ? 0.8 : 0.4} />
              </g>
            ))}
          </g>
        )}
      </svg>

      {/* 飘落的爱心与花瓣 */}
      {petalCount > 0 && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {PETALS.slice(0, petalCount).map((p) => (
            <span
              key={p.left}
              className="lt-petal absolute"
              style={{ left: p.left, fontSize: p.size, animationDelay: p.delay, animationDuration: p.dur }}
            >
              {p.glyph}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
