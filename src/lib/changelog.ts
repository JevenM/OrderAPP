/**
 * 更新日志（写死在前端，随构建一起部署）
 *
 * 每次更新功能要发版时：在 CHANGELOG 数组**最前面**加一条，version 必须比上一条大。
 * 用户下次登录后会自动弹出一次；同一个人看完就记住了，之后不再弹，直到下一次改 version。
 */

export type ChangelogKind = 'new' | 'improve' | 'fix'

export type ChangelogItem = {
  kind: ChangelogKind
  text: string
}

export type ChangelogEntry = {
  /** 版本号：判断「是否看过」的唯一依据，新增时必须比上一条大 */
  version: string
  /** 发布日期 YYYY-MM-DD */
  date: string
  /** 一句话标题，可省略 */
  title?: string
  items: ChangelogItem[]
}

/** 最新的排在最前面 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.1.0',
    date: '2026-10-04',
    title: '上线「更新日志」弹窗',
    items: [
      { kind: 'new', text: '每次部署新版本后，登录后第一次进入会自动弹出更新日志，告诉你这次更新了哪些功能' },
      { kind: 'new', text: '顶栏新增「日志」按钮，随时可以回看全部历史更新' },
      { kind: 'improve', text: '更新日志按登录身份分别记录，你看过之后不会再重复弹出' },
    ],
  },
]

export const KIND_LABEL: Record<ChangelogKind, string> = {
  new: '新增',
  improve: '优化',
  fix: '修复',
}

/** 当前版本：弹窗判断用的就是这个值 */
export const CURRENT_VERSION: string = CHANGELOG[0]?.version ?? ''

/* ---------------------- 已读记录（localStorage） ---------------------- */

const SEEN_KEY = 'order-app-changelog-seen-v1'

/** 登录身份 → 已看过的最新版本号 */
export type SeenMap = Record<string, string>

export function loadSeen(): SeenMap {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? (parsed as SeenMap) : {}
  } catch {
    return {}
  }
}

export function saveSeen(map: SeenMap): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(map))
  } catch {
    // 隐私模式下写不进去就算了，最多是下次还会弹一次
  }
}
