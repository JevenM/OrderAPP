-- ============================================================
-- 情侣扫雷对局历史（0026）
-- 作用：
--   ① 一局通关时保存整份棋局快照（棋盘、踩雷任务记录、奖励、结果）；
--   ② 双方在扫雷模块的「对局历史」里回看每一局的过程、踩雷互动和结果。
-- 与飞行棋对局历史（0023）保持一致的权限与实时订阅范式。
-- ============================================================

create table if not exists public.couple_mines_history (
  id          uuid primary key default gen_random_uuid(),
  member_a    uuid not null references public.members (id) on delete cascade,
  member_b    uuid not null references public.members (id) on delete cascade,
  state       jsonb not null,      -- 终局快照：rows/cols/mineTotal/mines/cells/turn/log/hits/reward/cleared
  cleared     boolean not null default true,  -- 是否通关
  finished_at timestamptz not null default now(),
  constraint couple_mines_history_ordered check (member_a < member_b)
);

create index if not exists couple_mines_history_pair_idx
  on public.couple_mines_history (member_a, member_b, finished_at desc);

-- ---------- 权限：与既有互动表一致（邀请码模式，anon 可读写） ----------
alter table public.couple_mines_history enable row level security;

do $$
begin
  drop policy if exists "anon_all_couple_mines_history" on public.couple_mines_history;
  create policy "anon_all_couple_mines_history" on public.couple_mines_history for all to anon using (true) with check (true);
  drop policy if exists "auth_all_couple_mines_history" on public.couple_mines_history;
  create policy "auth_all_couple_mines_history" on public.couple_mines_history for all to authenticated using (true) with check (true);
end $$;

-- ---------- 实时订阅：一局结束落库后双方的历史列表即时刷新 ----------
do $$
begin
  begin
    alter publication supabase_realtime add table public.couple_mines_history;
  exception when others then
    null; -- 已经加过就忽略
  end;
end $$;

select count(*) as couple_mines_history from public.couple_mines_history;
