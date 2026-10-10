-- 管理端同步抉择题库与每对成员可抽题目配置
create table if not exists public.couple_quiz_questions (
  id text primary key default gen_random_uuid()::text,
  title text not null check (char_length(trim(title)) between 1 and 160),
  option_a text not null check (char_length(trim(option_a)) between 1 and 160),
  option_b text not null check (char_length(trim(option_b)) between 1 and 160),
  kind text not null check (kind in ('轻松版', '走心版')),
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.couple_quiz_bank_state (
  id boolean primary key default true check (id),
  seeded_at timestamptz not null default now()
);

create table if not exists public.couple_quiz_pair_questions (
  member_a uuid not null references public.members (id) on delete cascade,
  member_b uuid not null references public.members (id) on delete cascade,
  question_ids text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (member_a, member_b),
  constraint couple_quiz_pair_questions_ordered check (member_a < member_b)
);

create index if not exists couple_quiz_questions_enabled_order_idx
  on public.couple_quiz_questions (enabled, sort_order, created_at);

alter table public.couple_quiz_questions enable row level security;
alter table public.couple_quiz_bank_state enable row level security;
alter table public.couple_quiz_pair_questions enable row level security;

do $$
begin
  drop policy if exists "anon_all_couple_quiz_questions" on public.couple_quiz_questions;
  create policy "anon_all_couple_quiz_questions" on public.couple_quiz_questions for all to anon using (true) with check (true);
  drop policy if exists "auth_all_couple_quiz_questions" on public.couple_quiz_questions;
  create policy "auth_all_couple_quiz_questions" on public.couple_quiz_questions for all to authenticated using (true) with check (true);
  drop policy if exists "anon_all_couple_quiz_bank_state" on public.couple_quiz_bank_state;
  create policy "anon_all_couple_quiz_bank_state" on public.couple_quiz_bank_state for all to anon using (true) with check (true);
  drop policy if exists "auth_all_couple_quiz_bank_state" on public.couple_quiz_bank_state;
  create policy "auth_all_couple_quiz_bank_state" on public.couple_quiz_bank_state for all to authenticated using (true) with check (true);
  drop policy if exists "anon_all_couple_quiz_pair_questions" on public.couple_quiz_pair_questions;
  create policy "anon_all_couple_quiz_pair_questions" on public.couple_quiz_pair_questions for all to anon using (true) with check (true);
  drop policy if exists "auth_all_couple_quiz_pair_questions" on public.couple_quiz_pair_questions;
  create policy "auth_all_couple_quiz_pair_questions" on public.couple_quiz_pair_questions for all to authenticated using (true) with check (true);
end $$;
