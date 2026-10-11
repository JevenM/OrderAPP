-- ============================================================
-- 情侣扫雷（0024）
-- 作用：
--   ① 双方轮流点开格子、标记疑似地雷，棋局实时同步；
--   ② 踩到地雷触发互动任务，全部安全格点开即通关并解锁奖励；
--   ③ 每对情侣同一时间只有一局（member_a < member_b 唯一），
--      结束本局时删除该行，不保留任何数据。
-- ============================================================

create table if not exists public.couple_mines (
  member_a   uuid not null references public.members (id) on delete cascade,
  member_b   uuid not null references public.members (id) on delete cascade,
  state      jsonb not null,
  updated_at timestamptz not null default now(),
  -- 必须是主键（不能只建唯一约束）：表加入 supabase_realtime 后 upsert 的冲突更新
  -- 属于 UPDATE，逻辑复制要求表有 replica identity（默认取主键），否则会报
  -- "cannot update table ... because it does not have a replica identity"
  primary key (member_a, member_b),
  constraint couple_mines_ordered check (member_a < member_b)
);

create index if not exists couple_mines_pair_idx on public.couple_mines (member_a, member_b, updated_at desc);

-- ---------- 权限：与既有互动表一致（邀请码模式，anon 可读写） ----------
alter table public.couple_mines enable row level security;

do $$
begin
  drop policy if exists "anon_all_couple_mines" on public.couple_mines;
  create policy "anon_all_couple_mines" on public.couple_mines for all to anon using (true) with check (true);
  drop policy if exists "auth_all_couple_mines" on public.couple_mines;
  create policy "auth_all_couple_mines" on public.couple_mines for all to authenticated using (true) with check (true);
end $$;

-- ---------- 实时订阅：对方点开格子 / 标记 / 通关时即时同步 ----------
do $$
begin
  begin
    alter publication supabase_realtime add table public.couple_mines;
  exception when others then
    null; -- 已经加过就忽略
  end;
end $$;

select count(*) as couple_mines from public.couple_mines;
