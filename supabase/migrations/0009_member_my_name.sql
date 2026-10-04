-- ============================================================
-- 点菜小屋 · 成员专属称呼（每个她看到的「我」的昵称可以不一样）
-- 用法：Supabase 控制台 → SQL Editor → 粘贴执行（可重复执行）
-- ============================================================

-- 她看到的「我」的昵称：填了就优先用这个，不填就用 app_settings 里的全局 admin_name
alter table public.members add column if not exists my_name text;

comment on column public.members.my_name is
  '这个成员看到的「我」的昵称；为空表示沿用全局昵称（app_settings.admin_name）';

-- 老成员默认留空 = 继续用原来的全局昵称，行为不变
