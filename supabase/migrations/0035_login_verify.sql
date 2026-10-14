-- 将登录口令校验放到数据库端。
-- 执行迁移后，请在 Supabase SQL Editor 中设置一次哈希：
--   insert into public.app_settings(key, value) values
--     ('auth_admin_hash', encode(extensions.digest('你的管理口令', 'sha256'), 'hex'))
--   on conflict (key) do update set value = excluded.value;
-- 如仍需要首次成员主邀请码，同样设置 auth_invite_hash。

create extension if not exists pgcrypto with schema extensions;

create or replace function public.login_verify(p_input text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  input_hash text;
  admin_hash text;
  invite_hash text;
  member_row public.members%rowtype;
begin
  if nullif(trim(coalesce(p_input, '')), '') is null then
    return jsonb_build_object('ok', false);
  end if;

  input_hash := encode(extensions.digest(trim(p_input), 'sha256'), 'hex');
  select value into admin_hash from public.app_settings where key = 'auth_admin_hash' limit 1;
  if admin_hash is not null and input_hash = admin_hash then
    return jsonb_build_object('ok', true, 'role', 'me');
  end if;

  -- 成员邀请码只在服务端参与匹配，返回资料时不返回 code 字段。
  select * into member_row
  from public.members
  where code = trim(p_input)
  order by created_at asc
  limit 1;
  if member_row.id is not null then
    return jsonb_build_object(
      'ok', true,
      'role', 'her',
      'member_id', member_row.id,
      'member_name', member_row.name,
      'member_avatar', coalesce(member_row.avatar_url, '')
    );
  end if;

  select value into invite_hash from public.app_settings where key = 'auth_invite_hash' limit 1;
  if invite_hash is not null and input_hash = invite_hash then
    select * into member_row from public.members order by created_at asc limit 1;
    if member_row.id is null then
      insert into public.members(name, code)
      values ('她', trim(p_input))
      returning * into member_row;
    end if;
    return jsonb_build_object(
      'ok', true,
      'role', 'her',
      'member_id', member_row.id,
      'member_name', member_row.name,
      'member_avatar', coalesce(member_row.avatar_url, '')
    );
  end if;

  return jsonb_build_object('ok', false);
end;
$$;

revoke all on function public.login_verify(text) from public;
grant execute on function public.login_verify(text) to anon, authenticated;
