-- ============================================================
-- 点菜小屋 · 成员昵称唯一性约束（0012）
-- 用法：Supabase 控制台 → SQL Editor → 粘贴执行（可重复执行）
-- 说明：确保每个成员的昵称唯一（加好友按昵称查找，防止同名混淆）
-- ============================================================

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'members_name_unique'
  ) then
    alter table public.members
      add constraint members_name_unique unique (name);
  end if;
end $$;
