-- ============================================================
-- 情侣真心话大冒险记录（0021）
-- 作用：
--   ① 每次抽取的真心话/大冒险题目与回答落库，双方共享可见；
--   ② 真心话必须填写答案后提交，对方通过铃铛通知与互动空间历史知晓；
--   ③ 管理员可在后台查看每对情侣玩过的题目和答案。
-- ============================================================

create table if not exists public.couple_truth_dare (
  id          uuid primary key default gen_random_uuid(),
  member_a    uuid not null references public.members (id) on delete cascade,
  member_b    uuid not null references public.members (id) on delete cascade,
  sender_id   uuid not null references public.members (id) on delete cascade,
  sender_name text not null default '',
  type        text not null check (type in ('truth', 'dare')),  -- truth 真心话 / dare 大冒险
  prompt      text not null check (char_length(trim(prompt)) between 1 and 500),
  answer      text,                -- 真心话的回答；大冒险为空
  answered_at timestamptz,         -- 提交答案的时间
  created_at  timestamptz not null default now(),
  constraint couple_truth_dare_ordered check (member_a < member_b)
);

create index if not exists couple_truth_dare_pair_idx
  on public.couple_truth_dare (member_a, member_b, created_at desc);

-- ---------- 权限：与既有互动表一致（邀请码模式，anon 可读写） ----------
alter table public.couple_truth_dare enable row level security;

do $$
begin
  drop policy if exists "anon_all_couple_truth_dare" on public.couple_truth_dare;
  create policy "anon_all_couple_truth_dare" on public.couple_truth_dare for all to anon using (true) with check (true);
  drop policy if exists "auth_all_couple_truth_dare" on public.couple_truth_dare;
  create policy "auth_all_couple_truth_dare" on public.couple_truth_dare for all to authenticated using (true) with check (true);
end $$;

-- ---------- 实时订阅：对方提交答案后双方列表即时刷新 ----------
do $$
begin
  begin
    alter publication supabase_realtime add table public.couple_truth_dare;
  exception when others then
    null; -- 已经加过就忽略
  end;
end $$;

select count(*) as couple_truth_dare from public.couple_truth_dare;
