-- 点菜小屋 · 同步抉择答题历史（0017）
-- 执行后，每次同步抉择会保留题目、双方答案和揭晓时间，管理员可查询导出。

create table if not exists public.couple_quiz_history (
  id uuid primary key default gen_random_uuid(),
  member_a uuid not null references public.members (id) on delete cascade,
  member_b uuid not null references public.members (id) on delete cascade,
  question_id text not null,
  question_title text not null,
  question_kind text not null,
  option_a text not null,
  option_b text not null,
  choice_a text,
  choice_b text,
  status text not null default 'answering' check (status in ('answering', 'revealed')),
  matched boolean,
  started_at timestamptz not null default now(),
  choice_a_at timestamptz,
  choice_b_at timestamptz,
  revealed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint couple_quiz_history_ordered_pair check (member_a < member_b),
  constraint couple_quiz_history_choice_a_valid check (choice_a is null or char_length(trim(choice_a)) between 1 and 120),
  constraint couple_quiz_history_choice_b_valid check (choice_b is null or char_length(trim(choice_b)) between 1 and 120)
);

alter table public.couple_quiz add column if not exists history_id uuid references public.couple_quiz_history (id) on delete set null;

create index if not exists couple_quiz_history_pair_idx
  on public.couple_quiz_history (member_a, member_b, created_at desc);
create index if not exists couple_quiz_history_created_idx
  on public.couple_quiz_history (created_at desc);

alter table public.couple_quiz_history enable row level security;
do $$
begin
  drop policy if exists "anon_all_couple_quiz_history" on public.couple_quiz_history;
  create policy "anon_all_couple_quiz_history" on public.couple_quiz_history for all to anon using (true) with check (true);
  drop policy if exists "auth_all_couple_quiz_history" on public.couple_quiz_history;
  create policy "auth_all_couple_quiz_history" on public.couple_quiz_history for all to authenticated using (true) with check (true);
exception when others then
  null;
end $$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.couple_quiz_history;
  exception when others then
    null;
  end;
end $$;
