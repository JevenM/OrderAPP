-- ============================================================
-- 点菜小屋 · 头像上传（0010）
-- 用法：Supabase 控制台 → SQL Editor → 粘贴执行（可重复执行）
-- 作用：① members 增加 avatar_url 字段 ② 建好 avatars bucket 并放开读写
-- ============================================================

-- ---------- 1）成员头像字段 ----------
alter table public.members
  add column if not exists avatar_url text;

comment on column public.members.avatar_url is '头像地址（Storage avatars bucket 的公开 URL）';

-- ---------- 2）avatars bucket：存在则保证公开 ----------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- 头像很小，顺手限制一下单张大小和类型，避免被塞大文件
update storage.buckets
set file_size_limit = 2097152,                       -- 2MB（上传前前端已压到 60KB 左右）
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id = 'avatars';

-- ---------- 3）放开 anon（前端用的是 anon key）对 avatars 的读写 ----------
do $$
begin
  drop policy if exists "anon_select_avatars" on storage.objects;
  create policy "anon_select_avatars"
    on storage.objects for select to anon
    using (bucket_id = 'avatars');

  drop policy if exists "anon_insert_avatars" on storage.objects;
  create policy "anon_insert_avatars"
    on storage.objects for insert to anon
    with check (bucket_id = 'avatars');

  drop policy if exists "anon_update_avatars" on storage.objects;
  create policy "anon_update_avatars"
    on storage.objects for update to anon
    using (bucket_id = 'avatars');

  drop policy if exists "anon_delete_avatars" on storage.objects;
  create policy "anon_delete_avatars"
    on storage.objects for delete to anon
    using (bucket_id = 'avatars');

  drop policy if exists "auth_all_avatars" on storage.objects;
  create policy "auth_all_avatars"
    on storage.objects for all to authenticated
    using (bucket_id = 'avatars')
    with check (bucket_id = 'avatars');
end $$;

-- ---------- 4）自检：能看到 avatars 且 public = true 即配置成功 ----------
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'avatars';
