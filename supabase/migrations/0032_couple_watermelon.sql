-- 西瓜积分与变更记录
create table if not exists public.couple_watermelon_scores (
  member_a uuid not null references public.members(id) on delete cascade,
  member_b uuid not null references public.members(id) on delete cascade,
  score_a integer not null default 0,
  score_b integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (member_a, member_b),
  check (member_a < member_b)
);
alter table public.couple_watermelon_scores enable row level security;
drop policy if exists couple_watermelon_scores_read on public.couple_watermelon_scores;
create policy couple_watermelon_scores_read on public.couple_watermelon_scores for select to anon, authenticated using (true);
drop policy if exists couple_watermelon_scores_write on public.couple_watermelon_scores;
create policy couple_watermelon_scores_write on public.couple_watermelon_scores for all to anon, authenticated using (true) with check (true);

create table if not exists public.couple_watermelon_logs (
  id uuid primary key default gen_random_uuid(),
  member_a uuid not null references public.members(id) on delete cascade,
  member_b uuid not null references public.members(id) on delete cascade,
  target_member uuid not null references public.members(id) on delete cascade,
  delta integer not null check (delta between -100 and 100),
  reason text not null default '',
  sender_id uuid not null references public.members(id) on delete cascade,
  sender_name text not null default '',
  created_at timestamptz not null default now(),
  check (member_a < member_b),
  check (target_member in (member_a, member_b)),
  check (sender_id in (member_a, member_b))
);
create index if not exists couple_watermelon_logs_pair_idx
  on public.couple_watermelon_logs (member_a, member_b, created_at desc);
alter table public.couple_watermelon_logs enable row level security;
drop policy if exists couple_watermelon_logs_read on public.couple_watermelon_logs;
create policy couple_watermelon_logs_read on public.couple_watermelon_logs for select to anon, authenticated using (true);
drop policy if exists couple_watermelon_logs_write on public.couple_watermelon_logs;
create policy couple_watermelon_logs_write on public.couple_watermelon_logs for all to anon, authenticated using (true) with check (true);

alter table public.couple_watermelon_scores replica identity full;
alter table public.couple_watermelon_logs replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.couple_watermelon_scores;
exception when duplicate_object then null; when undefined_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.couple_watermelon_logs;
exception when duplicate_object then null; when undefined_object then null;
end $$;