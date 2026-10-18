-- 备婚流程：每对情侣一行，state 存已完成步骤与勾好的待办
create table if not exists public.couple_wedding (
  member_a uuid not null references public.members(id) on delete cascade,
  member_b uuid not null references public.members(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (member_a, member_b),
  check (member_a < member_b)
);

alter table public.couple_wedding enable row level security;
drop policy if exists couple_wedding_read on public.couple_wedding;
create policy couple_wedding_read on public.couple_wedding for select to anon, authenticated using (true);
drop policy if exists couple_wedding_write on public.couple_wedding;
create policy couple_wedding_write on public.couple_wedding for all to anon, authenticated using (true) with check (true);

alter table public.couple_wedding replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.couple_wedding;
exception when duplicate_object then null; when undefined_object then null; end $$;
