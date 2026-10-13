-- 五子棋实时对局
create table if not exists public.couple_gomoku (
  member_a uuid not null references public.members(id) on delete cascade,
  member_b uuid not null references public.members(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (member_a, member_b),
  check (member_a < member_b)
);
alter table public.couple_gomoku enable row level security;
drop policy if exists couple_gomoku_read on public.couple_gomoku;
create policy couple_gomoku_read on public.couple_gomoku for select to anon, authenticated using (true);
drop policy if exists couple_gomoku_write on public.couple_gomoku;
create policy couple_gomoku_write on public.couple_gomoku for all to anon, authenticated using (true) with check (true);

create table if not exists public.couple_gomoku_history (
  id uuid primary key default gen_random_uuid(),
  member_a uuid not null references public.members(id) on delete cascade,
  member_b uuid not null references public.members(id) on delete cascade,
  state jsonb not null,
  winner smallint not null check (winner in (0, 1)),
  finished_at timestamptz not null default now()
);
create index if not exists couple_gomoku_history_pair_idx
  on public.couple_gomoku_history (member_a, member_b, finished_at desc);
alter table public.couple_gomoku_history enable row level security;
drop policy if exists couple_gomoku_history_read on public.couple_gomoku_history;
create policy couple_gomoku_history_read on public.couple_gomoku_history for select to anon, authenticated using (true);
drop policy if exists couple_gomoku_history_write on public.couple_gomoku_history;
create policy couple_gomoku_history_write on public.couple_gomoku_history for all to anon, authenticated using (true) with check (true);

alter table public.couple_gomoku replica identity full;
alter table public.couple_gomoku_history replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.couple_gomoku;
exception when duplicate_object then null; when undefined_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.couple_gomoku_history;
exception when duplicate_object then null; when undefined_object then null;
end $$;