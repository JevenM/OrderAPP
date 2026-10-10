-- 点菜小屋 · 同在检测：只保存双方当前短时位置，不保存轨迹
create table if not exists public.together_locations (
  member_id uuid primary key references public.members (id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  accuracy double precision not null default 0,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists together_locations_expires_idx on public.together_locations (expires_at);
alter table public.together_locations enable row level security;

do $$
begin
  drop policy if exists "anon_all_together_locations" on public.together_locations;
  create policy "anon_all_together_locations" on public.together_locations for all to anon using (true) with check (true);
  drop policy if exists "auth_all_together_locations" on public.together_locations;
  create policy "auth_all_together_locations" on public.together_locations for all to authenticated using (true) with check (true);
  begin
    alter publication supabase_realtime add table public.together_locations;
  exception when others then
    null;
  end;
end $$;
