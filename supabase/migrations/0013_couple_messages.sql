-- ============================================================
-- 点菜小屋 · 互动空间甜蜜聊天（0013）
-- 用法：Supabase 控制台 → SQL Editor → 粘贴执行（可重复执行）
-- 规则：
--   一对好友之间的甜蜜聊天记录（纯文字与表情），双方均可读写；
--   支持 Supabase 实时通道订阅和前台拉取。
-- ============================================================

create table if not exists public.couple_messages (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null references public.members (id) on delete cascade,
  receiver_id  uuid not null references public.members (id) on delete cascade,
  content      text not null,
  created_at   timestamptz not null default now(),
  constraint couple_messages_no_self check (sender_id <> receiver_id)
);

create index if not exists couple_messages_pair_idx
  on public.couple_messages (
    case when sender_id < receiver_id then sender_id else receiver_id end,
    case when sender_id < receiver_id then receiver_id else sender_id end,
    created_at
  );

create index if not exists couple_messages_sender_idx on public.couple_messages (sender_id);
create index if not exists couple_messages_receiver_idx on public.couple_messages (receiver_id);

alter table public.couple_messages enable row level security;

do $$
begin
  drop policy if exists "anon_all_couple_messages" on public.couple_messages;
  create policy "anon_all_couple_messages" on public.couple_messages for all to anon using (true) with check (true);
  drop policy if exists "auth_all_couple_messages" on public.couple_messages;
  create policy "auth_all_couple_messages" on public.couple_messages for all to authenticated using (true) with check (true);
end $$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.couple_messages;
  exception when others then
    null;
  end;
end $$;
