-- ============================================================
-- 点菜小屋 · 初始化数据库
-- 用法：Supabase 控制台 → SQL Editor → 粘贴执行（或 supabase db push）
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- 菜单 ----------
create table if not exists public.dishes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text not null default '家常菜',
  emoji       text not null default '🍽️',
  description text not null default '',
  price       numeric(10, 2) not null default 0,
  available   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------- 订单 ----------
create table if not exists public.orders (
  id         uuid primary key default gen_random_uuid(),
  status     text not null default 'pending',   -- pending 待接单 / accepted 已接单 / done 已完成 / cancelled 已取消
  meal_slot  text not null default 'lunch',     -- breakfast / lunch / dinner / snack
  hope_time  text not null default '',          -- 期望开饭时间，纯文本
  note       text not null default '',          -- 她的备注（口味、忌口…）
  created_at timestamptz not null default now(),
  read_at    timestamptz,                      -- 我是否已读（红点用）
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id        uuid primary key default gen_random_uuid(),
  order_id  uuid not null references public.orders (id) on delete cascade,
  dish_id   uuid references public.dishes (id) on delete set null,
  dish_name text not null,
  emoji     text not null default '🍽️',
  qty       int not null default 1
);

create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists order_items_order_id_idx on public.order_items (order_id);

-- ---------- 一日三餐记录 ----------
create table if not exists public.meals (
  id         uuid primary key default gen_random_uuid(),
  day        date not null default (now() at time zone 'Asia/Shanghai')::date,
  slot       text not null,           -- breakfast 早餐 / lunch 午餐 / dinner 晚餐 / snack 加餐
  status     text not null default 'eaten',  -- eaten 吃了 / little 吃得少 / skipped 没吃
  content    text not null default '',
  photo_url  text not null default '',
  note       text not null default '',
  created_at timestamptz not null default now(),
  read_at    timestamptz             -- 我是否已读（红点用）
);

create index if not exists meals_day_idx on public.meals (day desc);

-- ---------- 权限：邀请码模式（前端校验），anon 可读写 ----------
-- 说明：本应用只用「邀请码」保护，URL 不对外公开即可。
-- 若想更严格，见 README「安全加固」一节，改成 passcode 头校验策略。
alter table public.dishes      enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;
alter table public.meals       enable row level security;

do $$
declare t text;
begin
  foreach t in array array['dishes', 'orders', 'order_items', 'meals'] loop
    execute format('drop policy if exists "anon_all_%1$s" on public.%1$I', t);
    execute format('create policy "anon_all_%1$s" on public.%1$I for all to anon using (true) with check (true)', t);
    execute format('drop policy if exists "auth_all_%1$s" on public.%1$I', t);
    execute format('create policy "auth_all_%1$s" on public.%1$I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ---------- 实时订阅（后台红点/弹窗靠它） ----------
do $$
declare t text;
begin
  foreach t in array array['orders', 'order_items', 'meals', 'dishes'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then
      -- 已经加过就忽略
      null;
    end;
  end loop;
end $$;

-- ---------- 初始菜单（只在菜单为空时写入，可放心重复执行） ----------
do $$
begin
  if (select count(*) from public.dishes) = 0 then
    insert into public.dishes (name, category, emoji, description, sort_order) values
      ('番茄炒蛋',    '家常菜', '🍅', '酸甜下饭，永远的神', 1),
      ('可乐鸡翅',    '荤菜',   '🍗', '甜口，她的最爱', 2),
      ('红烧肉',      '荤菜',   '🥩', '肥而不腻', 3),
      ('糖醋排骨',    '荤菜',   '🍖', '酸甜开胃', 4),
      ('清蒸鲈鱼',    '荤菜',   '🐟', '清淡鲜美', 5),
      ('蒜蓉西兰花',  '素菜',   '🥦', '清爽解腻', 6),
      ('手撕包菜',    '素菜',   '🥬', '大火快炒', 7),
      ('麻婆豆腐',    '家常菜', '🌶️', '微辣', 8),
      ('土豆丝',      '素菜',   '🥔', '酸辣脆爽', 9),
      ('紫菜蛋花汤',  '汤羹',   '🍲', '简单暖胃', 10),
      ('番茄牛腩汤',  '汤羹',   '🍜', '炖久一点更香', 11),
      ('扬州炒饭',    '主食',   '🍚', '一碗管饱', 12),
      ('阳春面',      '主食',   '🍜', '清汤面', 13),
      ('手工水饺',    '主食',   '🥟', '韭菜猪肉 / 白菜猪肉', 14),
      ('皮蛋瘦肉粥',  '主食',   '🥣', '早餐首选', 15),
      ('奶油意面',    '西餐',   '🍝', '碳水快乐', 16),
      ('黑椒牛排',    '西餐',   '🥩', '七分熟', 17),
      ('芝士焗饭',    '西餐',   '🧀', '拉丝警告', 18),
      ('水果沙拉',    '轻食',   '🥗', '减脂友好', 19),
      ('酸奶碗',      '轻食',   '🥛', '燕麦 + 水果', 20);
  end if;
end $$;
