-- ============================================================
-- 追加「奶茶 / 饮品」等常见菜单，已存在的同名菜品会跳过
-- 用法：Supabase 控制台 → SQL Editor → 粘贴执行（可重复执行）
-- ============================================================

insert into public.dishes (name, category, emoji, description, sort_order)
select v.name, v.category, v.emoji, v.description, v.sort_order
from (
  values
    ('珍珠奶茶',   '奶茶', '🧋', '常温三分糖，加珍珠', 101),
    ('芋泥啵啵',   '奶茶', '🧋', '芋泥控必备',       102),
    ('杨枝甘露',   '奶茶', '🥤', '芒果 + 西柚 + 椰浆', 103),
    ('生椰拿铁',   '奶茶', '🥤', '咖啡版快乐水',     104),
    ('多肉葡萄',   '奶茶', '🍇', '大颗葡萄果肉',     105),
    ('柠檬红茶',   '饮品', '🍵', '清爽解腻',         106),
    ('冰美式',     '饮品', '☕', '提神首选',         107),
    ('草莓奶昔',   '饮品', '🍓', '冰冰甜甜',         108)
) as v(name, category, emoji, description, sort_order)
where not exists (
  select 1 from public.dishes d where d.name = v.name
);
