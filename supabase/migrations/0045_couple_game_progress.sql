-- 小游戏每日进度（按用户单独存）：2048 防沉迷已开局数、消消乐关卡解锁进度。
-- 之前进度只存 localStorage，退出登录 / 清缓存 / 换设备就丢了（表现为次数归零、回到第 1 关）。
-- 一行 = 一个用户在某对情侣下、某游戏、某一天的进度；跨天按 progress_day 自然分隔。
create table if not exists public.couple_game_progress (
  id uuid primary key default gen_random_uuid(),
  member_a uuid not null references public.members (id) on delete cascade,
  member_b uuid not null references public.members (id) on delete cascade,
  game text not null,
  progress_day date not null,
  owner_id uuid not null references public.members (id) on delete cascade,
  progress jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint couple_game_progress_ordered check (member_a < member_b)
);

create unique index if not exists couple_game_progress_uniq
  on public.couple_game_progress (member_a, member_b, game, progress_day, owner_id);

alter table public.couple_game_progress enable row level security;
do $$
begin
  drop policy if exists "anon_all_couple_game_progress" on public.couple_game_progress;
  create policy "anon_all_couple_game_progress" on public.couple_game_progress for all to anon using (true) with check (true);
  drop policy if exists "auth_all_couple_game_progress" on public.couple_game_progress;
  create policy "auth_all_couple_game_progress" on public.couple_game_progress for all to authenticated using (true) with check (true);
end $$;
