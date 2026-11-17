/** 一键换肤：全站 brand-* 色板走 :root 的 CSS 变量，切主题 = 换一组变量 */

export interface ThemeDef {
  id: string
  name: string
  emoji: string
  /** rgb 三元组（如 '244 63 112'），tailwind 以 rgb(var(--brand-N) / alpha) 消费 */
  vars: [number, number, number][] // 依次 50~700
}

export const THEME_KEY = 'app-theme'

/** 五套风格：樱粉是原版默认，其余为等价明度梯度，保证对比度一致 */
export const THEMES: ThemeDef[] = [
  {
    id: 'sakura',
    name: '樱粉',
    emoji: '🌸',
    vars: [
      [255, 241, 245],
      [255, 228, 236],
      [254, 205, 217],
      [253, 164, 189],
      [251, 113, 151],
      [244, 63, 112],
      [225, 29, 81],
      [190, 18, 60],
    ],
  },
  {
    id: 'mint',
    name: '薄荷',
    emoji: '🌿',
    vars: [
      [236, 253, 245],
      [209, 250, 229],
      [167, 243, 208],
      [110, 231, 183],
      [52, 211, 153],
      [16, 185, 129],
      [5, 150, 105],
      [4, 120, 87],
    ],
  },
  {
    id: 'ocean',
    name: '海盐',
    emoji: '🌊',
    vars: [
      [240, 249, 255],
      [224, 242, 254],
      [186, 230, 253],
      [125, 211, 252],
      [56, 189, 248],
      [14, 165, 233],
      [2, 132, 199],
      [3, 105, 161],
    ],
  },
  {
    id: 'sunset',
    name: '落日',
    emoji: '🌅',
    vars: [
      [255, 247, 237],
      [255, 237, 213],
      [254, 215, 170],
      [253, 186, 116],
      [251, 146, 60],
      [249, 115, 22],
      [234, 88, 12],
      [194, 65, 12],
    ],
  },
  {
    id: 'starry',
    name: '星夜',
    emoji: '🌌',
    vars: [
      [245, 243, 255],
      [237, 233, 254],
      [221, 214, 254],
      [196, 181, 253],
      [167, 139, 250],
      [139, 92, 246],
      [124, 58, 237],
      [109, 40, 217],
    ],
  },
]

export const defaultTheme = THEMES[0]

export function readThemeId(): string {
  try {
    return localStorage.getItem(THEME_KEY) || defaultTheme.id
  } catch {
    return defaultTheme.id
  }
}

export const themeById = (id: string): ThemeDef => THEMES.find((t) => t.id === id) ?? defaultTheme

/** 把主题变量写到 :root 并持久化（应用启动与切换时调用） */
export function applyTheme(id: string): void {
  const theme = themeById(id)
  const levels = [50, 100, 200, 300, 400, 500, 600, 700]
  levels.forEach((lv, i) => {
    const [r, g, b] = theme.vars[i]
    document.documentElement.style.setProperty(`--brand-${lv}`, `${r} ${g} ${b}`)
  })
  try {
    localStorage.setItem(THEME_KEY, theme.id)
  } catch {
    // 无痕模式等存不了就用本次会话
  }
}

/** 主题预览渐变（换肤弹窗的色卡用） */
export const themeGradient = (t: ThemeDef): string =>
  `linear-gradient(135deg, rgb(${t.vars[2].join(',')}), rgb(${t.vars[4].join(',')}), rgb(${t.vars[5].join(',')}))`

// 模块加载即应用（早于首帧渲染，避免闪旧配色）
applyTheme(readThemeId())
