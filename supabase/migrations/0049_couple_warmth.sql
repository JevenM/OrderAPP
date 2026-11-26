-- 关系温度计 / 共建目标 / 逐菜评分（v2.2.0）
-- 说明：
--   关系温度计只读现有 meals / couple_messages / couple_*_history / couple_wishes /
--   couple_truth_dare / orders / posts，不需要新表；本文件只建「逐菜评分」与「共建目标」两张表。
--   所有语句可重复执行。执行位置：Supabase 控制台 SQL Editor。

-- ---------------------------------------------------------------- 逐菜评分
-- 为什么不加在 orders 上：一单多菜无法区分。
-- 为什么不加在 order_items 上：db.updateOrder 是「先删明细再重插」，任何一次编辑订单
-- 都会抹掉全部评分，且明细行 id 会变。所以独立成表，用 (order_id, dish_name, rater_id)
-- 做唯一键，dish_name 是下单时的名称快照，明细重插不影响评分。
create table if not exists public.couple_dish_ratings (
  id            uuid primary key default gen_random_uuid(),
  member_a      uuid not null references public.members(id) on delete cascade,
  member_b      uuid not null references public.members(id) on delete cascade,
  order_id      uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete set null,
  dish_name     text not null,
  rating        smallint not null check (rating between 1 and 5),
  rater_id      uuid not null references public.members(id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint couple_dish_ratings_ordered       check (member_a < member_b),
  constraint couple_dish_ratings_rater_in_pair check (rater_id in (member_a, member_b)),
  constraint couple_dish_ratings_name_len      check (char_length(btrim(dish_name)) between 1 and 60)
);

-- upsert 的冲突目标：同一单、同一道菜、同一个人只有一条评分（改分即覆盖）
create unique index if not exists couple_dish_ratings_unique_idx
  on public.couple_dish_ratings (order_id, dish_name, rater_id);
-- 常点榜按 pair + 菜名聚合平均分
create index if not exists couple_dish_ratings_pair_dish_idx
  on public.couple_dish_ratings (member_a, member_b, dish_name);

alter table public.couple_dish_ratings enable row level security;
drop policy if exists couple_dish_ratings_read on public.couple_dish_ratings;
create policy couple_dish_ratings_read on public.couple_dish_ratings for select to anon, authenticated using (true);
drop policy if exists couple_dish_ratings_write on public.couple_dish_ratings;
create policy couple_dish_ratings_write on public.couple_dish_ratings for all to anon, authenticated using (true) with check (true);

-- ---------------------------------------------------------------- 共建目标
-- 一个目标一行。不做「一对情侣一行 + jsonb 数组」：打卡/加钱都是针对某一个目标的写操作，
-- 逐行更新冲突面最小，也避开 mutateWedding 那种「整块读改写把别人刚改的抹掉」的风险。
-- 习惯型目标的打卡日期存在 checkins 里（YYYY-MM-DD 数组），连续天数在前端算。
create table if not exists public.couple_goals (
  id         uuid primary key default gen_random_uuid(),
  member_a   uuid not null references public.members(id) on delete cascade,
  member_b   uuid not null references public.members(id) on delete cascade,
  title      text not null check (char_length(btrim(title)) between 1 and 40),
  kind       text not null check (kind in ('save', 'travel', 'habit', 'custom')),
  emoji      text not null default '🎯',
  target     numeric(12, 2),
  current    numeric(12, 2) not null default 0,
  unit       text not null default '',
  deadline   date,
  checkins   jsonb not null default '[]'::jsonb,
  note       text not null default '',
  status     text not null default 'active' check (status in ('active', 'done', 'archived')),
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint couple_goals_ordered        check (member_a < member_b),
  constraint couple_goals_checkins_array check (jsonb_typeof(checkins) = 'array'),
  constraint couple_goals_target_positive check (target is null or target > 0)
);

create index if not exists couple_goals_pair_idx
  on public.couple_goals (member_a, member_b, status, created_at desc);

alter table public.couple_goals enable row level security;
drop policy if exists couple_goals_read on public.couple_goals;
create policy couple_goals_read on public.couple_goals for select to anon, authenticated using (true);
drop policy if exists couple_goals_write on public.couple_goals;
create policy couple_goals_write on public.couple_goals for all to anon, authenticated using (true) with check (true);

-- ---------------------------------------------------------------- realtime 推送
-- 评分要立刻反映到对方 / 常点榜；目标要双端同步
alter table public.couple_dish_ratings replica identity full;
alter table public.couple_goals replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.couple_dish_ratings;
exception when duplicate_object then null; when undefined_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.couple_goals;
exception when duplicate_object then null; when undefined_object then null;
end $$;
