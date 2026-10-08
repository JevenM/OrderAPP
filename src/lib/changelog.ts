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
    version: '1.9.9',
    date: '2026-10-08',
    title: '饭圈消息通知',
    items: [
      { kind: 'new', text: '发布动态、点赞或评论你的动态时，右上角🔔显示未读条数并实时提醒' },
      { kind: 'new', text: '点开消息面板可查看通知列表（点击跳转饭圈），查看后未读自动清零' },
    ],
  },
  {
    version: '1.9.8',
    date: '2026-10-08',
    title: '打卡更新与情话揭晓',
    items: [
      { kind: 'fix', text: '重复提交当天同一餐时覆盖更新记录，饭圈动态内容与发布时间同步刷新' },
      { kind: 'new', text: '双方三餐打卡齐的那一刻，情话以全屏彩带动画同时揭晓' },
      // { kind: 'improve', text: '今日情话扩容至 120 条、同步抉择内置题库扩容至 120 道（轻松/走心各 60）' },
    ],
  },
  // {
  //   version: '1.9.7',
  //   date: '2026-10-07',
  //   title: '互动空间互通修复',
  //   items: [
  //     { kind: 'new', text: '今日专属情话需要双方都完成早中晚三餐打卡才解锁，两边看到同一句' },
  //     { kind: 'improve', text: '秘密心愿池改为双方共享，抽签结果双方同步，不再区分轻松/认真/挑战' },
  //     { kind: 'fix', text: '甜蜜聊天留言修复：留言正确入库，双方都能看到彼此的消息与历史记录' },
  //     { kind: 'new', text: '同步抉择双人同题：出题/换题双方实时同步，双方作答后动画揭晓默契结果' },
  //     { kind: 'improve', text: '同步抉择作答期间锁定换题与分类切换，等对方答完揭晓后才能换下一题' },
  //     { kind: 'new', text: '对方抽中心愿时，你可实时收到动画弹框提醒，关闭后不再重复弹出' },
  //     { kind: 'improve', text: '甜蜜留言板每条留言上方显示发送者昵称' },
  //   ],
  // },
  // {
  //   version: '1.9.6',
  //   date: '2026-10-06',
  //   title: '心愿池持久化保存',
  //   items: [
  //     { kind: 'fix', text: '秘密心愿改为保存到 Supabase，刷新页面或重新进入互动空间后仍可恢复' },
  //     { kind: 'improve', text: '心愿新增成功后再同步到对方，避免网络失败时出现看似已保存但实际丢失的内容' },
  //   ],
  // },
  // {
  //   version: '1.9.5',
  //   date: '2026-10-06',
  //   title: '修复 Service Worker 加载错误',
  //   items: [
  //     { kind: 'fix', text: '修复 Service Worker 混入 TypeScript 语法导致页面控制台报错的问题' },
  //     { kind: 'fix', text: '网络失败且无缓存时返回有效离线响应，避免请求处理异常' },
  //   ],
  // },
  // {
  //   version: '1.9.4',
  //   date: '2026-10-06',
  //   title: '互动空间全功能双向实时同步',
  //   items: [
  //     { kind: 'new', text: '同步抉择双人实时揭晓：一方提交选项后等待对方，双方均选定后实时揭晓默契结果' },
  //     { kind: 'improve', text: '心愿池双向同步：放入新心愿或完成抽签时，对端好友可即时接收提醒与展示' },
  //   ],
  // },
  // {
  //   version: '1.9.3',
  //   date: '2026-10-06',
  //   title: '互动空间聊天双向互通',
  //   items: [
  //     { kind: 'new', text: '甜蜜聊天支持好友双向互通：一方发送文字或表情，另一方即时同步显示在对话列表' },
  //     { kind: 'improve', text: '双端接入实时通道广播与远端消息拉取，自动记忆并平滑滚动至最新聊天内容' },
  //   ],
  // },
  // {
  //   version: '1.9.2',
  //   date: '2026-10-06',
  //   title: '互动题库扩展',
  //   items: [
  //     { kind: 'improve', text: '今日专属情话扩充为充足题库，按日期每天稳定呈现一条专属内容' },
  //     { kind: 'new', text: '同步抉择新增轻松版、走心版和自定义题目，个人题目会保存到当前专属空间' },
  //   ],
  // },
  // {
  //   version: '1.9.1',
  //   date: '2026-10-06',
  //   title: '管理员好友关系管理',
  //   items: [
  //     { kind: 'new', text: '管理员可查看全部成员好友关系，并指定任意两人成为好友或解除关系' },
  //     { kind: 'improve', text: '互动空间仅对普通用户开放，管理员登录后不再显示互动入口' },
  //   ],
  // },
  // {
  //   version: '1.9.0',
  //   date: '2026-10-06',
  //   title: '互动空间上线',
  //   items: [
  //     { kind: 'new', text: '新增互动空间入口：集合三餐情话、秘密心愿抽签、文字表情聊天和同步抉择玩法' },
  //     { kind: 'new', text: '秘密心愿支持随时添加内容和设置轻松、认真、挑战难度，抽签后展示待完成心愿' },
  //   ],
  // },
  // {
  //   version: '1.8.2',
  //   date: '2026-10-05',
  //   title: '互动消息实时提醒与超大图智能压缩',
  //   items: [
  //     { kind: 'new', text: '饭圈互动即时提醒：发布新动态、点赞你的动态、发表评论或定向回复时，实时弹出消息提示、声音与系统通知' },
  //     { kind: 'improve', text: '超大图片压缩支持：上传限制放宽至 50MB，大幅优化多轮阶梯压缩算法，几十兆高清原图也能稳定无损压进 20KB 左右' },
  //   ],
  // },
  // {
  //   version: '1.8.1',
  //   date: '2026-10-05',
  //   title: '交互动效升级与多项体验优化',
  //   items: [
  //     { kind: 'improve', text: '交互动效提升：饭圈动态加入弹出动画，点赞增加爱心跳动动效，发布动态与发送评论均增加触控微动效' },
  //     { kind: 'fix', text: '去除动态日期重复：修正动态卡片日期拼接逻辑，仅保留精简发布时间与餐次标签' },
  //     { kind: 'fix', text: '桌面端即时刷新：Service Worker 改为网络优先策略，并在切回前台时自动刷新最新数据，避免从桌面点入显示旧内容' },
  //     { kind: 'improve', text: '手机通知体验优化：增强旧版 WebKit 与移动端兼容，针对 iPhone 引导添加到主屏幕后再开启系统通知' },
  //   ],
  // },
  // {
  //   version: '1.8.0',
  //   date: '2026-10-05',
  //   title: '个人资料与安全加固',
  //   items: [
  //     { kind: 'new', text: '昵称唯一性支持：个人资料支持自定义唯一昵称，后台与个人中心均增加重名校验' },
  //     { kind: 'improve', text: '邀请码安全保护：个人资料与好友页面彻底隐藏登录邀请码展示，避免口令泄露' },
  //     { kind: 'improve', text: '简化界面入口：暂时隐藏未启用功能，保持操作界面轻简聚焦' },
  //   ],
  // },
  // {
  //   version: '1.7.0',
  //   date: '2026-10-04',
  //   title: '头像自定义 + 登录排障 + 动效升级',
  //   items: [
  //     { kind: 'new', text: '头像能自己换啦：顶部点头像即可从相册选图，自动压缩后上传' },
  //     { kind: 'improve', text: '饭圈动态也显示头像了' },
  //     { kind: 'fix', text: '校验邀请码连不上 Supabase 时不再只显示「Failed to fetch」，会给出可操作的排查建议（项目暂停 / 地址写错 / 没配环境变量 / 网络拦截），并支持一键重试和网络自检' },
  //     { kind: 'improve', text: '页面切换、提示条、底部导航都加了过渡动画，卡片点击有轻微反馈；系统开启「减弱动态效果」时会自动关闭' },
  //   ],
  // },
  // {
  //   version: '1.6.0',
  //   date: '2026-10-04',
  //   title: '切换到某个她 → 所有页面只看她自己的数据',
  //   items: [
  //     { kind: 'improve', text: '顶部下拉切到「查看 A」后，订单 / 饮食 / 新菜申请都自动按 A 筛选，只看她的数据' },
  //     { kind: 'fix', text: '切到某个她的视角时，饭圈以前会看到所有人；现在跟她自己看到的一模一样' },
  //     { kind: 'new', text: '顶部多了一条「正在查看某某，所有页面只显示她的数据」提示条，右侧一键「回到全员」' },
  //   ],
  // },
  // {
  //   version: '1.6.0',
  //   date: '2026-10-04',
  //   title: '优化banner显示',
  //   items: [
  //     { kind: 'new', text: '修复banner显示拥挤高度太大的问题' },
  //   ],
  // },
  // {
  //   version: '1.4.0',
  //   date: '2026-10-04',
  //   title: '设置昵称',
  //   items: [
  //     { kind: 'new', text: '「成员」页每个人下面新增昵称显示' },
  //     { kind: 'improve', text: '没单独设置的继续用统一昵称；刷新就生效' },
  //   ],
  // },
  // {
  //   version: '1.3.0',
  //   date: '2026-10-04',
  //   title: '评论只对应该看到的人可见 + 针对性回复',
  //   items: [
  //     { kind: 'improve', text: '点赞和评论收紧权限：只有「我」能看到所有人的，每个她只看得到「他的」+「自己的」，别的她的点赞评论完全看不到' },
  //     { kind: 'new', text: '新增针对性回复：点评论下面的「回复」，这条回复只有那个人能看到（带 🔒 标记），其他人收不到' },
  //     { kind: 'improve', text: '针对性回复会在输入框上方提示「正在回复 某某，只有她能看到」，标错了可以点「取消」改回公开评论' },
  //   ],
  // },
  // {
  //   version: '1.2.0',
  //   date: '2026-10-04',
  //   title: '上传图片自动压缩',
  //   items: [
  //     { kind: 'new', text: '三餐 / 饭圈上传照片前自动压缩，统一压到 20KB 左右再上传，省流量也省存储空间' },
  //     { kind: 'improve', text: '上传完成后会提示压缩效果，例如「图片已上传（3.2MB → 19KB）」' },
  //     { kind: 'improve', text: '压缩时先限制长边到 1280 像素再调画质，照片明显变小但依然清晰；超大长图会自动多压几轮' },
  //   ],
  // },
  // {
  //   version: '1.1.0',
  //   date: '2026-10-04',
  //   title: '上线「更新日志」弹窗',
  //   items: [
  //     { kind: 'new', text: '每次部署新版本后，登录后第一次进入会自动弹出更新日志，告诉你这次更新了哪些功能' },
  //     { kind: 'new', text: '顶栏新增「日志」按钮，随时可以回看全部历史更新' },
  //     { kind: 'improve', text: '更新日志按登录身份分别记录，你看过之后不会再重复弹出' },
  //   ],
  // },
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
