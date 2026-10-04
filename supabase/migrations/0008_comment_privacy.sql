-- ============================================================
-- 点菜小屋 · 饭圈评论隐私 + 针对性回复
-- 用法：Supabase 控制台 → SQL Editor → 粘贴执行（可重复执行）
-- ============================================================

-- ---------- 针对性回复 ----------
-- 评论表里加一列：这条评论是「回复给谁」的
--   NULL  = 公开评论（谁看得见这条动态，谁就看得到）
--   有值  = 针对性回复，**只有这个人能看到**（我和管理员当然也能看到）
alter table public.post_comments
  add column if not exists reply_to uuid references public.members (id) on delete set null;

comment on column public.post_comments.reply_to is
  '针对性回复：填写成员 id 后，该评论只有这个成员能看到；NULL 表示公开评论';

create index if not exists post_comments_reply_to_idx on public.post_comments (reply_to);

-- 老数据保持不变：历史评论 reply_to 全是 NULL，也就是原来的「公开评论」行为

-- ---------- 说明 ----------
-- 可见性规则不在数据库里做（前端过滤器负责），因为要不要给某个匿名 key 看动态，
-- 取决于「用哪个邀请码登录」，Postgres 侧无从判断。规则详见 src/lib/db.ts 的 listPosts。
-- RLS / 实时订阅沿用 0005_feed.sql 的配置，新增列不需要额外处理。
