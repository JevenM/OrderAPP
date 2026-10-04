-- ============================================================
-- 点菜小屋 · 饭圈（动态 / 点赞 / 评论）
-- 用法：Supabase 控制台 → SQL Editor → 粘贴执行（可重复执行）
-- ============================================================

-- ---------- 动态 ----------
create table if not exists public.posts (
  id         uuid primary key default gen_random_uuid(),
  author     text not null default 'her',   -- her 她发的 / me 我发的
  member_id  uuid references public.members (id) on delete set null,  -- 她发的：她的成员 id；我发的：NULL
  content    text not null default '',
  photo_url  text not null default '',
  meal_slot  text,                          -- 来自就餐记录：breakfast / lunch / dinner / snack
  day        date,                          -- 来自就餐记录：那一天的日期
  created_at timestamptz not null default now()
);

create index if not exists posts_created_at_idx on public.posts (created_at desc);

-- ---------- 点赞 ----------
create table if not exists public.post_likes (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  member_id  uuid references public.members (id) on delete cascade,  -- 点赞的人；我点的为 NULL
  created_at timestamptz not null default now()
);

create index if not exists post_likes_post_idx on public.post_likes (post_id);
-- 同一条动态，同一个人只能点一次赞（我 = member_id 为 NULL）
create unique index if not exists post_likes_unique_idx
  on public.post_likes (post_id, coalesce(member_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ---------- 评论 ----------
create table if not exists public.post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  member_id  uuid references public.members (id) on delete set null,  -- 评论的人；我评论的为 NULL
  content    text not null,
  created_at timestamptz not null default now()
);

create index if not exists post_comments_post_idx on public.post_comments (post_id);

-- ---------- 权限：与既有表一致（邀请码模式，anon 可读写） ----------
alter table public.posts         enable row level security;
alter table public.post_likes    enable row level security;
alter table public.post_comments enable row level security;

do $$
declare t text;
begin
  foreach t in array array['posts', 'post_likes', 'post_comments'] loop
    execute format('drop policy if exists "anon_all_%1$s" on public.%1$I', t);
    execute format('create policy "anon_all_%1$s" on public.%1$I for all to anon using (true) with check (true)', t);
    execute format('drop policy if exists "auth_all_%1$s" on public.%1$I', t);
    execute format('create policy "auth_all_%1$s" on public.%1$I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ---------- 实时订阅（点赞 / 评论立刻同步） ----------
do $$
declare t text;
begin
  foreach t in array array['posts', 'post_likes', 'post_comments'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then
      null; -- 已经加过就忽略
    end;
  end loop;
end $$;
