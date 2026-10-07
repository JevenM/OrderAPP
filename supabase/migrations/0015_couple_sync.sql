-- ============================================================
-- 点菜小屋 · 互动空间双人同步（0015）
-- 用法：Supabase 控制台 → SQL Editor → 粘贴执行（可重复执行）
-- 规则：
--   1. couple_events：好友对共享的追加式互动日志（心愿新增、抽签结果等），
--      双方均可读写；对方离线时事件已落库，回来后可回放，不再丢失。
--   2. couple_quiz：每对好友一行的「同步抉择」会话：
--      当前题目 + 双方各自选择；换题 = 覆盖重置；双方都提交后 status = revealed。
--   两张表都加入 supabase_realtime 发布，配合前台实时订阅实现双人同步。
-- ============================================================

create table if not exists public.couple_events (
  id         uuid primary key default gen_random_uuid(),
  member_a   uuid not null references public.members (id) on delete cascade,
  member_b   uuid not null references public.members (id) on delete cascade,
  sender_id  uuid not null references public.members (id) on delete cascade,
  type       text not null,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint couple_events_ordered_pair check (member_a < member_b)
);

create index if not exists couple_events_pair_idx
  on public.couple_events (member_a, member_b, created_at desc);

create table if not exists public.couple_quiz (
  member_a   uuid not null references public.members (id) on delete cascade,
  member_b   uuid not null references public.members (id) on delete cascade,
  question   jsonb,
  choice_a   text,
  choice_b   text,
  status     text not null default 'answering' check (status in ('answering', 'revealed')),
  updated_at timestamptz not null default now(),
  primary key (member_a, member_b),
  constraint couple_quiz_ordered_pair check (member_a < member_b),
  constraint couple_quiz_choice_a_valid check (choice_a in ('A', 'B') or choice_a is null),
  constraint couple_quiz_choice_b_valid check (choice_b in ('A', 'B') or choice_b is null)
);

alter table public.couple_events enable row level security;
alter table public.couple_quiz enable row level security;

do $$
begin
  drop policy if exists "anon_all_couple_events" on public.couple_events;
  create policy "anon_all_couple_events" on public.couple_events for all to anon using (true) with check (true);
  drop policy if exists "auth_all_couple_events" on public.couple_events;
  create policy "auth_all_couple_events" on public.couple_events for all to authenticated using (true) with check (true);

  drop policy if exists "anon_all_couple_quiz" on public.couple_quiz;
  create policy "anon_all_couple_quiz" on public.couple_quiz for all to anon using (true) with check (true);
  drop policy if exists "auth_all_couple_quiz" on public.couple_quiz for all to authenticated using (true) with check (true);
end $$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.couple_events;
  exception when others then
    null;
  end;
  begin
    alter publication supabase_realtime add table public.couple_quiz;
  exception when others then
    null;
  end;
end $$;
