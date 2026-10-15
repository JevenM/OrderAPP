-- 刮刮乐：每对一张进行中的刮刮乐卡（谁刮开都可见），state 存卡面与历史
create table if not exists public.couple_scratch (
  member_a uuid not null references public.members(id) on delete cascade,
  member_b uuid not null references public.members(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (member_a, member_b),
  check (member_a < member_b)
);
alter table public.couple_scratch enable row level security;
drop policy if exists couple_scratch_read on public.couple_scratch;
create policy couple_scratch_read on public.couple_scratch for select to anon, authenticated using (true);
drop policy if exists couple_scratch_write on public.couple_scratch;
create policy couple_scratch_write on public.couple_scratch for all to anon, authenticated using (true) with check (true);
alter table public.couple_scratch replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.couple_scratch;
exception when duplicate_object then null; when undefined_object then null;
end $$;
