-- 情侣摆方（五福棋）对局历史
-- 一局正常结束（吃到剩 2 子 / 无路可走判负）或投降结束时，把整份棋局快照存档，供回看

-- 五福棋对局历史：成员 ID 使用 uuid，以匹配 public.members(id)。
create table if not exists public.couple_wufu_history (
  id text primary key,
  member_a uuid not null references public.members(id) on delete cascade,
  member_b uuid not null references public.members(id) on delete cascade,
  state jsonb not null,
  winner smallint not null,
  finished_at timestamptz not null default now()
);

alter table public.couple_wufu_history enable row level security;
drop policy if exists couple_wufu_history_select on public.couple_wufu_history;
create policy couple_wufu_history_select on public.couple_wufu_history
  for select to anon, authenticated using (true);
drop policy if exists couple_wufu_history_insert on public.couple_wufu_history;
create policy couple_wufu_history_insert on public.couple_wufu_history
  for insert to anon, authenticated with check (true);
alter table public.couple_wufu_history replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.couple_wufu_history;
exception when duplicate_object then null; when undefined_object then null;
end $$;
