-- ============================================================
-- 情侣联网飞行棋（0022）
-- 作用：
--   ① 每对情侣一行的共享棋局（棋盘格、双方位置、回合、骰子、日志）；
--   ② 双方各在自己的设备上轮流掷骰，状态实时同步；
--   ③ 棋盘每个格子的内容来自任务/前进/后退/暂停/重摇/真心话/大冒险等格子池。
-- ============================================================

create table if not exists public.couple_board_games (
  member_a   uuid not null references public.members (id) on delete cascade,
  member_b   uuid not null references public.members (id) on delete cascade,
  state      jsonb not null,      -- 棋局快照：size/stepMin/stepMax/cells/positions/turn/paused/dice/log/winner/pending
  updated_at timestamptz not null default now(),
  primary key (member_a, member_b),
  constraint couple_board_games_ordered check (member_a < member_b)
);

-- ---------- 权限：与既有互动表一致（邀请码模式，anon 可读写） ----------
alter table public.couple_board_games enable row level security;

do $$
begin
  drop policy if exists "anon_all_couple_board_games" on public.couple_board_games;
  create policy "anon_all_couple_board_games" on public.couple_board_games for all to anon using (true) with check (true);
  drop policy if exists "auth_all_couple_board_games" on public.couple_board_games;
  create policy "auth_all_couple_board_games" on public.couple_board_games for all to authenticated using (true) with check (true);
end $$;

-- ---------- 实时订阅：对方掷骰后棋局即时同步 ----------
do $$
begin
  begin
    alter publication supabase_realtime add table public.couple_board_games;
  exception when others then
    null; -- 已经加过就忽略
  end;
end $$;

select count(*) as couple_board_games from public.couple_board_games;
