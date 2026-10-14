create table if not exists public.couple_dice_games (
  member_a uuid not null references public.members(id) on delete cascade,
  member_b uuid not null references public.members(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (member_a, member_b),
  check (member_a < member_b)
);

alter table public.couple_dice_games enable row level security;
create policy "couple_dice_games_read" on public.couple_dice_games for select using (true);
create policy "couple_dice_games_write" on public.couple_dice_games for all using (true) with check (true);

create table if not exists public.couple_dice_history (
  id uuid primary key default gen_random_uuid(),
  member_a uuid not null references public.members(id) on delete cascade,
  member_b uuid not null references public.members(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  finished_at timestamptz not null default now(),
  check (member_a < member_b)
);

create index if not exists couple_dice_history_pair_idx
  on public.couple_dice_history (member_a, member_b, finished_at desc);

alter table public.couple_dice_history enable row level security;
create policy "couple_dice_history_read" on public.couple_dice_history for select using (true);
create policy "couple_dice_history_write" on public.couple_dice_history for all using (true) with check (true);

alter table public.couple_dice_games replica identity full;
alter table public.couple_dice_history replica identity full;

do $$ begin
  alter publication supabase_realtime add table public.couple_dice_games;
exception when duplicate_object then null; when undefined_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.couple_dice_history;
exception when duplicate_object then null; when undefined_object then null;
end $$;
