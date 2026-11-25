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
- 日期输入统一用 `components/DateField`（`floating` 用于窄触发器或表单单行；弹窗内必须用内联模式，fixed 浮层会被 z-index 压在遮罩下）。

## 待决事项
- `icon-options/` 六个 Logo 方案已落盘并渲染自检，等用户选编号后一次性替换 `public/icon.svg` 及 favicon / PWA manifest / Service Worker / 通知图标四处引用。
