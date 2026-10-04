# 🍱 点菜小屋（OrderAPP）

给两个人（或「我 + 多个她」）用的小应用：

- **她**：点菜下单（菜单选菜 / 自定义菜名、选餐次、期望时间、备注）＋ 记录每天一日三餐（自动发饭圈）
- **我**：后台实时收到订单（红点 + 通知 + 邮件），接单、看三餐记录、管菜单、管成员、审核她申请的新菜
- **饭圈**：她记录三餐后自动发带图动态；支持点赞 / 评论；**她与她之间互相不可见**，我能看到所有人的动态

技术栈：**React 18 + Vite 5 + TypeScript + Tailwind 3 + Supabase（免费版）+ GitHub Pages**（静态托管，手机「添加到主屏幕」即可当 APP 用）。

线上地址：`https://jevenm.github.io/OrderAPP/`

---

## 一、用到了哪些工具

| 工具 | 用来干什么 | 费用 |
| --- | --- | --- |
| **Node.js 20** | 跑开发服务器和构建（**必须 18+，Vite 5 不支持 Node 16**） | 免费 |
| **npm**（建议切 npmmirror 源） | 装依赖 | 免费 |
| **VS Code / CodeBuddy** | 写代码 | 免费 |
| **Git + GitHub** | 版本管理 | 免费 |
| **GitHub Actions** | 推送代码后自动构建 | 免费额度足够 |
| **GitHub Pages** | 静态托管，对外访问地址 | 免费 |
| **Supabase** | Postgres 数据库 + Realtime 实时订阅 + Storage 照片 + Edge Functions | 免费额度足够两人用 |
| **Resend** | 邮件推送 | 免费 3000 封/月 |
| **微信开发者工具** | ❌ 不用。已评估过小程序方案，**决定维持现有 PWA 方案** | — |

> 关于小程序：曾调研过做成微信小程序，可行且能 0 元，但要走**个人主体注册 + ICP 备案 + 提审**，且通知会从 Web Push 退化成「一次性订阅消息」、Supabase 需改用 `wx.request` 重写。**结论：不划算，维持现状。**

### 源码技术栈

| 依赖 | 版本 | 用途 |
| --- | --- | --- |
| React / React DOM | 18.3 | UI |
| react-router-dom | 6.26 | 路由（**HashRouter**，避免 GitHub Pages 子路径 404） |
| @supabase/supabase-js | 2.45 | 数据库读写 + 实时订阅 |
| Vite | 5.4 | 开发服务器 / 打包 |
| TypeScript | 5.5 | 类型检查 |
| Tailwind CSS | 3.4 | 样式 |

---

## 二、本地启动

### 1）环境准备

```bash
node -v    # 必须 ≥ 18，推荐 20。若显示 v16.x，需先升级 Node
```

本机已装的 Node 20 路径（如未在 PATH 中，可临时指定）：

```
C:\Users\maowenjie\.workbuddy\binaries\node\versions\20.18.0.installing.30176.__extract_temp__\node-v20.18.0-win-x64
```

npm 官方源在本机很慢，建议切国内镜像（已配置过可跳过）：

```bash
npm config set registry https://registry.npmmirror.com
```

### 2）安装依赖

```bash
npm install
```

### 3）配置环境变量

```bash
cp .env.example .env
```

填入（`.env` 已被 `.gitignore` 忽略，**不要提交**）：

| 变量 | 说明 |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase 项目 Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | 同上，`anon public` key |
| `VITE_INVITE_CODE` | 她的邀请码（本地随便填，线上由 Secret 决定） |
| `VITE_ADMIN_CODE` | 管理口令，**默认 `adminMao`**，可不填 |
| `VITE_APP_TITLE` | 可选，默认「今天吃什么」 |
| `VITE_ADMIN_NAME` | 可选，「我的昵称」默认值，默认 `我`（进「成员」页可随时改，改完存数据库） |

### 4）启动

```bash
npm run dev
```

打开 **http://localhost:5173/**。改代码会热更新。

### 全部可用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 本地开发服务器（5173 端口） |
| `npm run typecheck` | 只做 TypeScript 类型检查（不打包） |
| `npm run build` | **先跑类型检查再打包**，产物在 `dist/` |
| `npm run preview` | 预览打包产物 |

---

## 三、本地调试

### 登录调试

- 本地（`npm run dev`）时，登录页**底部会直接显示当前的邀请码和管理口令**，不用去翻 `.env`。
- 输入 `VITE_INVITE_CODE` → 进入「她」的视图；输入 `VITE_ADMIN_CODE`（默认 `adminMao`）→ 进入「我」的管理后台。
- 登录态存在 **localStorage 的 `order-app-session-v2`**。想重置登录态：Chrome DevTools → Application → Local Storage → 删掉这个 key，或点页面右上角「退出」。

### 用管理员身份查看任意一个「她」

用 `adminMao` 登录后，右上角有一个下拉框：

- 选「我的管理视图」→ 回到后台
- 选「查看 某某」→ 以她的视角看她的点菜/三餐页

这是**单向的**：用邀请码登录的她看不到这个下拉，也无法进后台。

### 手机真机调试

```bash
npm run dev -- --host
```

终端会打印局域网地址（如 `http://192.168.x.x:5173/`），手机连同一 WiFi 直接访问即可（数据是手机浏览器直连 Supabase，不经过电脑）。

### 调试 Supabase 数据

- **Table Editor**：直接看/改 `dishes / orders / order_items / meals / members` 表
- **SQL Editor**：跑查询和迁移脚本
- 页面报「加载菜单失败」「提交订单失败」时，优先去 SQL Editor 确认迁移脚本是否已执行、表是否存在
`https://supabase.com/dashboard/project/vbyjdfcfventelmjcufc/storage/files`
执行sql文件的时候打不开页面，可以使用右上角的AI，把内容复制到AI中，然后让他来执行


### 实时同步怎么验证

开两个浏览器窗口（或一个正常 + 一个无痕）：

1. 窗口 A 用邀请码登录成「她」，下一个单
2. 窗口 B 用 `adminMao` 登录成「我」

B 的「订单」Tab 应立刻出现红点并弹通知。若没有，检查 Supabase 项目的 Realtime 是否开启（迁移脚本已把四张表加入 publication）。

---

## 四、改完代码如何更新到 GitHub Pages

> ⚠️ **最重要的一条**：`VITE_*` 变量是**构建期**烧进 JS 的，不是运行时读取。
> 所以**改代码**或**改 Secret**，都必须重新跑一次部署流程才会生效。

### 标准流程（改了代码）

```bash
git add -A
git commit -m "说明这次改了什么"
git push
```

推到 `main` 后，`.github/workflows/deploy.yml` **会自动触发**构建部署。

想手动触发（或 Actions 没自动跑）：

> 仓库 → **Actions** → 左侧 **Deploy to GitHub Pages** → 右上角 **Run workflow** → 分支选 `main` → Run

### 等它变绿

- 通常 1 分钟左右。变绿后浏览器**强制刷新** `Ctrl+Shift+R`（Mac `Cmd+Shift+R`），否则可能还在用缓存的旧 JS。
- 变红了就点开那次运行看日志，最常见是构建报错或依赖装不上。

### 只改了 Secret（没改代码）

改完 Secret **不会自动重新构建**，必须手动跑一次：

> **Actions → Deploy to GitHub Pages → Run workflow**

然后同样强刷浏览器。

### 部署相关的 Secrets

仓库 → **Settings → Secrets and variables → Actions → New repository secret**

| Secret | 必填 | 值 |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | ✅ | `https://xxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | ✅ | `eyJhbGci...` |
| `VITE_INVITE_CODE` | ✅ | 她的邀请码 |
| `VITE_ADMIN_CODE` | ❌ | 不填则用默认 `adminMao` |
| `VITE_APP_TITLE` | ❌ | 不填则为「今天吃什么」 |

> Secret 名**必须带 `VITE_` 前缀**且大小写完全一致，写成 `INVITE_CODE` 不会被读取，前端会退回默认值 `520`。

### Pages 的 Source 必须选对

仓库 → **Settings → Pages → Build and deployment → Source** 必须选 **GitHub Actions**。

如果选成「Deploy from a branch」，会把**未构建的仓库源码**直接当静态站伺服，现象是**页面全白 + `manifest.webmanifest` / `icon.svg` 404**。

---

## 五、数据库迁移（Supabase）

Supabase 控制台 → **SQL Editor**，按顺序执行：

| 脚本 | 作用 | 说明 |
| --- | --- | --- |
| `supabase/migrations/0001_init.sql` | 建 `dishes / orders / order_items / meals` 四表、开 RLS、加实时订阅、写入 20 道初始菜 | 幂等，可重复执行 |
| `supabase/migrations/0002_members.sql` | 建 `members` 表，`orders` / `meals` 加 `member_id` | **必须执行**，否则新代码会报 members 表不存在 |
| `supabase/migrations/0003_drinks.sql` | 追加奶茶 / 饮品类初始菜单（按菜名去重） | 幂等，可重复执行 |
| `supabase/migrations/0004_dish_requests.sql` | 建 `dish_requests` 表（她申请的新菜 + 我的审核状态） | **必须执行**，否则「新菜审核」不生效 |
| `supabase/migrations/0005_feed.sql` | 建 `posts` / `post_likes` / `post_comments` 三表（饭圈动态、点赞、评论） | **必须执行**，否则饭圈打不开（会提示加载饭圈失败） |
| `supabase/migrations/0006_settings.sql` | 建 `app_settings` 表，存「我的昵称」（她在饭圈里看到的名字） | 不执行也能跑，只是昵称固定为默认值 `我` |
| `supabase/migrations/0007_meal_photos_policy.sql` | 放开 `storage.objects` 的 anon 读写（照片上传） | **要传图就必须执行**，只建 bucket 会报 RLS 错误 |
| `supabase/migrations/0008_comment_privacy.sql` | `post_comments` 加 `reply_to` 列（针对性回复） | **要用「回复某人」就必须执行**，否则会报 reply_to 列不存在 |
| `supabase/migrations/0009_member_my_name.sql` | `members` 加 `my_name` 列（每个她看到的我） | **要用「她看到我叫」就必须执行**，不改旧数据，留空继续用统一昵称 |

> 多成员功能上线前产生的历史订单/三餐，`member_id` 为 NULL，后台显示为「未归属」，数据不丢。

照片上传（可选）：Storage → New bucket，名 `meal-photos`，**Public**。不建也不影响其它功能。

> ⚠️ 只建 bucket **还不够**：Supabase 的「Public」只代表图片能被公开读取，**上传仍然受 `storage.objects` 的 RLS 限制**。
> 建完 bucket 后**必须再执行 `supabase/migrations/0007_meal_photos_policy.sql`**（放开 anon 的 insert/update/delete），
> 否则会报 `new row violates row-level security policy`。脚本最后有一条自检查询，看到 `public = true` 就说明配好了。
>
> 其它排查点：bucket 名必须一字不差 `meal-photos`；`Allowed MIME types` 留空或包含 `image/*`；单张图不要超过 10MB。

### 照片自动压缩

上传前会在浏览器里压到 **20KB 左右**再传（不是限制，是压缩）：先把长边降到 **1280px**，再逐步降 JPEG 画质，
还不达标就继续缩小像素上限循环，最后统一存成 `.jpg`（png 透明区域会自动铺白底，不会变黑）。

| 想调整 | 改哪里 |
| --- | --- |
| 压缩目标大小 | `src/lib/image.ts` 的 `TARGET_PHOTO_BYTES`（默认 `20 * 1024`） |
| 长边像素上限 | `src/lib/image.ts` 的 `MAX_EDGE`（默认 `1280`） |

压缩失败（老浏览器 / 图解码不了）会**退回上传原图**，不会挡着用户上传。
上传成功后 toast 会显示压缩效果，例如「图片已上传（**3.2MB → 19KB**）」。

---

## 六、开启邮件推送（可选，推荐）

下单 / 提交三餐时调用 Supabase Edge Function，通过 [Resend](https://resend.com) 给你发邮件。

```bash
supabase login
supabase link --project-ref <你的 project-ref>      # Supabase → Settings → General
supabase secrets set RESEND_API_KEY=re_xxxxxx
supabase secrets set NOTIFY_EMAIL=你的邮箱@example.com
supabase secrets set RESEND_FROM="点菜小屋 <onboarding@resend.dev>"
supabase functions deploy notify-email --no-verify-jwt
```

没配也不会报错，只是不发邮件（前端静默跳过）。

---

## 七、登录与身份机制

| 输入 | 进入 | 能看到 |
| --- | --- | --- |
| 邀请码（如 `ilovemg6`） | 「她」的视图 | 点菜、三餐 |
| 管理口令（默认 `adminMao`） | 「我」的后台 | 订单、饮食、菜单、成员；可下拉切换查看任意一个她 |

- 她用自己的邀请码登录后，顶栏显示「嗨，**她的昵称** 👋」，饭圈里也显示她的昵称（昵称取自登录态，不需要成员表）。
- 顶部副标题对管理员显示「我是**我的昵称** · 她的动态实时同步」，统一昵称在「成员」页最上方改，存 `app_settings` 表，所有端实时同步。
- **每个她可以各叫一个名字**：「成员」页每个成员下面有「**她看到我叫**」，填了就以它为准（存 `members.my_name`），
  留空则用上面的统一昵称。例：A 看到我叫 `maoge`、B 看到我叫 `老干部`，互不影响。
- 顶部下拉切到「查看 A」后，饭圈里显示的我的名字就是 A 专属那个，可以直接预览效果。
- 登录页**只有一个输入框**，不显示任何「我是谁」的选择 —— 管理入口对外不可见。
- 顶部栏右侧有「**退出**」按钮（她的页面和后台都有），会二次确认并清空登录态。
- 退出时会把地址重置到 `/`，避免下次用她的邀请码登录却落到后台页面。

---

## 八、功能说明

| 页面 | 身份 | 能力 |
| --- | --- | --- |
| 点菜 | 她 | 按分类浏览/搜索菜单，`+/-` 选数量，选餐次（早/午/晚/加餐），填期望时间和备注，一键下单；下方看最近订单状态 |
| ↳ **想吃的菜** | 她 | 菜单里没有的菜，可在输入框直接写菜名加入购物车，与菜单菜混着一起下单；提交后同步发给他审核，通过即进菜单 |
| 三餐 | 她 | 选日期 → 早/午/晚/加餐 四张卡片，「吃了 / 吃得少 / 没吃」+ 内容备注 + 上传照片；**提交后自动发一条带图动态到饭圈**（同一天同一餐次只发一条，重复填会更新） |
| 订单 | 我 | 实时收订单（红点 + 通知 + 邮件），「接单 / 做好了 / 取消」，按状态筛选；标记「做好了」会自动把这顿同步成她的就餐记录 |
| 饮食 | 我 | 按日期看她的一日三餐，同一餐次按成员分条展示；可**修改 / 删除**任意一条记录；底部最近 7 天概览 |
| 菜单 | 我 | 新增/编辑/删除/上下架菜品（名称、emoji 分组选择、分类含奶茶/饮品、描述、价格、排序）；顶部审核她申请的新菜（收进菜单 / 婉拒），Tab 带红点 |
| 成员 | 我 | 新增多个「她」（各自昵称 + 独立邀请码），可改名 / 改码 / 删除；**每人单独设置「她看到我叫」**（专属称呼，留空用统一昵称）；顶部下拉切换查看对象；最上面可改**我的昵称**（统一昵称） |
| 饭圈 | 她 | 看「我发的 + 自己发的」动态，**自己也能手动发动态/删自己的**（只有我和她本人能看到）；**点赞 / 评论只看得到「我」的 + 自己的** |
| 饭圈 | 我 | 看到**所有人**的动态、点赞、评论（每个她都标了名字），自己也能发带图动态，可点赞 / 评论 / 删除任意动态；点评论的「回复」可发**只有那个人能看到**的回复 🔒 |

---

### 饭圈的可见性规则（这块最容易搞混）

同一个数据库的 4 类数据，**谁看得到什么**不一样：

| 数据 | 我（管理员） | 某个她 |
| --- | --- | --- |
| 动态 | 所有人的 | 我发的 + 她自己发的（她现在也能自己发，别人看不到） |
| 点赞 | 所有人的 | **只有我点的** + 她自己点的 |
| 评论 | 所有人的 | **只有我发的公开评论** + 我专门回复她的 + 她自己发的 |
| 针对性回复（🔒） | 全部看得到（写明「仅某某可见」） | **只有被回复的那个人**看得到 |

- 她自己的点赞 / 评论对她自己是可见的（不然她点完赞连红心都不亮、发完评论看不见自己写的）。
- 针对性回复怎么用：我点评论右边的「**回复**」→ 输入框上方出现「🔒 正在回复 某某，只有她能看到」→ 发的内容
  只有那个 members 记录里的人能收到，别的她连这条评论都看不到。点「取消」就变回公开评论。
- 回复目标默认取**被回复那条评论的主人**；如果那条评论是我自己发的，就取**这条动态的主人**。
- 规则实现在 `src/lib/db.ts` 的 `listPosts`（前端过滤），数据库层面不区分（anon key 不知道是谁登录）。

---

## 九、目录结构

```
src/
  App.tsx                 路由 + 底部 Tab + 顶部栏（成员切换 / 退出）
  pages/Login.tsx         邀请码 / 管理口令登录
  pages/OrderPage.tsx     她：点菜下单 + 自定义菜名
  pages/MealLogPage.tsx   她：一日三餐记录（自动同步饭圈）
  pages/FeedPage.tsx      饭圈：动态 / 点赞 / 评论（可见性按身份过滤）
  pages/AdminOrders.tsx   我：接单
  pages/AdminMeals.tsx    我：按日期看三餐（可改可删）
  pages/AdminDishes.tsx   我：菜单管理
  pages/AdminMembers.tsx  我：成员管理（多个她）
  lib/db.ts               所有数据库读写
  lib/supabase.ts         Supabase 客户端 + INVITE_CODE / ADMIN_CODE / APP_TITLE
  lib/notify.ts           邮件 / 浏览器通知 / 提示音
  lib/realtime.ts         实时订阅封装（WebSocket 连不上自动降级轮询）
  lib/types.ts            类型与常量（SLOTS、状态字典）
  lib/changelog.ts        更新日志数据 + 已读记录（localStorage）
  lib/image.ts            上传前图片压缩（统一 20KB）+ sizeText 体积格式化
  components/ChangelogModal.tsx  更新日志弹窗
  store/changelog.tsx     判断「这次版本看过没」→ 是否弹窗
  store/session.tsx       登录态、角色、isAdmin、当前查看的成员
  store/members.tsx       成员列表 + 实时刷新
  store/unread.tsx        未读红点 & 实时订阅
  store/settings.tsx      应用设置：我的昵称（app_settings 表）
supabase/
  migrations/0001_init.sql      建表 + 实时 + 初始菜单
  migrations/0002_members.sql   成员表 + member_id
  migrations/0003_drinks.sql    奶茶 / 饮品初始菜单
  migrations/0004_dish_requests.sql  她申请的新菜 + 审核
  migrations/0005_feed.sql      饭圈：posts / post_likes / post_comments
  migrations/0006_settings.sql  app_settings（我的昵称）
  functions/notify-email/       邮件推送 Edge Function
.github/workflows/deploy.yml    GitHub Pages 自动部署
```

---

### 切换查看某个她时，全局都会跟着筛选

顶部下拉选「查看 A」后，**所有页面都只看 A 的数据**：

| 页面 | 切到 A 之后显示什么 |
| --- | --- |
| 点菜 / 三餐 | 就是 A 自己的页面（本来就按 member_id 走） |
| 饭圈 | 完全等同于 A 自己看到的内容（别的她的动态 / 点赞 / 评论都不出现） |
| 订单 | 成员筛选自动锁定为 A（顶部的下拉可以临时改成别人） |
| 饮食 | 同上，当天记录 + 近 7 天概览都只看 A |
| 新菜审核 | 只显示 A 提的申请 |
| 菜单 / 成员 | 共用数据，不跟着筛选 |

- 顶部会出现一条提示条：`👧 正在查看「A」，所有页面只显示她的数据` + 「**回到全员**」一键切回管理视图。
- 这个筛选只影响你浏览器当前看的视角，**不会改数据**；回到「我的管理视图」就恢复成全部成员。

---

## 十、更新日志（每次发版必看）

每次部署新版本后，**用户登录进来会第一次自动弹出更新日志**（显示这次新增 / 优化 / 修复了什么），
点「知道啦」关掉后就记住了，**后续无更新不会再弹**，直到下一次发版。

- 已读记录存在 **localStorage 的 `order-app-changelog-seen-v1`**，按登录身份（我 / 每个她）分别记录。
- 顶栏「**日志**」按钮可随时手动回看全部历史更新。
- 想重新看一遍弹窗：清掉上面那个 localStorage key 再刷新。

### 发版时要做的唯一一件事

在 `src/lib/changelog.ts` 的 `CHANGELOG` 数组**最前面**加一条，`version` 必须比上一条大：

```ts
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.2.0',            // ← 必须比上一条大，这是「弹不弹」的判断依据
    date: '2026-10-10',
    title: '这次更新的一句话标题',
    items: [
      { kind: 'new', text: '新增了 xxx 功能' },     // 新增
      { kind: 'improve', text: '优化了 xxx 体验' }, // 优化
      { kind: 'fix', text: '修复了 xxx 的问题' },   // 修复
    ],
  },
  // ...历史记录保持在下面，不用动
]
```

> 只改了代码但**没加 version**，用户那边不会弹窗（因为版本号没变）。
> 这和 `VITE_*` 一样是构建期烧进去的，**必须推代码重新部署**才生效。

---

## 十一、常见问题速查

| 现象 | 原因 / 解决办法 |
| --- | --- |
| **页面全白 + `manifest.webmanifest` 404** | Pages 的 Source 被设成「Deploy from a branch」，伺服了未构建的源码。改成 **GitHub Actions** 并手动 Run workflow |
| **邀请码一直提示不对** | ① Secret 名写错（必须严格 `VITE_INVITE_CODE`）；② 改了 Secret 但没重跑 workflow；③ 浏览器用了缓存旧 JS，需 `Ctrl+Shift+R` 强刷 |
| **改了 Secret 但线上没变** | `VITE_*` 是构建期变量，改完必须 **Run workflow 重新构建** |
| **报 members 表不存在** | `0002_members.sql` 还没在 Supabase 执行 |
| **「加载饭圈失败」/ 饭圈空白** | `0005_feed.sql` 还没执行；点赞唯一索引冲突说明同一个人重复点了赞，刷新即可 |
| **她写的菜没出现在审核区** | `0004_dish_requests.sql` 没执行，或同名申请已在待审核中（自动去重，不重复推送） |
| **bucket 建好了仍提示上传失败（`row-level security policy`）** | `storage.objects` 没放开写入：执行 `0007_meal_photos_policy.sql`；bucket 必须勾选 Public、名字 `meal-photos` |
| **图片上传成功但显示不出来** | bucket 不是 Public，或 `Allowed MIME types` 把该类型排除了 |
| **照片压缩后有点糊 / 想更清晰** | 上传统一压到 20KB：调大 `src/lib/image.ts` 的 `TARGET_PHOTO_BYTES`（如 `50 * 1024`）和 `MAX_EDGE` 重新部署 |
| **toast 显示「3.2MB → 3.2MB」没变小** | 浏览器不支持 canvas 压缩，走了原图兜底；换 Chrome / Safari 新版 |
| **控制台一直刷 `WebSocket ... ERR_CONNECTION_RESET`** | Supabase Realtime 的 ws 被网络拦截，**不影响功能**：`lib/realtime.ts` 会自动降级为 10 秒轮询刷新 |
| **连不上 Supabase / 一直弹错误 toast** | 检查 `.env`（本地）或 Secrets（线上）两个 Supabase 值；免费项目 **7 天不用会暂停**，去控制台手动恢复 |
| **刷新后 404** | 已用 Hash 路由（`#/order`），正常不会出现 |
| **收不到通知** | 后台右上角点「🔔 通知」授权；iOS Safari 需先「添加到主屏幕」再打开，且系统需 iOS 16.4+ |
| **Node 报错 / 构建失败** | Node 版本太低，Vite 5 需要 18+（推荐 20） |
