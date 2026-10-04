-- ============================================================
-- 点菜小屋 · 多成员（多个「她」，各自昵称 + 邀请码）
-- 用法：Supabase 控制台 → SQL Editor → 粘贴执行（可重复执行）
-- ============================================================

-- ---------- 成员表 ----------
create table if not exists public.members (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,               -- 昵称，如「小美」
  code       text not null unique,        -- 她的专属邀请码
  created_at timestamptz not null default now()
);

-- ---------- 让订单 / 三餐归属到具体成员 ----------
alter table public.orders add column if not exists member_id uuid references public.members (id) on delete set null;
alter table public.meals  add column if not exists member_id uuid references public.members (id) on delete set null;

create index if not exists orders_member_id_idx on public.orders (member_id);
create index if not exists meals_member_id_idx  on public.meals (member_id);

-- ---------- 权限：与既有表一致（邀请码模式，anon 可读写） ----------
alter table public.members enable row level security;

do $$
begin
  drop policy if exists "anon_all_members" on public.members;
  create policy "anon_all_members" on public.members for all to anon using (true) with check (true);
  drop policy if exists "auth_all_members" on public.members;
  create policy "auth_all_members" on public.members for all to authenticated using (true) with check (true);
end $$;

-- ---------- 实时订阅（成员增删改后管理端自动刷新） ----------
do $$
begin
  begin
    alter publication supabase_realtime add table public.members;
  exception when others then
    null; -- 已经加过就忽略
  end;
end $$;
