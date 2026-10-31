import { canopyGrowthOf, loveTreeStageIndex, trunkGrowthOf } from '../lib/loveTree'

const GROUND_Y = 152

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

/** 树冠上爱心的固定位置 [x, y, 旋转角]：位置写死，树才不会每次渲染都跳 */
const CROWN_SPOTS: [number, number, number][] = [
  [0, 4, 0],
  [-13, -3, -14],
  [13, -3, 14],
  [-8, -14, -18],
  [8, -14, 18],
  [0, -20, 0],
  [-21, -9, -24],
  [21, -9, 24],
  [0, -29, 0],
]

const FLOWER_SPOTS: [number, number][] = [
  [-16, -6],
  [16, -6],
  [-9, -19],
  [9, -19],
  [0, -26],
]

const FRUIT_SPOTS: [number, number][] = [
  [-19, 3],
  [19, 3],
  [-12, -11],
  [12, -11],
  [-5, -25],
  [5, -25],
]

/** 飘落粒子的固定参数：位置/延时都写死，避免每次渲染重新随机导致闪烁 */
const PETALS = [
  { left: '7%', delay: '0s', dur: '7.5s', glyph: '💗', size: '13px' },
  { left: '21%', delay: '2.6s', dur: '9s', glyph: '🌸', size: '12px' },
  { left: '35%', delay: '1.2s', dur: '8.2s', glyph: '✨', size: '11px' },
  { left: '49%', delay: '4.1s', dur: '7.8s', glyph: '💕', size: '13px' },
  { left: '63%', delay: '0.7s', dur: '8.8s', glyph: '💗', size: '12px' },
  { left: '77%', delay: '3.3s', dur: '9.4s', glyph: '🌸', size: '12px' },
  { left: '88%', delay: '1.9s', dur: '8s', glyph: '✨', size: '11px' },
  { left: '94%', delay: '5s', dur: '7.2s', glyph: '💕', size: '12px' },
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
  const t = trunkGrowthOf(water)
  const c = canopyGrowthOf(streak)
  const stageIndex = loveTreeStageIndex(streak)
  const [skyFrom, skyTo] = SKY_THEMES[stageIndex] ?? SKY_THEMES[0]

  // 树干：随累计浇水长高长粗，断签也不缩回去
  const trunkH = 10 + t * 58
  const trunkW0 = 2.6 + t * 7
  const trunkW1 = 1.4 + t * 2.8
  const topY = GROUND_Y - trunkH

  // 树冠：随连续天数长大，断签就凋零
  const crownCy = GROUND_Y - trunkH - 14 - c * 8
  const spread = 0.45 + c * 0.55
  const leafScale = 0.3 + c * 0.5
  const leafCount = streak <= 0 ? 0 : 1 + Math.round(c * 8)

  // 只有「还没开始」时才显示地上的种子；断签但浇过水的，是一棵光秃的老树
  const showSeed = streak === 0 && water === 0
  const showBranch = t > 0.22
  const showSideBranch = t > 0.55
  const flowerCount = c > 0.42 ? Math.min(FLOWER_SPOTS.length, Math.floor((c - 0.42) * 12)) : 0
  const fruitCount = c > 0.6 ? Math.min(FRUIT_SPOTS.length, Math.floor((c - 0.6) * 14)) : 0
  const showGlow = c > 0.78
  const showStars = stageIndex >= 5
  const petalCount = Math.min(PETALS.length, Math.floor(c * 8))

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <svg viewBox="0 0 200 170" className="block w-full" role="img" aria-label={`爱心树，连续 ${streak} 天`}>
        <defs>
          <linearGradient id="lt-sky" x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0%" stopColor={skyFrom} />
            <stop offset="100%" stopColor={skyTo} />
          </linearGradient>
          <linearGradient id="lt-grass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#86efac" />
            <stop offset="100%" stopColor="#4ade80" />
          </linearGradient>
          <linearGradient id="lt-trunk" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#8b5a3c" />
            <stop offset="45%" stopColor="#b9825b" />
            <stop offset="100%" stopColor="#7c4a30" />
          </linearGradient>
          <linearGradient id="lt-leaf" x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0%" stopColor={c > 0.5 ? '#fb7185' : '#fbcfe8'} />
            <stop offset="100%" stopColor={c > 0.5 ? '#e11d48' : '#f9a8d4'} />
          </linearGradient>
          <radialGradient id="lt-glow">
            <stop offset="0%" stopColor="#fff1f2" stopOpacity="0.75" />
            <stop offset="60%" stopColor="#fecdd3" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#fecdd3" stopOpacity="0" />
          </radialGradient>
          {/* 以 (0,0) 为中心的心形，方便用 transform 摆放 */}
          <g id="lt-heart">
            <path d="M0 9.35l-1.45-1.32C-6.6 3.36-10 0.28-10-3.5c0-3.08 2.42-5.5 5.5-5.5 1.74 0 3.41.81 4.5 2.09C1.09-8.19 2.76-9 4.5-9 7.58-9 10-6.58 10-3.5c0 3.78-3.4 6.86-8.55 11.54L0 9.35z" />
          </g>
          <g id="lt-flower">
            {[0, 72, 144, 216, 288].map((deg) => (
              <circle key={deg} cx="0" cy="-3.2" r="2.1" fill="#fff" transform={`rotate(${deg})`} />
            ))}
            <circle cx="0" cy="0" r="1.7" fill="#fbbf24" />
          </g>
        </defs>

        <rect x="0" y="0" width="200" height="170" fill="url(#lt-sky)" />

        {/* 太阳 / 高阶段的星星 */}
        <circle cx="166" cy="30" r="11" fill="#fde68a" opacity="0.85" />
        <circle cx="166" cy="30" r="18" fill="#fde68a" opacity="0.25" />
        {showStars &&
          [
            [24, 22],
            [46, 38],
            [138, 16],
            [156, 54],
            [70, 18],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={1.2} fill="#fff" opacity="0.9" className="lt-twinkle" style={{ animationDelay: `${i * 0.7}s` }} />
          ))}

        {/* 草地 */}
        <ellipse cx="100" cy={GROUND_Y + 6} rx="96" ry="20" fill="url(#lt-grass)" />
        <ellipse cx="100" cy={GROUND_Y + 2} rx="70" ry="12" fill="#6ee7b7" opacity="0.55" />

        {showGlow && <circle cx="100" cy={crownCy} r={34 + c * 12} fill="url(#lt-glow)" />}

        {showSeed ? (
          /* 还没开始：地里躺着一颗等待浇水的种子 */
          <g>
            <ellipse cx="100" cy={GROUND_Y - 3} rx="8" ry="6" fill="#c8a06a" />
            <ellipse cx="100" cy={GROUND_Y - 4} rx="8" ry="6" fill="#d9b98a" />
            <path d={`M96 ${GROUND_Y - 6} q4 -4 8 0`} stroke="#a97c50" strokeWidth="1.2" fill="none" strokeLinecap="round" />
          </g>
        ) : (
          <g>
            {/* 树枝：先画枝，再画干，枝才会被树干盖住根部 */}
            {showBranch && (
              <g stroke="#7c4a30" fill="none" strokeLinecap="round">
                <path d={`M100 ${topY + 2} Q94 ${topY - 10} 86 ${topY - 19}`} strokeWidth={1 + t * 1.4} />
                <path d={`M100 ${topY + 2} Q106 ${topY - 10} 114 ${topY - 19}`} strokeWidth={1 + t * 1.4} />
              </g>
            )}
            {showSideBranch && (
              <g stroke="#7c4a30" fill="none" strokeLinecap="round">
                <path d={`M100 ${topY + trunkH * 0.42} Q90 ${topY + trunkH * 0.36} 80 ${topY + trunkH * 0.3}`} strokeWidth={0.9 + t} />
                <path d={`M100 ${topY + trunkH * 0.42} Q110 ${topY + trunkH * 0.36} 120 ${topY + trunkH * 0.3}`} strokeWidth={0.9 + t} />
              </g>
            )}

            {/* 树干：底粗顶细，侧面微微内凹 */}
            <path
              d={`M${100 - trunkW0} ${GROUND_Y + 2}
                  C${100 - trunkW0 * 0.75} ${GROUND_Y - trunkH * 0.45}, ${100 - trunkW1 * 1.9} ${GROUND_Y - trunkH * 0.78}, ${100 - trunkW1} ${topY}
                  L${100 + trunkW1} ${topY}
                  C${100 + trunkW1 * 1.9} ${GROUND_Y - trunkH * 0.78}, ${100 + trunkW0 * 0.75} ${GROUND_Y - trunkH * 0.45}, ${100 + trunkW0} ${GROUND_Y + 2} Z`}
              fill="url(#lt-trunk)"
            />

            {/* 树冠：一簇爱心 */}
            {leafCount > 0 && (
              <g transform={`translate(100 ${crownCy})`}>
                {CROWN_SPOTS.slice(0, leafCount).map(([sx, sy, rot], i) => (
                  <use
                    key={i}
                    href="#lt-heart"
                    fill="url(#lt-leaf)"
                    opacity={0.92}
                    transform={`translate(${sx * spread} ${sy * spread}) rotate(${rot}) scale(${leafScale})`}
                  />
                ))}
                {FLOWER_SPOTS.slice(0, flowerCount).map(([sx, sy], i) => (
                  <use
                    key={`f${i}`}
                    href="#lt-flower"
                    transform={`translate(${sx * spread} ${sy * spread}) scale(${0.55 + c * 0.45})`}
                  />
                ))}
                {FRUIT_SPOTS.slice(0, fruitCount).map(([sx, sy], i) => (
                  <use
                    key={`r${i}`}
                    href="#lt-heart"
                    fill="#be123c"
                    transform={`translate(${sx * spread} ${sy * spread}) scale(${(0.3 + c * 0.5) * 0.5})`}
                  />
                ))}
              </g>
            )}

            {/* 高阶段的萤火虫光点 */}
            {c > 0.65 &&
              [
                [74, 96],
                [126, 88],
                [88, 70],
                [116, 62],
              ].map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r="1.8" fill="#fef08a" className="lt-twinkle" style={{ animationDelay: `${i * 0.9}s` }} />
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
