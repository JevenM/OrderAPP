-- ============================================================
-- 情侣飞行棋对局历史（0023）
-- 作用：
--   ① 一局结束时保存整份棋局快照（棋盘、每步掷骰与事件日志、最终位置、胜负）；
--   ② 双方在飞行棋模块的「对局历史」里回看每一局的过程、输出信息和结果。
-- ============================================================

create table if not exists public.couple_board_game_history (
  id          uuid primary key default gen_random_uuid(),
  member_a    uuid not null references public.members (id) on delete cascade,
  member_b    uuid not null references public.members (id) on delete cascade,
  state       jsonb not null,      -- 终局快照：size/stepMin/stepMax/cells/positions/log 等
  winner      smallint not null check (winner in (0, 1)),  -- 0 = member_a（红棋），1 = member_b（蓝棋）
  finished_at timestamptz not null default now(),
  constraint couple_board_game_history_ordered check (member_a < member_b)
);

create index if not exists couple_board_game_history_pair_idx
  on public.couple_board_game_history (member_a, member_b, finished_at desc);

-- ---------- 权限：与既有互动表一致（邀请码模式，anon 可读写） ----------
alter table public.couple_board_game_history enable row level security;

do $$
begin
  drop policy if exists "anon_all_couple_board_game_history" on public.couple_board_game_history;
  create policy "anon_all_couple_board_game_history" on public.couple_board_game_history for all to anon using (true) with check (true);
  drop policy if exists "auth_all_couple_board_game_history" on public.couple_board_game_history;
  create policy "auth_all_couple_board_game_history" on public.couple_board_game_history for all to authenticated using (true) with check (true);
end $$;

-- ---------- 实时订阅：一局结束落库后双方的历史列表即时刷新 ----------
do $$
begin
  begin
    alter publication supabase_realtime add table public.couple_board_game_history;
  exception when others then
    null; -- 已经加过就忽略
  end;
end $$;

select count(*) as couple_board_game_history from public.couple_board_game_history;
