-- 重要日倒计时：每对一行，state 存自定义的重要日期列表
create table if not exists public.couple_countdown (
  member_a uuid not null references public.members(id) on delete cascade,
  member_b uuid not null references public.members(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (member_a, member_b),
  check (member_a < member_b)
);
alter table public.couple_countdown enable row level security;
drop policy if exists couple_countdown_read on public.couple_countdown;
create policy couple_countdown_read on public.couple_countdown for select to anon, authenticated using (true);
drop policy if exists couple_countdown_write on public.couple_countdown;
create policy couple_countdown_write on public.couple_countdown for all to anon, authenticated using (true) with check (true);
alter table public.couple_countdown replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.couple_countdown;
exception when duplicate_object then null; when undefined_object then null;
end $$;
