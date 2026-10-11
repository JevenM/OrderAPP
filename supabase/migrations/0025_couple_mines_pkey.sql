-- ============================================================
-- 修复情侣扫雷表 replica identity（0025）
-- 问题：
--   0024 建表时 couple_mines 只有唯一约束、没有主键；
--   表加入 supabase_realtime 发布后，upsert 的冲突更新属于 UPDATE，
--   PostgreSQL 逻辑复制要求被发布的表有 replica identity（默认取主键），
--   于是报错：cannot update table "couple_mines" because it does not
--   have a replica identity and publishes updates。
-- 修复：
--   把唯一约束换成复合主键（与 couple_board_games 等互动表保持一致）。
--   幂等设计：已在 0024 修正后建的新库重复执行也不会报错。
-- ============================================================

-- 旧库：先移除唯一约束（新库由修正后的 0024 直接建主键，这里删不到也不报错）
alter table public.couple_mines drop constraint if exists couple_mines_pair_unique;

-- 补主键：若已存在（新库）则静默跳过
do $$
begin
  alter table public.couple_mines add constraint couple_mines_pkey primary key (member_a, member_b);
exception when others then
  null;
end $$;

select constraint_name, constraint_type
from information_schema.table_constraints
where table_schema = 'public' and table_name = 'couple_mines'
order by constraint_type;
