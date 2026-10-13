-- ============================================================
-- 成员在线检测（last_active_at 字段）
-- 作用：记录每个成员最近一次活跃时间，客户端 30s 拉一次、
--       判断「最近 5 分钟内有活动 → 在线」。
-- 用于：互动游戏「对方在线只弹窗、离线才写铃铛」的分支判断。
-- ============================================================

-- 成员在线检测
alter table public.members add column if not exists last_active_at timestamptz;
create index if not exists members_last_active_at_idx on public.members (last_active_at desc);
