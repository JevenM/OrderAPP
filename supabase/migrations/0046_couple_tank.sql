-- 坦克大战（同种子竞速）对局与战绩
create table if not exists public.couple_tank (
  member_a uuid not null references public.members(id) on delete cascade,
  member_b uuid not null references public.members(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (member_a, member_b),
  check (member_a < member_b)
);
alter table public.couple_tank enable row level security;
drop policy if exists couple_tank_read on public.couple_tank;
create policy couple_tank_read on public.couple_tank for select to anon, authenticated using (true);
drop policy if exists couple_tank_write on public.couple_tank;
create policy couple_tank_write on public.couple_tank for all to anon, authenticated using (true) with check (true);

create table if not exists public.couple_tank_history (
  id uuid primary key default gen_random_uuid(),
  member_a uuid not null references public.members(id) on delete cascade,
  member_b uuid not null references public.members(id) on delete cascade,
  state jsonb not null,
  winner text not null check (winner in ('a', 'b', 'draw')),
  finished_at timestamptz not null default now()
);
create index if not exists couple_tank_history_pair_idx
  on public.couple_tank_history (member_a, member_b, finished_at desc);
alter table public.couple_tank_history enable row level security;
drop policy if exists couple_tank_history_read on public.couple_tank_history;
create policy couple_tank_history_read on public.couple_tank_history for select to anon, authenticated using (true);
drop policy if exists couple_tank_history_write on public.couple_tank_history;
create policy couple_tank_history_write on public.couple_tank_history for all to anon, authenticated using (true) with check (true);

-- realtime 推送：对局行 UPDATE 时对方立刻看到进度
alter table public.couple_tank replica identity full;
alter table public.couple_tank_history replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.couple_tank;
exception when duplicate_object then null; when undefined_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.couple_tank_history;
exception when duplicate_object then null; when undefined_object then null;
end $$;
