-- 模块开关：管理员统一控制普通用户登录后展示并可用的功能模块
-- member_id 为 NULL = 全局默认配置；填成员 id = 该成员的单独配置（优先于全局）
create table if not exists public.app_module_flags (
  id         uuid primary key default gen_random_uuid(),
  key        text not null,
  member_id  uuid references public.members(id) on delete cascade,
  enabled    boolean not null default true,
  updated_at timestamptz not null default now()
);

-- 一个模块只有一条全局配置；每个成员对同一模块也只有一条配置
create unique index if not exists app_module_flags_global_uq
  on public.app_module_flags (key) where member_id is null;
create unique index if not exists app_module_flags_member_uq
  on public.app_module_flags (key, member_id) where member_id is not null;

alter table public.app_module_flags enable row level security;
create policy "app_module_flags_read" on public.app_module_flags for select using (true);
create policy "app_module_flags_write" on public.app_module_flags for all using (true) with check (true);

alter table public.app_module_flags replica identity full;

do $$ begin
  alter publication supabase_realtime add table public.app_module_flags;
exception when duplicate_object then null; when undefined_object then null;
end $$;
