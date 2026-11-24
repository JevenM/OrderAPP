-- ============================================================
-- 点菜小屋 · 历史记录归属回填（0048，可选执行）
-- 用法：Supabase 控制台 → SQL Editor → 粘贴执行（可重复执行）
--
-- 背景：
--   meals / posts / orders 三张表没有「情侣对」字段，唯一归属依据是 member_id。
--   0002 迁移才加上 member_id，之前写入的早期记录该列为空。
--   多对情侣共用时，无法判定归属的空记录既不能算给任何一对（否则串数据），
--   也不该让老用户丢掉自己的历史统计。
--
-- 本脚本只在「系统中恰好只有一对已绑定关系」时回填：此时归属唯一、没有歧义，
--   把所有 member_id 为空的历史记录归给这一对中的一位，统计口径（两人合计）不受影响。
--   若已有两对及以上绑定关系，脚本会跳过并给出提示，避免把 A 的数据错给 B。
--
-- 新写入的记录一律带 member_id（见 MealLogPage / publishMealPost / createOrder），
--   因此不执行本脚本也不影响新功能的隔离性，只是早期记录不计入统计。
-- ============================================================

do $$
declare
  pair_count int;
  owner_id   uuid;
  meals_n    int;
  posts_n    int;
  orders_n   int;
begin
  select count(*) into pair_count
    from public.friendships
   where status = 'accepted';

  if pair_count <> 1 then
    raise notice '当前有 % 对已绑定关系，无法唯一判定历史无归属记录的归属，跳过回填。', pair_count;
    return;
  end if;

  select least(requester_id, addressee_id) into owner_id
    from public.friendships
   where status = 'accepted'
   limit 1;

  update public.meals  set member_id = owner_id where member_id is null;
  get diagnostics meals_n = row_count;

  -- 只回填「她」的美食动态；author = 'me' 是管理员发的全站内容，不归给任何一对
  update public.posts  set member_id = owner_id where member_id is null and author <> 'me';
  get diagnostics posts_n = row_count;

  update public.orders set member_id = owner_id where member_id is null;
  get diagnostics orders_n = row_count;

  raise notice '回填完成：meals % 条、posts % 条、orders % 条，归属成员 %', meals_n, posts_n, orders_n, owner_id;
end $$;

-- 按成员 + 日期查报告时的复合索引（周期报告、年度统计都走这个条件）
create index if not exists meals_member_day_idx on public.meals (member_id, day);
create index if not exists posts_member_created_idx on public.posts (member_id, created_at desc);
