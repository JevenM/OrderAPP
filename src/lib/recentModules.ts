/**
 * 最近使用的互动模块（LRU）：和「NEW 角标已读标记」是两回事，用独立的 localStorage key。
 * 只在本设备记录；本模块只管存储，key 的合法性由调用方（modules.ts）校验，避免循环依赖。
 */
const KEY = 'modules-recent'
const MAX = 6

/** 读取最近使用列表；只接受字符串，脏数据直接丢弃 */
export function recentModules(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
    if (!Array.isArray(raw)) return []
    return raw.filter((k): k is string => typeof k === 'string').slice(0, MAX)
  } catch {
    return []
  }
}

/** 打开某模块：置顶去重，超出上限截断 */
export function touchModule(key: string): void {
  const list = [key, ...recentModules().filter((k) => k !== key)].slice(0, MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // localStorage 不可用时不记录，无伤大雅
  }
}
