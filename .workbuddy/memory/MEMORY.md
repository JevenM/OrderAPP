# OrderAPP 项目长期约定

## 数据隔离（用户 2026-11-24 明确要求）
- 系统支持**多对情侣**同时使用，所有功能以「一对绑定的情侣」为单位，**情侣对之间数据不互通**。这是硬性约束，不是可选优化。
- `couple_*` 表用排序复合主键 `(member_a, member_b)` 隔离；`meals` / `posts` / `orders` 没有情侣对字段，唯一归属依据是 `member_id`，必须限定到当前绑定两人。
- 任何新增统计 / 聚合 / 列表功能都要先按情侣对过滤，**禁止全表统计**。`member_id` 为空的早期记录无法判定归属，一律不计入（可选回填见迁移 0048，仅在只有一对绑定关系时执行）。
- realtime 的 `postgres_changes` 是按「表」广播的：`useRealtime` 必须传 `pair`，由 `lib/pairGuard.ts` 的 `belongsToPair` 校验行里的 `member_a/member_b`，否则别对情侣的 `p.new` 会被 `setWeddingRow` 等直接写进本地 state。
- **已知架构边界**：所有 RLS policy 目前是 `anon using(true)`，anon key 随前端 bundle 明文下发，无服务端会话。当前隔离是「应用层查询条件」，不是数据库强制隔离；拿到 anon key 可直接绕过。要强制隔离需引入 Supabase Auth（RLS 按 auth.uid()）或服务端 BFF，属架构级改造。
- 管理员视角（`role === 'me'`）看全站数据属预期内；`Admin*` 页面、`unreadCounts()` 全表统计只在管理员视角调用。

## 工程惯例
- 每次功能改动：在 `src/lib/changelog.ts` 顶部加版本记录 → `typecheck` + `lint` + `test` + `build` 全绿 → 重建 `dist`。
- 新增互动模块：`modules.ts` 登记（含 `newIn`）→ CouplePage 加 `lazy` 声明 + 分组卡片 + 统一 Suspense 内分支；`moduleFlags` 未配置的模块默认开放。
- 新模块优先复用 `Modal`（Portal）/ `EmptyState`+`SkeletonList` / `useConfirm` / `useToast`，不另造弹窗与空态。
- 纯计算逻辑抽到 `lib/*.ts` 并配 Vitest 单测；测试用本地时间构造 ISO（`new Date(y, m-1, d, h).toISOString()`），避免 UTC+8 跨天漂移。
- `package-lock.json` 保持 v1 格式（npm 10 默认升 v3，要显式 `--lockfile-version=1`）。
- **弹窗必须走 `components/Modal`（Portal 到 body）**，且 `index.css` 的 `.overlay` 必须是 `position: fixed`——这条规则丢失时弹窗会退化成文档流块堆在 `<body>` 末尾（v2.1.1 修过一次，改样式时别删）。
- **`html/body/#root` 的横向裁剪只能用 `overflow-x: clip`**：`hidden` 会让 `#root` 变成滚动容器，里面的 `position: sticky`（顶栏/分段条/分类条）全部失效。
- 订单状态链：`pending → accepted → cooking → done`（`cancelled` 为旁路），流转规则集中在 `lib/orderFlow.ts`，新增状态必须同步 `ORDER_STATUS` 与 AdminOrders 筛选。
- 菜系分组（`lib/dishGroups.ts`）：菜单 category 是自由文本，新菜系优先登记到 EXPLICIT 映射，别只依赖关键词兜底。
- 日期输入：**页面内**用 `components/DateField`（`floating` 用于窄触发器或表单单行）；**弹窗内**改用 `components/WheelDateField`（年 / 月 / 日**三个**子滚轮，各自滚完整数值，不是逐位数字；标签与数字列包在同一 `.wheel-group` 里保证居中对齐；Portal + fixed 不撑高弹窗，点浮层外部确认）。`DateField` 的 fixed 浮层在弹窗里会与遮罩/z-index 打架且撑出滚动条。
- 滚轮日历的程序化 `scrollTop` 在首帧会被 `scroll-snap` 吸到第一项：必须在 50ms / 120ms 补两次校正，且滚动事件要防抖 180ms 后读最终位置，否则「今日居中」会随机变成 2016/1 月。
- 骨架屏统一用 `States.tsx` 的 `SkeletonList`，`variant` 按真实行结构选（`countdown` / `rank` / `grid` / `card` / `row`）；扫光 `.skeleton` 为 1.5s linear，真实列表加 `.skeleton-fade` 淡入。深色配方与减少动效的呼吸在 `index.css` 末尾，`prefers-reduced-motion` 全局规则会杀动画，必须用 `.skeleton::after` 的选择器 + `!important` 覆盖。
- **评分类数据禁止挂 `order_items`**：`updateOrder` 是「先删明细再重插」，挂上去任何一次编辑订单都会清空评分、行 id 还会变。逐菜评分单独存 `couple_dish_ratings`，唯一键 `(order_id, dish_name, rater_id)`，`order_item_id` 只作弱引用。
- **`isMissingTable(error)` 要兼顾纯对象错误**：PostgREST 返回 `{code:'PGRST205'}` 时不是 `Error` 实例，只读 `.message` 会被 `String()` 成 `[object Object]`。已在 db.ts 里同时认 code 与 message。
- 关系温度计零新增表（`lib/warmth.ts`）：权重 三餐25/留言20/一起玩15/心意15/投喂15/动态10，各带 7 天满分阈值；采集 14 天内存切「本周/上周」算趋势；任一数据源失败只让该项计 0。
- 共建目标 `couple_goals` 一个目标一行（不是单行 jsonb），习惯打卡存 `checkins` 日期数组；写操作用 `updated_at` 乐观锁，0 行即「对方刚改过」→ 重拉合并。
- 爱心树（`lib/loveTree.ts` + `components/LoveTree.tsx`）：阶段阈值 0/2/6/16/30/50/80/120；枝干数量只看累计浇水（只增不减），芽/心/花/果看繁茂度（断签掉，花果归零）。心/花/果的点位顺序必须是「所有枝尖 → 树冠 → 枝中/细枝」，否则数量少时会全堆在树冠中心。`LOVE_TREE_MAX` 要与组件候选点位数量同步。

## 协作偏好（用户 2026-11-26 明确）
- **Logo 方案已由用户自行选定**，`icon-options/` 六个方案不再是待决项，以后不要再提、也不要主动询问。
- 用户只关注「他主动提供的信息」：不要自作主张扩散范围，不要重复确认已定事项，问题来一条解决一条。

## 待决事项
- （无）
