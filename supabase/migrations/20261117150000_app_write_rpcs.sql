-- 공개 security definer rpc 7개의 첫 줄에 앱 서버 경유 표지 확인(근본책 2단계 rpc, 2026-11-17). 표 정책(20261117140000)과 서로 기대지 않음.
--   쓰기: start_ai_request·finish_ai_request(AI 호출 기록 — 한도 판정·running 행·끝맺기)
--   읽기: report_submit_cards(부서 확정 조건 재료)·mg_biz_refs·mg_biz_ref_texts·mg_biz_stale(주요사업 초안 참고)·report_outline_context(사업 목차 맥락)
--
-- 왜: 이 함수들은 소유자 권한으로 돌아 부르는 사람의 RLS보다 넓은 범위를 읽거나(동료 과제 재료·주요사업 초안과 붙임 글·다른 부서 목차 줄)
--   표 쓰기 권한이 없는 표에 씁니다(ai_requests). 앱은 서버 액션·화면 안에서 권한을 다시 확인하고 결과를 가공해서만 쓰므로,
--   로그인 사용자가 공개 키 + 자기 토큰으로 앱 밖에서 직접 부르는 면을 줄이려고 읽기 함수에도 같은 표지(private.app_write())를 요구합니다.
--   표지는 판정을 넓히지 않고 좁히기만 합니다 — 행 판정(can_read_card·can_read_report·my_team 등)·한도·값 상한은 그대로.
--   거절은 맨 앞에서 42501(PostgREST 403). 앱의 처리: 호출 기록 시작 실패 = 「기록 실패」 안내로 AI를 부르지 않음, 확정 조건 재료 = null(호출부가 막음),
--   주요사업 참고·목차 맥락 = 빈 결과 — 표지를 싣는 앱 서버에서는 일어나지 않음.
--
-- 부르는 곳(2026-11-17 grep — app·lib·components·scripts): 모두 표지를 싣는 클라이언트입니다.
--   lib/ai/request-log.ts(startAiRequest·끝맺기) ← 서버 액션의 lib/supabase/server.ts createClient, 백그라운드 작업의 lib/supabase/job-client.ts createJobClient
--   lib/reports/queries.ts loadTeamSubmitCards, lib/reports/mg-biz-queries.ts(세 함수), app/(app)/my/report/page.tsx(report_outline_context) ← createClient
--   서비스 키·DB 직접 연결로 부르는 곳은 없음(prep 처리기는 ai_requests를 서비스 키 표 쓰기로 남기고, scripts/smoke/ai-report-mg-smoke.ts는 표를 서비스 키로 직접 읽음 — rpc 안 부름).
--   서비스 키·postgres는 머리글이 없으면 이 함수들에서도 거절되므로, 그런 경로를 새로 만들면 그 클라이언트도 appWriteHeaders()를 실어야 함.
--
-- 본문은 아래 각 함수 위에 적은 예전 정의(마지막 정의)를 한 글자도 바꾸지 않았습니다(인자·반환형·security definer·search_path·변동성 그대로).
--   sql 언어였던 5개(report_submit_cards·mg_biz_*·report_outline_context)는 raise를 쓰려고 plpgsql로 바꾸고 원래 select를 return query로 그대로 돌려줍니다
--   (반환 열·형식·순서 같음 — lib/db/migrations.test.ts의 동작 시험과 lib/db/app-write-rpc.test.ts가 확인).
--   권한은 create or replace가 그대로 두지만 예전 정의의 revoke·grant를 다시 적습니다. 설명(comment)도 그대로 남습니다.
--
-- 운영 반영 순서: 배포 불필요(앱 코드 변경 없음 — 표지 머리글은 88c584c까지 배포됨). 20261117120000(표지 기반)·키 해시 등록·app_write_probe() true 확인이 끝난 뒤 pnpm db:push.
--   반영 뒤 확인: AI 요청 1회(호출 기록 시작·끝맺기), 부서 화면 「경평 초안」의 확정 조건·목차 자리, 경영관리 초안의 주요사업 초안 참고 목록.
--
-- 되돌리기(down — 예전 정의로): 아래 파일의 해당 create or replace function 문과 바로 뒤 revoke·grant 두 줄을 그대로 다시 실행(plpgsql → sql도 create or replace로 됨).
--   start_ai_request·finish_ai_request: 20261117100000_material_parse_server_only.sql
--   report_submit_cards: 20261103100000_role_input_guards.sql
--   mg_biz_refs·mg_biz_ref_texts·mg_biz_stale: 20261112100000_mg_biz_refs.sql
--   report_outline_context: 20260927170000_report_dept_submit.sql

-- start_ai_request (예전 정의: 20261117100000_material_parse_server_only.sql)
create or replace function public.start_ai_request(p_feature text, p_card_id text, p_mode text, p_job text, p_key_hashes text[], p_batch boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_n integer := coalesce(array_length(p_key_hashes, 1), 0);
  v_describe boolean := p_feature = 'material_describe';
  v_per_minute integer := case when p_feature = 'material_describe' then 15 else 5 end;
  v_running_max integer := case when p_feature = 'material_describe' then 3 else 2 end;
  v_stale interval := interval '20 minutes';
  v_running integer;
  v_recent integer;
  v_ids bigint[] := '{}';
  v_id bigint;
begin
  if not private.app_write() then
    raise exception '앱 서버를 거친 요청만 받습니다' using errcode = '42501';
  end if;
  if v_uid is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;
  -- 기능 이름 허용 목록 = lib/ai/models.ts FEATURE_TIER의 열쇠(시험이 대조 — 기능을 더하면 여기도)
  if p_feature is null
     or p_feature not in ('card_assist', 'card_chat', 'card_comment', 'inspection', 'report_outline', 'report_section', 'report_fix', 'report_block', 'report_unit_mg', 'prep_match', 'material_describe')
     or v_n < 1 or (not p_batch and v_n <> 1) or v_n > v_per_minute
     or exists (select 1 from unnest(p_key_hashes) h where h is null or h !~ '^[0-9a-f]{64}$') then
    raise exception 'AI 호출 기록 시작 값이 올바르지 않습니다' using errcode = '22023';
  end if;
  if p_card_id is not null and not private.can_read_card(p_card_id) then
    raise exception '읽을 수 없는 과제입니다' using errcode = '42501';
  end if;

  -- 같은 사용자의 시작을 줄 세움(세고 나서 넣기 사이 경쟁 막기) — 트랜잭션이 끝나면 풀림
  perform pg_advisory_xact_lock(hashtext('ai_requests'), hashtext(v_uid::text));

  update public.ai_requests
     set status = 'error', error = '중단 — 끝맺지 못한 호출(시간 제한에서 끊김 추정)', finished_at = now()
   where user_id = v_uid and status = 'running' and created_at < now() - v_stale;

  -- 그림 설명은 그것끼리, 나머지 기능은 그림 설명을 빼고 셈
  select count(*) filter (where r.status = 'running' and r.created_at >= now() - v_stale),
         count(*) filter (where r.created_at >= now() - interval '60 seconds')
    into v_running, v_recent
    from public.ai_requests r
   where r.user_id = v_uid
     and r.created_at >= now() - v_stale
     and (case when v_describe then r.feature = 'material_describe' else r.feature is distinct from 'material_describe' end);

  if (p_batch and (v_running > 0 or v_recent + v_n > v_per_minute))
     or (not p_batch and (v_running >= v_running_max or v_recent >= v_per_minute)) then
    return jsonb_build_object('ok', false, 'running', v_running, 'recent', v_recent);
  end if;

  for i in 1 .. v_n loop
    insert into public.ai_requests (user_id, card_id, feature, mode, status, job, finish_key_hash)
    values (v_uid, p_card_id, p_feature, left(p_mode, 60), 'running', case when i = 1 then p_job end, p_key_hashes[i])
    returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;
  return jsonb_build_object('ok', true, 'ids', to_jsonb(v_ids));
end;
$$;
revoke all on function public.start_ai_request(text, text, text, text, text[], boolean) from public, anon;
grant execute on function public.start_ai_request(text, text, text, text, text[], boolean) to authenticated;

-- finish_ai_request (예전 정의: 20261117100000_material_parse_server_only.sql)
create or replace function public.finish_ai_request(
  p_id bigint,
  p_key text,
  p_status text,
  p_model text default null,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_cache_read_tokens integer default null,
  p_cache_write_tokens integer default null,
  p_cache_write_1h_tokens integer default null,
  p_error text default null,
  p_duration_ms integer default null,
  p_timings jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max_tokens constant integer := 2000000;
  v_timings jsonb := case when jsonb_typeof(p_timings) = 'object' and length(p_timings::text) <= 4000 then p_timings end;
begin
  if not private.app_write() then
    raise exception '앱 서버를 거친 요청만 받습니다' using errcode = '42501';
  end if;
  if auth.uid() is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('ok', 'error') or p_key is null then
    raise exception 'AI 호출 기록 끝맺기 값이 올바르지 않습니다' using errcode = '22023';
  end if;
  update public.ai_requests
     set status = p_status,
         model = coalesce(left(p_model, 100), model),
         input_tokens = coalesce(least(greatest(p_input_tokens, 0), v_max_tokens), input_tokens),
         output_tokens = coalesce(least(greatest(p_output_tokens, 0), v_max_tokens), output_tokens),
         cache_read_tokens = coalesce(least(greatest(p_cache_read_tokens, 0), v_max_tokens), cache_read_tokens),
         cache_write_tokens = coalesce(least(greatest(p_cache_write_tokens, 0), v_max_tokens), cache_write_tokens),
         cache_write_1h_tokens = coalesce(least(greatest(p_cache_write_1h_tokens, 0), v_max_tokens), cache_write_1h_tokens),
         error = coalesce(left(p_error, 300), error),
         finished_at = now(),
         duration_ms = coalesce(least(greatest(p_duration_ms, 0), 86400000), duration_ms),
         timings = coalesce(v_timings, timings),
         finish_key_hash = null
   where id = p_id
     and user_id = auth.uid()
     and status = 'running'
     and finish_key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  return found;
end;
$$;
revoke all on function public.finish_ai_request(bigint, text, text, text, integer, integer, integer, integer, integer, text, integer, jsonb) from public, anon;
grant execute on function public.finish_ai_request(bigint, text, text, text, integer, integer, integer, integer, integer, text, integer, jsonb) to authenticated;

-- report_submit_cards (예전 정의: 20261103100000_role_input_guards.sql)
create or replace function public.report_submit_cards(p_report_id bigint)
returns table (card_id text, task_no text, included boolean, sort integer, data_rev integer, has_draft boolean, has_outline boolean, spec_head jsonb, source_rev integer, mine boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.app_write() then
    raise exception '앱 서버를 거친 요청만 받습니다' using errcode = '42501';
  end if;
  return query
  select
    c.id,
    c.task_no,
    coalesce(o.included, true),
    o.sort,
    c.data_rev,
    d.card_id is not null,
    coalesce(jsonb_typeof(d.outline) <> 'null', false),
    case
      when jsonb_typeof(d.spec) = 'object' then jsonb_build_object(
        'version', d.spec -> 'version',
        'rows', case when jsonb_typeof(d.spec -> 'rows') = 'array' then '[]'::jsonb end,
        'blocks', case when jsonb_typeof(d.spec -> 'blocks') = 'array' then '[]'::jsonb end
      )
    end,
    d.source_rev,
    private.can_read_card(c.id)
  from public.reports r
  join public.eval_units u on u.id = r.eval_unit_id
  join public.cards c on c.eval_unit_id = r.eval_unit_id and c.team_id = r.team_id and c.status = 'active'
  left join public.report_outline o on o.card_id = c.id and o.year = r.year
  left join public.card_report_drafts d on d.card_id = c.id and d.year = r.year
  where r.id = p_report_id
    and private.can_read_report(r.id)
    and u.track = case when r.eval_unit_id ~ '^MG-' then '경영관리' else '주요사업' end
  order by o.sort nulls last, c.task_no;
end;
$$;
revoke all on function public.report_submit_cards(bigint) from public, anon;
grant execute on function public.report_submit_cards(bigint) to authenticated;

-- mg_biz_refs (예전 정의: 20261112100000_mg_biz_refs.sql)
create or replace function public.mg_biz_refs(p_card_id text, p_year integer)
returns table (biz_card_id text, uid text, group_name text, task_no text, title text, team_name text, stamp text, updated_at timestamptz, unknown_count integer, file_count integer, chars integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.app_write() then
    raise exception '앱 서버를 거친 요청만 받습니다' using errcode = '42501';
  end if;
  return query
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
  order by b.data ->> 'group', nullif(substring(b.task_no from '^\d+'), '')::integer nulls last, b.task_no;
end;
$$;
revoke all on function public.mg_biz_refs(text, integer) from public, anon;
grant execute on function public.mg_biz_refs(text, integer) to authenticated;

-- mg_biz_ref_texts (예전 정의: 20261112100000_mg_biz_refs.sql)
create or replace function public.mg_biz_ref_texts(p_card_id text, p_year integer, p_biz_ids text[])
returns table (biz_card_id text, group_name text, task_no text, title text, team_name text, data jsonb, spec jsonb, stamp text, updated_at timestamptz, unknown_numbers jsonb, files jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.app_write() then
    raise exception '앱 서버를 거친 요청만 받습니다' using errcode = '42501';
  end if;
  return query
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
  order by b.data ->> 'group', nullif(substring(b.task_no from '^\d+'), '')::integer nulls last, b.task_no;
end;
$$;
revoke all on function public.mg_biz_ref_texts(text, integer, text[]) from public, anon;
grant execute on function public.mg_biz_ref_texts(text, integer, text[]) to authenticated;

-- mg_biz_stale (예전 정의: 20261112100000_mg_biz_refs.sql)
create or replace function public.mg_biz_stale(p_card_ids text[], p_year integer)
returns table (card_id text, biz_card_id text, task_no text, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.app_write() then
    raise exception '앱 서버를 거친 요청만 받습니다' using errcode = '42501';
  end if;
  return query
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
  order by m.id, s.v ->> 'id';
end;
$$;
revoke all on function public.mg_biz_stale(text[], integer) from public, anon;
grant execute on function public.mg_biz_stale(text[], integer) to authenticated;

-- report_outline_context (예전 정의: 20260927170000_report_dept_submit.sql)
create or replace function public.report_outline_context(p_eval_unit text, p_year integer)
returns table (task_no text, title text, team_name text, section text, subsection text, sort integer, pages numeric, included boolean, mine boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.app_write() then
    raise exception '앱 서버를 거친 요청만 받습니다' using errcode = '42501';
  end if;
  return query
  select c.task_no, c.title, t.name, o.section, o.subsection, o.sort, o.pages, o.included, c.team_id = private.my_team()
  from public.report_outline o
  join public.cards c on c.id = o.card_id
  left join public.teams t on t.id = c.team_id
  where o.eval_unit_id = p_eval_unit
    and o.year = p_year
    and c.status = 'active'
    and (
      private.is_staff()
      or (
        private.my_team() is not null
        and (
          exists (select 1 from public.cards m where m.eval_unit_id = p_eval_unit and m.team_id = private.my_team() and m.status = 'active')
          or exists (select 1 from public.eval_units u where u.id = p_eval_unit and u.lead_team_id = private.my_team())
        )
      )
    )
  order by o.sort, c.task_no;
end;
$$;
revoke all on function public.report_outline_context(text, integer) from public, anon;
grant execute on function public.report_outline_context(text, integer) to authenticated;
