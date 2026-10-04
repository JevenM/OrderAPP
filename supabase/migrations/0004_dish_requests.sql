-- ============================================================
-- 点菜小屋 ·「菜单里没有的菜」申请 + 审核
-- 用法：Supabase 控制台 → SQL Editor → 粘贴执行（可重复执行）
-- ============================================================

create table if not exists public.dish_requests (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,                      -- 她想吃的菜名
  note       text not null default '',           -- 备注（口味、做法…）
  status     text not null default 'pending',    -- pending 待审核 / approved 已收录 / rejected 婉拒了
  member_id  uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

create index if not exists dish_requests_created_at_idx on public.dish_requests (created_at desc);

-- ---------- 权限：与既有表一致（邀请码模式，anon 可读写） ----------
alter table public.dish_requests enable row level security;

do $$
begin
  drop policy if exists "anon_all_dish_requests" on public.dish_requests;
  create policy "anon_all_dish_requests" on public.dish_requests for all to anon using (true) with check (true);
  drop policy if exists "auth_all_dish_requests" on public.dish_requests;
  create policy "auth_all_dish_requests" on public.dish_requests for all to authenticated using (true) with check (true);
end $$;

-- ---------- 实时订阅（她提交申请后后台立刻收到） ----------
do $$
begin
  begin
    alter publication supabase_realtime add table public.dish_requests;
  exception when others then
    null; -- 已经加过就忽略
  end;
end $$;
