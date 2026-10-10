-- ============================================================
-- 点菜小屋 · 好友系统（0011）
-- 用法：Supabase 控制台 → SQL Editor → 粘贴执行（可重复执行）
-- 规则：
--   ① 管理员 默认和所有账户都是好友，不需要建关系行；
--   ② 其余账户互相隔离：不是好友，动态 / 点赞 / 评论一律看不到；
--   ③ 加好友靠邀请码：搜到对方 → 发申请 → 对方接受后才算好友。
-- ============================================================

-- ---------- 好友关系（一对人只存一行） ----------
create table if not exists public.friendships (
  id             uuid primary key default gen_random_uuid(),
  requester_id   uuid not null references public.members (id) on delete cascade,  -- 发起申请的人
  addressee_id   uuid not null references public.members (id) on delete cascade,  -- 收到申请的人
  status         text not null default 'pending',   -- pending 待接受 / accepted 已是好友
  requester_note text,                              -- 发起方给对方的备注（只有自己看到）
  addressee_note text,                              -- 接受方给对方的备注（只有自己看到）
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint friendships_no_self check (requester_id <> addressee_id)
);

-- 同一对人只允许存在一行（不分方向），避免重复申请 / 双向各建一条
create unique index if not exists friendships_pair_idx
  on public.friendships (
    case when requester_id < addressee_id then requester_id else addressee_id end,
    case when requester_id < addressee_id then addressee_id else requester_id end
  );

create index if not exists friendships_requester_idx on public.friendships (requester_id);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id);

comment on table public.friendships is
  '好友关系：status=pending 是待接受的申请，accepted 才是好友（互相可见、可互动）';
comment on column public.friendships.requester_note is
  '发起方给对方的备注：只有发起方自己能看到，显示时优先于对方昵称';
comment on column public.friendships.addressee_note is
  '接受方给对方的备注：只有接受方自己能看到';

-- ---------- 权限：与既有表一致（邀请码模式，anon 可读写） ----------
alter table public.friendships enable row level security;

do $$
begin
  drop policy if exists "anon_all_friendships" on public.friendships;
  create policy "anon_all_friendships" on public.friendships for all to anon using (true) with check (true);
  drop policy if exists "auth_all_friendships" on public.friendships;
  create policy "auth_all_friendships" on public.friendships for all to authenticated using (true) with check (true);
end $$;

-- ---------- 实时订阅（申请一来就有红点） ----------
do $$
begin
  begin
    alter publication supabase_realtime add table public.friendships;
  exception when others then
    null; -- 已经加过就忽略
  end;
end $$;

-- ---------- 自检 ----------
select count(*) as friendships from public.friendships;
