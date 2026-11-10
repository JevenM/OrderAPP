-- 离线小游戏成绩榜（星尘 2048 / 动物世界消消乐）
-- 游戏本身是单机玩法（不联网对局），但每局结束要把成绩落一行，双方就能看到彼此的历史最高分。
create table if not exists public.couple_game_scores (
  id uuid primary key default gen_random_uuid(),
  member_a uuid not null references public.members(id) on delete cascade,
  member_b uuid not null references public.members(id) on delete cascade,
  -- 'star2048' | 'animalmatch'
  game text not null,
  player_id uuid not null references public.members(id) on delete cascade,
  score integer not null,
  -- 这一局的关键信息，如「6×6 · 128 步」「第 2 关 · 通关」
  detail text not null default '',
  created_at timestamptz not null default now(),
  check (member_a < member_b)
);

create index if not exists couple_game_scores_rank_idx
  on public.couple_game_scores (member_a, member_b, game, score desc, created_at asc);

alter table public.couple_game_scores enable row level security;
drop policy if exists couple_game_scores_read on public.couple_game_scores;
create policy couple_game_scores_read on public.couple_game_scores for select to anon, authenticated using (true);
drop policy if exists couple_game_scores_write on public.couple_game_scores;
create policy couple_game_scores_write on public.couple_game_scores for all to anon, authenticated using (true) with check (true);

alter table public.couple_game_scores replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.couple_game_scores;
exception when duplicate_object then null; when undefined_object then null;
end $$;
