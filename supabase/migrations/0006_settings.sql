-- ============================================================
-- 点菜小屋 · 应用设置（目前存「我的昵称」，她在饭圈里看到的是它）
-- 用法：Supabase 控制台 → SQL Editor → 粘贴执行（可重复执行）
-- ============================================================

create table if not exists public.app_settings (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value)
values ('admin_name', '我')
on conflict (key) do nothing;

alter table public.app_settings enable row level security;

do $$
begin
  drop policy if exists "anon_all_app_settings" on public.app_settings;
  create policy "anon_all_app_settings" on public.app_settings for all to anon using (true) with check (true);
  drop policy if exists "auth_all_app_settings" on public.app_settings;
  create policy "auth_all_app_settings" on public.app_settings for all to authenticated using (true) with check (true);
end $$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.app_settings;
  exception when others then
    null; -- 已经加过就忽略
  end;
end $$;
