-- 点菜小屋 · 补齐迁移前已存在的同步抉择历史（0018）
-- 迁移 0017 执行前创建的 couple_quiz 会话没有 history_id，补建历史后管理员即可查询。

insert into public.couple_quiz_history (
  member_a,
  member_b,
  question_id,
  question_title,
  question_kind,
  option_a,
  option_b,
  choice_a,
  choice_b,
  status,
  matched,
  started_at,
  created_at
)
select
  q.member_a,
  q.member_b,
  coalesce(q.question->>'id', 'legacy-' || q.member_a::text || '-' || q.member_b::text),
  coalesce(q.question->>'title', '历史同步抉择'),
  coalesce(q.question->>'kind', '轻松版'),
  coalesce(q.question->>'a', ''),
  coalesce(q.question->>'b', ''),
  q.choice_a,
  q.choice_b,
  q.status,
  case when q.status = 'revealed' then q.choice_a = q.choice_b else null end,
  q.updated_at,
  q.updated_at
from public.couple_quiz q
where q.question is not null
  and q.history_id is null
  and not exists (
    select 1
    from public.couple_quiz_history h
    where h.member_a = q.member_a
      and h.member_b = q.member_b
      and h.question_id = coalesce(q.question->>'id', 'legacy-' || q.member_a::text || '-' || q.member_b::text)
  );

update public.couple_quiz q
set history_id = h.id
from public.couple_quiz_history h
where q.history_id is null
  and h.member_a = q.member_a
  and h.member_b = q.member_b
  and h.question_id = coalesce(q.question->>'id', 'legacy-' || q.member_a::text || '-' || q.member_b::text)
  and h.created_at = q.updated_at;
