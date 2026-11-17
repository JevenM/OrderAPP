-- 贪食蛇大作战：情侣得分排行榜（每对情侣一行，双方各自的历史最高分）
create table if not exists public.couple_snake_best (
  member_a uuid not null references public.members(id) on delete cascade,
  member_b uuid not null references public.members(id) on delete cascade,
  best_a int not null default 0,
  best_b int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (member_a, member_b),
  check (member_a < member_b)
);
alter table public.couple_snake_best enable row level security;
drop policy if exists couple_snake_best_read on public.couple_snake_best;
create policy couple_snake_best_read on public.couple_snake_best for select to anon, authenticated using (true);
drop policy if exists couple_snake_best_write on public.couple_snake_best;
create policy couple_snake_best_write on public.couple_snake_best for all to anon, authenticated using (true) with check (true);
