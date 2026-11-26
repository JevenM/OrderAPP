-- 用户行为统计：每天每个使用者一行，登录次数 / 在线时长 / 模块使用次数
-- 前端只调用 report_user_activity RPC，由数据库做原子累加（并发上报不会互相覆盖）。
create table if not exists public.user_activity_logs (
  actor_id text not null,
  actor_name text not null default '',
  day date not null,
  login_count int not null default 0,
  duration_sec int not null default 0,
  module_hits jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (actor_id, day)
);
alter table public.user_activity_logs enable row level security;
drop policy if exists user_activity_read on public.user_activity_logs;
create policy user_activity_read on public.user_activity_logs for select to anon, authenticated using (true);
drop policy if exists user_activity_write on public.user_activity_logs;
create policy user_activity_write on public.user_activity_logs for all to anon, authenticated using (true) with check (true);

create or replace function public.report_user_activity(
  p_actor_id text,
  p_actor_name text,
  p_day date,
  p_login boolean,
  p_duration_sec int,
  p_module text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_actor_id is null or trim(p_actor_id) = '' then
    return;
  end if;

  insert into public.user_activity_logs (actor_id, actor_name, day, login_count, duration_sec, module_hits)
  values (
    p_actor_id,
    coalesce(p_actor_name, ''),
    p_day,
    case when coalesce(p_login, false) then 1 else 0 end,
    greatest(coalesce(p_duration_sec, 0), 0),
    case when p_module is null or trim(p_module) = '' then '{}'::jsonb else jsonb_build_object(p_module, 1) end
  )
  on conflict (actor_id, day) do update set
    actor_name = case when coalesce(excluded.actor_name, '') = '' then public.user_activity_logs.actor_name else excluded.actor_name end,
    login_count = public.user_activity_logs.login_count + case when coalesce(p_login, false) then 1 else 0 end,
    duration_sec = public.user_activity_logs.duration_sec + greatest(coalesce(p_duration_sec, 0), 0),
    module_hits = case
      when p_module is null or trim(p_module) = '' then public.user_activity_logs.module_hits
      else public.user_activity_logs.module_hits || jsonb_build_object(
        p_module,
        coalesce((public.user_activity_logs.module_hits ->> p_module)::int, 0) + 1
      )
    end,
    updated_at = now();
end;
$$;

revoke all on function public.report_user_activity(text, text, date, boolean, int, text) from public;
grant execute on function public.report_user_activity(text, text, date, boolean, int, text) to anon, authenticated;
