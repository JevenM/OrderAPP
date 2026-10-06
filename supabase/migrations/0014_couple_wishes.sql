-- ============================================================
-- 点菜小屋 · 互动空间秘密心愿池（0014）
-- 心愿以好友双方为维度持久化保存，刷新或换设备后仍可恢复。
-- ============================================================

create table if not exists public.couple_wishes (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.members (id) on delete cascade,
  member_a     uuid not null references public.members (id) on delete cascade,
  member_b     uuid not null references public.members (id) on delete cascade,
  text         text not null,
  level        text not null default '轻松' check (level in ('轻松', '认真', '挑战')),
  owner_name   text not null default '我',
  created_at   timestamptz not null default now(),
  constraint couple_wishes_no_self check (member_a <> member_b),
  constraint couple_wishes_ordered_pair check (member_a < member_b)
);

create index if not exists couple_wishes_pair_idx
  on public.couple_wishes (member_a, member_b, created_at);

create index if not exists couple_wishes_owner_idx
  on public.couple_wishes (owner_id, created_at);

alter table public.couple_wishes enable row level security;

do $$
begin
  drop policy if exists "anon_all_couple_wishes" on public.couple_wishes;
  create policy "anon_all_couple_wishes" on public.couple_wishes for all to anon using (true) with check (true);
  drop policy if exists "auth_all_couple_wishes" on public.couple_wishes;
  create policy "auth_all_couple_wishes" on public.couple_wishes for all to authenticated using (true) with check (true);
end $$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.couple_wishes;
  exception when others then
    null;
  end;
end $$;
