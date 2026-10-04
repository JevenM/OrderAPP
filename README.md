# 🍱 点菜小屋

给两个人用的小应用：

- **她**：在手机上点菜下单（选菜、选餐次、期望时间、备注）＋ 记录每天一日三餐吃了什么、吃了没有
- **我**：后台实时看到她的订单（红点 + 浏览器/手机通知 + 邮件推送），可以按日期查看她每天的三餐记录

技术栈：React + Vite + TypeScript + Tailwind + Supabase（免费版） + GitHub Pages（静态托管，可"添加到主屏幕"当 APP 用）。

---

## 一、5 分钟部署

### 1. 创建 Supabase 项目（免费）

1. 打开 https://supabase.com 注册 → New project（地区选 Singapore/Tokyo，免费额度足够两个人用）
2. 左侧 **SQL Editor** → 新建查询 → 把 `supabase/migrations/0001_init.sql` 全文粘贴执行
   - 会创建 `dishes / orders / order_items / meals` 四张表、开启实时订阅、并写入 20 道初始菜
3. **Settings → API** 里复制：
   - `Project URL` → 就是 `VITE_SUPABASE_URL`
   - `anon public` key → 就是 `VITE_SUPABASE_ANON_KEY`

### 2. 拿到 GitHub 仓库配置

1. 把本目录推到 GitHub 仓库（例如 `OrderAPP`）
2. 仓库 **Settings → Pages → Source** 选 **GitHub Actions**
3. 仓库 **Settings → Secrets and variables → Actions → New repository secret**，添加：

| Secret | 值 | 说明 |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` | 第 1 步的 Project URL |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGci...` | anon key |
| `VITE_INVITE_CODE` | 例如 `520` | 进入应用的邀请码，两个人用同一个 |
| `VITE_APP_TITLE` | 例如 `今天吃什么` | 可选，标题 |

4. 推一次 `main` 分支，Actions 会自动构建部署。完成后 Pages 会给出网址：
   `https://<用户名>.github.io/<仓库名>/`

### 3. 两人各自打开网址

- 输入邀请码 → 她选「她」，你选「我」
- 手机端：Safari/Chrome 菜单 → **添加到主屏幕**，之后就是全屏 APP 体验

### 本地开发

```bash
cp .env.example .env      # 填入 Supabase 的两个值 + 邀请码
npm install
npm run dev
```

---

## 二、开启邮件推送（可选，推荐）

下单 / 提交三餐时会调用 Supabase Edge Function 通过 [Resend](https://resend.com)（免费 3000 封/月）给你发邮件。

```bash
# 安装 CLI： https://supabase.com/docs/guides/cli
supabase login
supabase link --project-ref <你的 project-ref>     # 在 Supabase 项目 Settings → General 查看
supabase secrets set RESEND_API_KEY=re_xxxxxx
supabase secrets set NOTIFY_EMAIL=你的邮箱@example.com
# 可选：发件人（默认 onboarding@resend.dev，只能在 Resend 没验证域名时用）
supabase secrets set RESEND_FROM="点菜小屋 <onboarding@resend.dev>"
supabase functions deploy notify-email --no-verify-jwt
```

没配置也不会报错，只是不发邮件（前端会静默跳过）。

> Resend 免费版用默认发件人只能发给**你自己注册 Resend 的邮箱**，正好符合"推送给自己"的场景。

---

## 三、手机/浏览器通知（红点 + 弹窗）

- 后台（"我"身份）右上角点 **🔔 通知** 按钮，允许通知权限
- 只要有新订单 / 新三餐记录，即使没打开页面（页面在后台标签）也会弹系统通知，并"叮"一声
- 底部 Tab 有**红点未读数**；打开对应页面 1.5 秒后自动标记为已读

> iOS Safari 要求先"添加到主屏幕"再打开，才允许网页通知权限，且系统需 iOS 16.4+。

---

## 四、功能说明

| 页面 | 身份 | 能力 |
| --- | --- | --- |
| 点菜 | 她 | 按分类浏览菜单、搜索、`+/-` 选数量、选餐次（早/午/晚/加餐）、填期望时间和备注，一键下单；下方查看最近订单状态 |
| 三餐 | 她 | 选日期 → 早/午/晚/加餐 四张卡片，选择「吃了 / 吃得少 / 没吃」，填写内容与备注，可上传照片；提交后立即同步给你 |
| 订单 | 我 | 实时收到订单（红点+通知+邮件），可「接单 / 做好了 / 取消」，按状态筛选 |
| 饮食 | 我 | 按日期查看她的一日三餐，未记录的餐次显示灰色「未记录」；底部最近 7 天概览，一眼看出哪天没好好吃饭 |
| 菜单 | 我 | 新增/编辑/删除/上下架菜品（名称、emoji、分类、描述、排序） |

### 照片上传（可选）

在 Supabase 控制台 **Storage → New bucket** 建一个名为 `meal-photos` 的 **Public** bucket 即可使用"上传照片"。不建也不影响其它功能。

---

## 五、安全加固（可选）

当前用**邀请码 + anon 可读写**策略（URL 不公开、两个人用足够）。若想让数据库层面也拦住陌生人，可把迁移脚本的 RLS 部分替换为"校验请求头里的邀请码"：

```sql
-- 以 orders 为例，其它表同理
drop policy if exists "anon_all_orders" on public.orders;
create policy "passcode_orders" on public.orders
  for all to anon
  using (current_setting('request.headers', true)::json->>'x-passcode' = '你的邀请码')
  with check (current_setting('request.headers', true)::json->>'x-passcode' = '你的邀请码');
```

并在 `src/lib/supabase.ts` 的 `createClient` 第三个参数里加：

```ts
{ global: { headers: { 'x-passcode': INVITE_CODE } } }
```

注意：开启后实时订阅（Realtime）不会带上自定义请求头，需要改用 Supabase Auth 登录，因此默认方案选择了前者。

---

## 六、目录结构

```
src/
  App.tsx              路由 + 底部 Tab + 角色切换
  pages/Login.tsx      邀请码登录
  pages/OrderPage.tsx  她：点菜下单
  pages/MealLogPage.tsx 她：一日三餐记录
  pages/AdminOrders.tsx 我：接单
  pages/AdminMeals.tsx  我：按日期看三餐
  pages/AdminDishes.tsx 我：菜单管理
  lib/db.ts            所有数据库读写
  lib/notify.ts        邮件 / 浏览器通知 / 提示音
  store/               会话、未读 & 实时订阅
supabase/
  migrations/0001_init.sql   建表 + 实时 + 初始菜单
  functions/notify-email/     邮件推送 Edge Function
.github/workflows/deploy.yml GitHub Pages 自动部署
```

## 七、常见问题

- **页面空白/一直加载**：检查 Actions 里 Secrets 是否都填了；改完 Secrets 需要重新跑一次 workflow（Actions → 最新一次 → Re-run）。
- **刷新 404**：已用 Hash 路由（`#/order`），不会出现该问题。
- **Supabase 免费项目 7 天不用会暂停**：每周至少打开一次，或在 Supabase 控制台手动恢复。
