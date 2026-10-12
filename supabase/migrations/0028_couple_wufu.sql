-- ============================================================
-- 情侣摆方（五福棋 / 五棍棋，0028）
-- 作用：
--   ① 双方在 5×5 = 25 个落子点上对弈：摆子 → 成项提子 → 走子；
--   ② 棋局状态实时同步，每对情侣同一时间只有一局（member_a < member_b 唯一）；
--   ③ 结束本局时删除该行，不保留任何数据。
-- 与情侣扫雷（0024）保持一致的权限与实时订阅范式。
-- ============================================================

create table if not exists public.couple_wufu (
  member_a   uuid not null references public.members (id) on delete cascade,
  member_b   uuid not null references public.members (id) on delete cascade,
  state      jsonb not null,          -- board/phase/firstMover/turn/placed/capturedInPlace/pendingCaptures/log/winner
  updated_at timestamptz not null default now(),
  -- 必须是主键（不能只建唯一约束）：表加入 supabase_realtime 后 upsert 的冲突更新
  -- 属于 UPDATE，逻辑复制要求表有 replica identity（默认取主键），否则会报
  -- "cannot update table ... because it does not have a replica identity"
  primary key (member_a, member_b),
  constraint couple_wufu_ordered check (member_a < member_b)
);

create index if not exists couple_wufu_pair_idx on public.couple_wufu (member_a, member_b, updated_at desc);

-- ---------- 权限：与既有互动表一致（邀请码模式，anon 可读写） ----------
alter table public.couple_wufu enable row level security;

do $$
begin
  drop policy if exists "anon_all_couple_wufu" on public.couple_wufu;
  create policy "anon_all_couple_wufu" on public.couple_wufu for all to anon using (true) with check (true);
  drop policy if exists "auth_all_couple_wufu" on public.couple_wufu;
  create policy "auth_all_couple_wufu" for all to authenticated using (true) with check (true);
end $$;

-- ---------- 实时订阅：对方摆子 / 提子 / 走子时即时同步 ----------
do $$
begin
  begin
    alter publication supabase_realtime add table public.couple_wufu;
  exception when others then
    null; -- 已经加过就忽略
  end;
end $$;

select count(*) as couple_wufu from public.couple_wufu;
