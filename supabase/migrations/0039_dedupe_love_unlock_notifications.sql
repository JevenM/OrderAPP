-- 情话解锁通知幂等去重：同一接收人、类型和业务键只保留一条
-- 先清理旧版本没有业务键时产生的同日重复通知。
with legacy_duplicates as (
  select id,
         row_number() over (
           partition by recipient, type, (created_at at time zone 'Asia/Shanghai')::date
           order by created_at asc, id asc
         ) as row_no
  from public.feed_notifications
  where type = 'love-unlocked' and post_id is null
)
delete from public.feed_notifications
where id in (select id from legacy_duplicates where row_no > 1);

with duplicates as (
  select id,
         row_number() over (
           partition by recipient, type, post_id
           order by created_at asc, id asc
         ) as row_no
  from public.feed_notifications
  where type = 'love-unlocked' and post_id is not null
)
delete from public.feed_notifications
where id in (select id from duplicates where row_no > 1);

create unique index if not exists feed_notifications_love_unlock_unique_idx
  on public.feed_notifications (recipient, type, post_id)
  where type = 'love-unlocked' and post_id is not null;
