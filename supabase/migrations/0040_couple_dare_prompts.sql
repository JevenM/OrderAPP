-- 情侣大冒险自定义题库
-- 与 couple_truth_prompts 同口径：created_by 记录出题人，
-- 抽题时「自己出的题只给对方抽」，所以归属不能被覆盖。
create table if not exists public.couple_dare_prompts (
  id uuid primary key default gen_random_uuid(),
  member_a uuid not null references public.members (id) on delete cascade,
  member_b uuid not null references public.members (id) on delete cascade,
  prompt text not null check (char_length(trim(prompt)) between 1 and 300),
  created_by uuid not null references public.members (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint couple_dare_prompts_ordered check (member_a < member_b),
  constraint couple_dare_prompts_unique unique (member_a, member_b, prompt)
);

create index if not exists couple_dare_prompts_pair_idx
  on public.couple_dare_prompts (member_a, member_b, created_at desc);

alter table public.couple_dare_prompts enable row level security;
do $$
begin
  drop policy if exists "anon_all_couple_dare_prompts" on public.couple_dare_prompts;
  create policy "anon_all_couple_dare_prompts" on public.couple_dare_prompts for all to anon using (true) with check (true);
  drop policy if exists "auth_all_couple_dare_prompts" on public.couple_dare_prompts;
  create policy "auth_all_couple_dare_prompts" on public.couple_dare_prompts for all to authenticated using (true) with check (true);
end $$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.couple_dare_prompts;
  exception when others then null;
  end;
end $$;
