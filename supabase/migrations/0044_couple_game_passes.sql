-- 小游戏防沉迷加时申请：每日局数用完后，完成大冒险任务并由情侣另一方确认，才能多玩一局。
-- 双方共享一对情侣的申请记录；realtime 推送让申请方不用刷新就能看到确认结果。
create table if not exists public.couple_game_passes (
  id uuid primary key default gen_random_uuid(),
  member_a uuid not null references public.members (id) on delete cascade,
  member_b uuid not null references public.members (id) on delete cascade,
  game text not null,
  requester_id uuid not null references public.members (id) on delete cascade,
  task text not null check (char_length(trim(task)) between 1 and 300),
  status text not null default 'pending' check (status in ('pending', 'confirmed')),
  confirmed_by uuid references public.members (id) on delete set null,
  play_day date not null default current_date,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  constraint couple_game_passes_ordered check (member_a < member_b)
);

create index if not exists couple_game_passes_pair_idx
  on public.couple_game_passes (member_a, member_b, game, play_day, created_at desc);

alter table public.couple_game_passes enable row level security;
do $$
begin
  drop policy if exists "anon_all_couple_game_passes" on public.couple_game_passes;
  create policy "anon_all_couple_game_passes" on public.couple_game_passes for all to anon using (true) with check (true);
  drop policy if exists "auth_all_couple_game_passes" on public.couple_game_passes;
  create policy "auth_all_couple_game_passes" on public.couple_game_passes for all to authenticated using (true) with check (true);
end $$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.couple_game_passes;
  exception when others then null;
  end;
end $$;
