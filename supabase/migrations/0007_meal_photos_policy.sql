-- ============================================================
-- 点菜小屋 · 饭圈/三餐照片：放开 storage.objects 的读写权限
-- 现象：bucket 已经建好了，上传却提示 row-level security / policy
-- 用法：Supabase 控制台 → SQL Editor → 粘贴执行（可重复执行）
-- ============================================================

-- ---------- 1）确保 bucket 存在且公开（用 UI 建过也没关系，这里会幂等修正） ----------
insert into storage.buckets (id, name, public)
values ('meal-photos', 'meal-photos', true)
on conflict (id) do update set public = true;

-- ---------- 2）放开 anon（前端用的是 anon key）对 storage.objects 的读写 ----------
do $$
begin
  -- 读：公开图片
  drop policy if exists "anon_select_meal_photos" on storage.objects;
  create policy "anon_select_meal_photos"
    on storage.objects for select to anon
    using (bucket_id = 'meal-photos');

  -- 写：上传新图
  drop policy if exists "anon_insert_meal_photos" on storage.objects;
  create policy "anon_insert_meal_photos"
    on storage.objects for insert to anon
    with check (bucket_id = 'meal-photos');

  -- 改：覆盖同名文件（换图时会用到）
  drop policy if exists "anon_update_meal_photos" on storage.objects;
  create policy "anon_update_meal_photos"
    on storage.objects for update to anon
    using (bucket_id = 'meal-photos');

  -- 删：图片可被移除
  drop policy if exists "anon_delete_meal_photos" on storage.objects;
  create policy "anon_delete_meal_photos"
    on storage.objects for delete to anon
    using (bucket_id = 'meal-photos');

  -- 已登录用户也一并放开（以后接真登录时不用再改）
  drop policy if exists "auth_all_meal_photos" on storage.objects;
  create policy "auth_all_meal_photos"
    on storage.objects for all to authenticated
    using (bucket_id = 'meal-photos')
    with check (bucket_id = 'meal-photos');
end $$;

-- ---------- 3）自检：能看到 bucket 且 public = true 就说明配置对了 ----------
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'meal-photos';
