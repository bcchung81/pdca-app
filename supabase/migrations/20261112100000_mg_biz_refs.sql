-- 경영관리 경평 초안의 「주요사업 초안 참고」(2026-11-12 — .team/biz-ref/COMMON.md §0·§1).
-- 경영관리 카드의 경평 초안(구성안·집필·분량 보강·블록 고치기)을 쓸 때, 사람이 고른 주요사업 경평 초안(card_report_drafts)과
-- 그 초안이 쓴 붙임(카드 전용 자료·보고서 추가자료)의 글을 참고 자료로 넣는다. 금기 4(카드 전용 자료를 다른 카드에)의 이 기능만의 예외.
--
-- 권한 판단(왜 security definer인지):
--   고를 수 있는 사람 = 그 경영관리 카드를 읽을 수 있는 사람(private.can_read_card — 경영관리 과제에 지정된 부서 담당자·성과관리팀·관리자).
--   경영관리에 지정된 부서 담당자는 주요사업 카드·초안·붙임을 RLS로 읽지 못하므로(지정된 과제만), 함수가 소유자 권한으로 읽되
--   문 조건은 「p_card_id가 읽을 수 있는 활성 경영관리 카드(eval_unit_id ~ '^MG-')」 하나다. 아니면(주요사업 카드 id, 읽을 수 없는 카드,
--   보관 카드, 없는 id) 0행. 주요사업만 맡은 부서 담당자는 자기 경영관리 카드가 없으므로 목록도 글도 받지 못한다.
--   주요사업 쪽 쓰기 권한·RLS는 바꾸지 않는다(함수 안에서 아무것도 쓰지 않음, stable).
--   내보내는 것:
--   ① mg_biz_refs: 활성 주요사업 카드 중 그 해 초안(spec이 객체)이 있는 것의 목록 — 카드 id·uid·묶음·과제번호·제목·팀 이름·지문·
--      초안 갱신 시각·없는 숫자 개수·붙임 개수·글자 수 어림(원장 JSON + 초안 spec + 붙임 글자 수 parsed_chars). 본문은 주지 않음.
--   ② mg_biz_ref_texts: 고른 주요사업(30개까지)의 원장 JSON·초안 spec·지문·없는 숫자·붙임 글.
--      붙임은 그 초안 spec.sources의 card/report 항목 중 「그 주요사업 카드 소속」인 것만 — 카드 전용 자료는 card_id가 그 카드,
--      보고서 추가자료는 그 카드와 같은 평가단위 × 팀 × 연도 보고서 소속, 읽은 글(parsed_text)이 있는 것만. 다른 카드 id가
--      sources에 적혀 있어도 나오지 않는다(고르는 규칙은 private.mg_biz_files 한 곳). 목록의 붙임 글자 수는 parsed_chars(없으면 length)로 세고 본문을 읽지 않는다.
--   ③ mg_biz_stale: 읽을 수 있는 경영관리 카드 초안의 spec.sources 중 kind = 'biz' 항목의 지문(stamp)이 지금 지문과 다르거나
--      그 주요사업 초안이 없어진(카드 보관 포함) 것 — 경영관리 카드 id·주요사업 카드 id·과제번호·지금 초안 갱신 시각(없어졌으면 null)만.
--   지문 = md5(spec::text). jsonb의 글 표현은 키 순서가 정규화돼 같은 내용이면 같은 지문(lib/db/migrations.test.ts가 확인).
--
-- 운영 반영 순서: 이 마이그레이션(db:push) → 배포. 새 코드가 이 함수들을 부르고, 함수만 먼저 생겨도 옛 코드는 부르지 않아 해가 없음.
--
-- 되돌리기(down):
--   drop function public.mg_biz_stale(text[], integer);
--   drop function public.mg_biz_ref_texts(text, integer, text[]);
--   drop function public.mg_biz_refs(text, integer);
--   drop function private.mg_biz_files(text, integer, jsonb);

-- 붙임 고르기(내부용, 규칙은 여기 한 곳): 주요사업 초안 spec.sources의 card/report 항목 중 그 주요사업 카드 소속이고 읽은 글이 있는 것만,
-- sources 순서대로. 본문(parsed_text)은 돌려주지 않고 글자 수만(parsed_chars, 없으면 length) — 목록(mg_biz_refs)은 화면을 열 때마다 불리므로
-- 붙임 본문을 읽지 않게 하고, 본문이 필요한 mg_biz_ref_texts만 id로 다시 읽음. 자료 id는 uuid 모양일 때만 비교(기본 키 색인을 씀).
-- 권한 확인을 하지 않으므로 security invoker로 두고 아무에게도 실행을 주지 않음 — 아래 security definer 함수(소유자 권한) 안에서만 씀.
create or replace function private.mg_biz_files(p_biz_card_id text, p_year integer, p_sources jsonb)
returns table (ord bigint, kind text, id uuid, name text, chars integer)
language sql
stable
set search_path = ''
as $$
  with src as (
    select
      s.v ->> 'kind' as k,
      case when s.v ->> 'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (s.v ->> 'id')::uuid end as u,
      min(s.ord) as ord
    from jsonb_array_elements(case when jsonb_typeof(p_sources) = 'array' then p_sources else '[]'::jsonb end) with ordinality as s(v, ord)
    where jsonb_typeof(s.v) = 'object' and s.v ->> 'kind' in ('card', 'report')
    group by 1, 2
  )
  select x.ord, x.kind, x.id, x.name, x.chars
  from (
    select src.ord, 'card'::text as kind, m.id, m.file_name as name, coalesce(m.parsed_chars, length(m.parsed_text)) as chars
    from src
    join public.card_materials m on m.id = src.u and m.card_id = p_biz_card_id
    where src.k = 'card' and m.parsed_text is not null
    union all
    select src.ord, 'report'::text, rm.id, rm.file_name, coalesce(rm.parsed_chars, length(rm.parsed_text))
    from src
    join public.report_materials rm on rm.id = src.u
    join public.reports r on r.id = rm.report_id
    join public.cards b on b.id = p_biz_card_id
    where src.k = 'report'
      and r.eval_unit_id = b.eval_unit_id and r.team_id = b.team_id and r.year = p_year
      and rm.parsed_text is not null
  ) x
  where x.chars > 0
  order by x.ord
$$;
revoke all on function private.mg_biz_files(text, integer, jsonb) from public, anon, authenticated;
comment on function private.mg_biz_files(text, integer, jsonb) is '주요사업 초안 붙임 고르기(내부용, 권한 확인 없음): spec.sources의 card/report 중 그 주요사업 카드 소속·읽은 글 있는 것의 순서·종류·id·이름·글자 수(본문 없음). mg_biz_refs·mg_biz_ref_texts 안에서만 씀';

-- ① 목록(본문 없음)
create or replace function public.mg_biz_refs(p_card_id text, p_year integer)
returns table (biz_card_id text, uid text, group_name text, task_no text, title text, team_name text, stamp text, updated_at timestamptz, unknown_count integer, file_count integer, chars integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.id,
    b.uid::text,
    b.data ->> 'group',
    b.task_no,
    b.title,
    t.name,
    md5(d.spec::text),
    d.updated_at,
    coalesce(cardinality(d.unknown_numbers), 0),
    coalesce(f.n, 0),
    (length(b.data::text) + length(d.spec::text) + coalesce(f.chars, 0))::integer
  from public.cards m
  join public.cards b on b.eval_unit_id !~ '^MG-' and b.status = 'active'
  join public.card_report_drafts d on d.card_id = b.id and d.year = p_year and jsonb_typeof(d.spec) = 'object'
  left join public.teams t on t.id = b.team_id
  left join lateral (
    select count(*)::integer as n, sum(x.chars)::bigint as chars
    from private.mg_biz_files(b.id, p_year, d.spec -> 'sources') x
  ) f on true
  where m.id = p_card_id
    and m.eval_unit_id ~ '^MG-'
    and m.status = 'active'
    and private.can_read_card(m.id)
  order by b.data ->> 'group', nullif(substring(b.task_no from '^\d+'), '')::integer nulls last, b.task_no
$$;
revoke all on function public.mg_biz_refs(text, integer) from public, anon;
grant execute on function public.mg_biz_refs(text, integer) to authenticated;
comment on function public.mg_biz_refs(text, integer) is '경영관리 초안의 주요사업 초안 참고 목록: 읽을 수 있는 활성 경영관리 카드로 부를 때만, 그 해 초안이 있는 활성 주요사업 카드의 번호·제목·팀·지문·개수·글자 수 어림(본문 없음)';

-- ② 고른 주요사업의 원장·초안·붙임 글(30개까지 — 넘으면 0행)
create or replace function public.mg_biz_ref_texts(p_card_id text, p_year integer, p_biz_ids text[])
returns table (biz_card_id text, group_name text, task_no text, title text, team_name text, data jsonb, spec jsonb, stamp text, updated_at timestamptz, unknown_numbers jsonb, files jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.id,
    b.data ->> 'group',
    b.task_no,
    b.title,
    t.name,
    b.data,
    d.spec,
    md5(d.spec::text),
    d.updated_at,
    to_jsonb(coalesce(d.unknown_numbers, '{}'::text[])),
    coalesce((
      select jsonb_agg(jsonb_build_object('kind', x.kind, 'id', x.id::text, 'name', x.name, 'text', coalesce(cm.parsed_text, rm.parsed_text)) order by x.ord)
      from private.mg_biz_files(b.id, p_year, d.spec -> 'sources') x
      left join public.card_materials cm on x.kind = 'card' and cm.id = x.id
      left join public.report_materials rm on x.kind = 'report' and rm.id = x.id
    ), '[]'::jsonb)
  from public.cards m
  join public.cards b on b.id = any(p_biz_ids) and b.eval_unit_id !~ '^MG-' and b.status = 'active'
  join public.card_report_drafts d on d.card_id = b.id and d.year = p_year and jsonb_typeof(d.spec) = 'object'
  left join public.teams t on t.id = b.team_id
  where m.id = p_card_id
    and m.eval_unit_id ~ '^MG-'
    and m.status = 'active'
    and private.can_read_card(m.id)
    and coalesce(cardinality(p_biz_ids), 0) <= 30
  order by b.data ->> 'group', nullif(substring(b.task_no from '^\d+'), '')::integer nulls last, b.task_no
$$;
revoke all on function public.mg_biz_ref_texts(text, integer, text[]) from public, anon;
grant execute on function public.mg_biz_ref_texts(text, integer, text[]) to authenticated;
comment on function public.mg_biz_ref_texts(text, integer, text[]) is '경영관리 초안의 주요사업 초안 참고 글: 읽을 수 있는 활성 경영관리 카드로 부를 때만, 고른 활성 주요사업(30개까지)의 원장·초안 spec·지문·없는 숫자·그 카드 소속 붙임 글';

-- ③ 낡음: 경영관리 초안이 참고한 주요사업 초안이 바뀌었거나 없어진 것(300장까지 — 넘으면 0행)
create or replace function public.mg_biz_stale(p_card_ids text[], p_year integer)
returns table (card_id text, biz_card_id text, task_no text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.id,
    s.v ->> 'id',
    coalesce(b.task_no, s.v ->> 'id'),
    cur.updated_at
  from public.cards m
  join public.card_report_drafts d on d.card_id = m.id and d.year = p_year
    and jsonb_typeof(d.spec) = 'object' and jsonb_typeof(d.spec -> 'sources') = 'array'
  cross join lateral jsonb_array_elements(d.spec -> 'sources') as s(v)
  left join public.cards b on b.id = s.v ->> 'id'
  left join public.card_report_drafts cur on cur.card_id = b.id and cur.year = p_year
    and jsonb_typeof(cur.spec) = 'object' and b.eval_unit_id !~ '^MG-' and b.status = 'active'
  where m.id = any(p_card_ids)
    and coalesce(cardinality(p_card_ids), 0) <= 300
    and m.eval_unit_id ~ '^MG-'
    and m.status = 'active'
    and private.can_read_card(m.id)
    and jsonb_typeof(s.v) = 'object'
    and s.v ->> 'kind' = 'biz'
    and (cur.card_id is null or md5(cur.spec::text) is distinct from s.v ->> 'stamp')
  order by m.id, s.v ->> 'id'
$$;
revoke all on function public.mg_biz_stale(text[], integer) from public, anon;
grant execute on function public.mg_biz_stale(text[], integer) to authenticated;
comment on function public.mg_biz_stale(text[], integer) is '경영관리 초안이 참고한 주요사업 초안의 낡음: 읽을 수 있는 활성 경영관리 카드(300장까지)의 spec.sources biz 항목 중 지문이 다르거나 초안이 없어진 것(없어졌으면 updated_at null)';
