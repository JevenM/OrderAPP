-- ============================================================
-- 点菜小屋 · 饭圈消息通知（0016）
-- 用法：Supabase 控制台 → SQL Editor → 粘贴执行（可重复执行）
-- 作用：
--   ① 好友一方发布动态 / 点赞 / 评论（含定向回复）时，给对方落一条通知；
--   ② 接收方顶栏 🔔 显示未读条数，打开消息面板后全部标记已读；
--   ③ 表开启实时推送：对方在线时消息即达，离线也不丢。
-- ============================================================

-- ---------- 通知表 ----------
create table if not exists public.feed_notifications (
  id          uuid primary key default gen_random_uuid(),
  recipient   text not null,                -- 接收人：members.id 或 'me'（管理员，与 posts.member_id 空值口径对应）
  sender_name text not null default '',     -- 操作人昵称（落库时快照，免联查）
  type        text not null,                -- post 发布动态 / like 点赞 / comment 评论 / reply 定向回复
  post_id     text,                         -- 相关动态 id（点击跳转饭圈用）
  title       text not null,                -- 一句话标题，如「XX 赞了你的动态」
  body        text not null default '',     -- 内容摘要
  read_at     timestamptz,                  -- 打开消息面板的时间；null = 未读
  created_at  timestamptz not null default now()
);

create index if not exists feed_notifications_recipient_idx
  on public.feed_notifications (recipient, created_at desc);

comment on table public.feed_notifications is
  '饭圈消息通知：recipient=members.id 或 ''me''；read_at 为空即未读，打开面板后批量置为当前时间';

-- ---------- 权限：与既有表一致（邀请码模式，anon 可读写） ----------
alter table public.feed_notifications enable row level security;

do $$
begin
  drop policy if exists "anon_all_feed_notifications" on public.feed_notifications;
  create policy "anon_all_feed_notifications" on public.feed_notifications for all to anon using (true) with check (true);
  drop policy if exists "auth_all_feed_notifications" on public.feed_notifications;
  create policy "auth_all_feed_notifications" on public.feed_notifications for all to authenticated using (true) with check (true);
end $$;

-- ---------- 实时订阅（新通知即达，未读角标实时 +1） ----------
do $$
begin
  begin
    alter publication supabase_realtime add table public.feed_notifications;
  exception when others then
    null; -- 已经加过就忽略
  end;
end $$;

-- ---------- 自检 ----------
select count(*) as feed_notifications from public.feed_notifications;
