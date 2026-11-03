import { canopyGrowthOf, isDormantTree, loveTreeStageIndex, treeSizeOf } from '../lib/loveTree'

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

/** 树冠上爱心的固定位置 [x, y, 旋转角, 大小倍率]：位置写死，树才不会每次渲染都跳 */
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
  [-6, -26],
  [6, -26],
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
  // 🍏🍐🍋🍇🍒🍑🌽🌶️🍭🥭🥦🥜
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
  // 树的大小 / 阶段看累计浇水，繁茂程度看连续天数
  const size = treeSizeOf(water)
  const canopy = canopyGrowthOf(streak, water)
  const stageIndex = loveTreeStageIndex(water)
  const dormant = isDormantTree(streak, water)
  const [skyFrom, skyTo] = SKY_THEMES[stageIndex] ?? SKY_THEMES[0]

  // 树干：随累计浇水长高长粗，断签也不缩回去
  const trunkH = 14 + size * 62
  const trunkW0 = 3.2 + size * 8
  const trunkW1 = 1.5 + size * 3
  const rootW = trunkW0 + 2 + size * 3.4
  const topY = GROUND_Y - trunkH
  const branchTiers = size > 0.55 ? 3 : size > 0.25 ? 2 : size > 0.1 ? 1 : 0

  // 树冠：随连续天数繁茂，断签往下掉。
  // 基准必须贴着树干顶（topY - 2），只随繁茂度往上抬 ——
  // 否则小树/休眠时树冠会浮在树干上方一大截，看着像断在空中
  const crownCy = topY - 2 - canopy * 12
  const spread = 0.5 + canopy * 0.6
  const leafScale = 0.32 + canopy * 0.5
  const leafCount = water <= 0 ? 0 : 1 + Math.round(canopy * 8)

  // 只有「一次都还没浇过」才是地上的种子；浇过水的树再怎么断签也还是一棵树
  const showSeed = water <= 0
  const flowerCount = canopy > 0.42 ? Math.min(FLOWER_SPOTS.length, Math.floor((canopy - 0.42) * 12)) : 0
  const fruitCount = canopy > 0.6 ? Math.min(FRUIT_SPOTS.length, Math.floor((canopy - 0.6) * 14)) : 0
  const showGlow = canopy > 0.78
  const showStars = stageIndex >= 5
  const showGroundFlowers = stageIndex >= 4
  const petalCount = Math.min(PETALS.length, Math.floor(canopy * 8))

  // 休眠时叶子转灰：树还在，只是状态不好
  const leafFrom = dormant ? '#f0a0b0' : '#fb7185'
  const leafTo = dormant ? '#be6b7c' : '#e11d48'

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
        {!showSeed && (
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

        {showSeed ? (
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
            {branchTiers >= 1 && (
              <g stroke="#6b3f28" fill="none" strokeLinecap="round">
                <path d={`M100 ${topY + 4} Q93 ${topY - 8} 86 ${topY - 17}`} strokeWidth={1.2 + size * 1.5} />
                <path d={`M100 ${topY + 4} Q107 ${topY - 8} 114 ${topY - 17}`} strokeWidth={1.2 + size * 1.5} />
              </g>
            )}
            {branchTiers >= 2 && (
              <g stroke="#6b3f28" fill="none" strokeLinecap="round">
                <path d={`M86 ${topY - 17} q-5 -2.5 -9 -3.5`} strokeWidth={0.9 + size * 1.1} />
                <path d={`M86 ${topY - 17} q-1.5 -5 -2.5 -9`} strokeWidth={0.9 + size * 1.1} />
                <path d={`M114 ${topY - 17} q5 -2.5 9 -3.5`} strokeWidth={0.9 + size * 1.1} />
                <path d={`M114 ${topY - 17} q1.5 -5 2.5 -9`} strokeWidth={0.9 + size * 1.1} />
              </g>
            )}
            {branchTiers >= 3 && (
              <g stroke="#6b3f28" fill="none" strokeLinecap="round" opacity="0.9">
                <path d={`M100 ${topY + trunkH * 0.42} Q88 ${topY + trunkH * 0.36} 78 ${topY + trunkH * 0.31}`} strokeWidth={0.9 + size} />
                <path d={`M100 ${topY + trunkH * 0.42} Q112 ${topY + trunkH * 0.36} 122 ${topY + trunkH * 0.31}`} strokeWidth={0.9 + size} />
                <path d={`M77 ${topY - 20.5} q-3 -3 -6 -3.5`} strokeWidth={0.7 + size * 0.7} />
                <path d={`M123 ${topY - 20.5} q3 -3 6 -3.5`} strokeWidth={0.7 + size * 0.7} />
              </g>
            )}

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

            {/* 树冠：一簇爱心 */}
            {leafCount > 0 && (
              <g transform={`translate(100 ${crownCy})`}>
                {/* 后层：整体右下偏移一点，深色半透明，给树冠垫出厚度 */}
                <g opacity="0.3" transform="translate(2.6 3.2)">
                  {CROWN_SPOTS.slice(0, leafCount).map(([sx, sy, rot, mul], i) => (
                    <use
                      key={i}
                      href="#lt-heart"
                      fill="#7f1d3a"
                      transform={`translate(${sx * spread} ${sy * spread}) rotate(${rot}) scale(${leafScale * mul})`}
                    />
                  ))}
                </g>
                {/* 主层 */}
                {CROWN_SPOTS.slice(0, leafCount).map(([sx, sy, rot, mul], i) => (
                  <use
                    key={i}
                    href="#lt-heart"
                    fill="url(#lt-leaf)"
                    transform={`translate(${sx * spread} ${sy * spread}) rotate(${rot}) scale(${leafScale * mul})`}
                  />
                ))}
                {/* 高光：每片叶子左上角点一下，立体感就出来了 */}
                {CROWN_SPOTS.slice(0, leafCount).map(([sx, sy, rot, mul], i) => (
                  <ellipse
                    key={`h${i}`}
                    cx={sx * spread - 3.4 * leafScale * mul}
                    cy={sy * spread - 4.4 * leafScale * mul}
                    rx={2.7 * leafScale * mul}
                    ry={1.9 * leafScale * mul}
                    fill="#fff"
                    opacity="0.36"
                    transform={`rotate(${rot} ${sx * spread} ${sy * spread})`}
                  />
                ))}
                {/* 花 */}
                {FLOWER_SPOTS.slice(0, flowerCount).map(([sx, sy], i) => (
                  <use
                    key={`f${i}`}
                    href="#lt-flower"
                    transform={`translate(${sx * spread} ${sy * spread}) scale(${0.55 + canopy * 0.45})`}
                  />
                ))}
                {/* 果：比叶子小的深红爱心 */}
                {FRUIT_SPOTS.slice(0, fruitCount).map(([sx, sy], i) => (
                  <g key={`r${i}`} transform={`translate(${sx * spread} ${sy * spread}) scale(${leafScale * 0.5})`}>
                    <use href="#lt-heart" fill="url(#lt-fruit)" />
                    <ellipse cx="-2.6" cy="-3.4" rx="2" ry="1.4" fill="#fff" opacity="0.4" />
                  </g>
                ))}
              </g>
            )}

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
        {!showSeed && (
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
