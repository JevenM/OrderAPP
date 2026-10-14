/** 可被管理员开关控制的功能模块 */
export type ModuleKey =
  | 'love'
  | 'wish'
  | 'chat'
  | 'quiz'
  | 'truth'
  | 'board'
  | 'mines'
  | 'wufu'
  | 'gomoku'
  | 'watermelon'
  | 'dice'
  | 'changelog'
  | 'about'

export interface ModuleDef {
  key: ModuleKey
  icon: string
  title: string
  /** 管理页里的说明文案 */
  desc: string
  /** 分组：情侣日常 / 互动游戏 / 应用入口 */
  group: 'couple' | 'game' | 'app'
}

/**
 * 模块清单（唯一真相来源）：
 * - CouplePage 的互动入口网格按此顺序渲染，并按管理员开关过滤
 * - AdminModuleFlags 管理页按 group 分组展示
 * - App.tsx 的「更新日志 / 关于我们」入口同样受此开关控制
 */
export const MODULE_DEFS: ModuleDef[] = [
  { key: 'love', icon: '💌', title: '今日情话', desc: '完成三餐打卡解锁的每日情话', group: 'couple' },
  { key: 'wish', icon: '🎁', title: '秘密心愿', desc: '互写心愿、拆心愿', group: 'couple' },
  { key: 'chat', icon: '💬', title: '甜蜜留言', desc: '两人专属留言板', group: 'couple' },
  { key: 'quiz', icon: '💞', title: '同步抉择', desc: '同一道题各自作答、看默契', group: 'couple' },
  { key: 'truth', icon: '🎲', title: '真心话大冒险', desc: '随机抽题作答', group: 'game' },
  { key: 'board', icon: '🎯', title: '情侣飞行棋', desc: '联网轮流掷骰对战', group: 'game' },
  { key: 'mines', icon: '💣', title: '情侣扫雷', desc: '轮流拆雷、踩雷做任务', group: 'game' },
  { key: 'wufu', icon: '♟️', title: '摆方五福棋', desc: '摆子提子走子', group: 'game' },
  { key: 'gomoku', icon: '⚫', title: '情侣五子棋', desc: '联网轮流落子', group: 'game' },
  { key: 'watermelon', icon: '🍉', title: '情侣西瓜分', desc: '给 TA 加减分', group: 'game' },
  { key: 'dice', icon: '🎲', title: '骰子比大小', desc: '3 个骰子押大小', group: 'game' },
  { key: 'changelog', icon: '📋', title: '更新日志', desc: '右上角「更多」里的更新日志入口与自动弹窗', group: 'app' },
  { key: 'about', icon: '💕', title: '关于我们 & 赞赏', desc: '右上角「更多」里的关于我们页面入口', group: 'app' },
]

export const MODULE_GROUPS: { key: ModuleDef['group']; title: string; hint: string }[] = [
  { key: 'couple', title: '情侣日常', hint: '情话、心愿、留言、同步抉择' },
  { key: 'game', title: '互动游戏', hint: '飞行棋、扫雷、五子棋等对战小游戏' },
  { key: 'app', title: '应用入口', hint: '更新日志、关于我们' },
]

/** 情侣互动空间里的模块（CouplePage 用，应用入口类不在其中） */
export const COUPLE_MODULE_KEYS = MODULE_DEFS.filter((m) => m.group !== 'app').map((m) => m.key)

/** 全部可开关模块的 key */
export const ALL_MODULE_KEYS = MODULE_DEFS.map((m) => m.key)

/** 某个分组下的模块清单 */
export const modulesOfGroup = (group: ModuleDef['group']): ModuleDef[] => MODULE_DEFS.filter((m) => m.group === group)

export const moduleDef = (key: ModuleKey): ModuleDef =>
  MODULE_DEFS.find((m) => m.key === key) ?? MODULE_DEFS[0]

/** 管理端按成员隔离存储时的回落标记 */
export const GLOBAL_SCOPE = 'global'
