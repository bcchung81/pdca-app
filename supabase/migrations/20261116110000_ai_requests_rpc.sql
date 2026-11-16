-- AI 호출 기록(ai_requests)의 시작·끝맺기를 rpc로만(2026-11-16 웹 취약점 점검).
-- 예전(20260925090900·20261010100000)에는 로그인 사용자에게 insert와 결과 열 update를 열어 두고 앱(lib/ai/request-log.ts)이
-- 「세고 나서 넣기」와 「running 행 끝맺기」를 사용자 권한으로 했음. 그래서 사용자가 공개 키 + 자기 토큰으로 직접
--   ① PATCH ai_requests?status=eq.running {"status":"ok"} — 진행 중 행을 닫아 동시 2건 제한을 풀고(앱의 finish는 running 행만 고쳐 토큰 기록도 빠짐)
--   ② POST ai_requests — 가짜 토큰 행을 넣어 AI 사용량 화면(성과관리팀)을 오염
-- 할 수 있었고, ③ 동시 요청 경쟁으로 1분 5회를 넘을 수 있었음.
--
-- 이제:
--   · authenticated의 insert·update를 거둠(운영 DB에는 Supabase 기본 권한(테이블 ALL)이 남아 있을 수 있어 열 단위 grant에 기대지 않고 명시적으로 revoke).
--     읽기(ai_requests_read)는 그대로. 서비스 키(처리기 lib/prep — service_role)는 영향 없음.
--   · public.start_ai_request: 사용자별 advisory lock 안에서 ① 끝맺지 못한 오래된 running 행(20분) 닫기 ② 최근 1분 수·진행 중 수 세기
--     ③ 한도 판정 ④ running 행 넣기를 한 번에(원자적). 한도는 이 함수에 고정(호출자가 정하지 못함 — 직접 불러 한도를 풀 수 없게):
--       일반 AI 기능: 1분 5건·동시 2건(여러 안 묶음은 진행 중 0건일 때만, 1분 상한에 n건으로 셈) — TS AI_LIMITS
--       첨부 그림 설명(material_describe — 따로 셈): 1분 15건·동시 3건 — TS DESCRIBE_LIMITS
--       값은 lib/db/migrations.test.ts가 TS 상수로 행동을 대조함. 바꾸면 이 함수와 TS 상수를 함께.
--     card_id가 있으면 예전 insert 정책과 같은 읽기 권한(private.can_read_card). auth.uid()가 없으면 거절.
--     끝맺기 키: 서버가 만든 난수 키의 sha256(hex)를 행(finish_key_hash)에 둠 — 키 자체는 서버 메모리(끝맺기 클로저)에만 있음.
--   · public.finish_ai_request: 주인(auth.uid())·running·키 해시가 맞을 때만 결과 열(상태·모델·토큰·오류·소요 시간·단계 시간)을 씀.
--     키를 모르는 사용자는 서버가 시작한 행을 닫지 못함. (자기가 직접 start를 불러 만든 행은 끝맺을 수 있으나, 그 행도 한도에 세여 1분 5건을 넘지 못함)
--
-- 운영 반영 순서(중요): 새 코드는 이 rpc가 없으면 AI 요청 시작이 실패하고, 옛 코드는 revoke 뒤 insert·update가 거절돼 실패함.
--   그래서 pnpm db:push 직후 바로 배포. 그 사이(몇 분) AI 요청(작성지원·질문·코멘트·점검·경평 초안·첨부 그림 설명)이 실패함 — 사용이 적은 때에.
--   그림 설명이 실패하면 첨부는 「읽기 보류」로 등록되고 요청 때 다시 읽음.
--
-- 되돌리기(down):
--   drop function public.finish_ai_request(bigint, text, text, text, integer, integer, integer, integer, integer, text, integer, jsonb);
--   drop function public.start_ai_request(text, text, text, text, text[], boolean);
--   alter table public.ai_requests drop column finish_key_hash;
--   grant insert on public.ai_requests to authenticated;
--   grant update (status, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cache_write_1h_tokens, error, finished_at, duration_ms, timings) on public.ai_requests to authenticated;
--   create policy ai_requests_insert … / create policy ai_requests_finish … (20260925090900_autosave_ai.sql·20261010100000_ai_requests_running.sql 본문)

alter table public.ai_requests add column finish_key_hash text;
comment on column public.ai_requests.finish_key_hash is '끝맺기 키의 sha256(hex) — 키는 시작한 서버 메모리에만. 끝맺으면 비움';

revoke insert, update on public.ai_requests from authenticated;
drop policy ai_requests_insert on public.ai_requests;
drop policy ai_requests_finish on public.ai_requests;

-- 시작: 결과 {ok: true, ids: [...]} 또는 {ok: false, running, recent}(한도에 걸림 — 안내 글은 TS가 만듦)
-- p_key_hashes = 넣을 행마다 끝맺기 키 해시(행 수). p_batch = 여러 안 묶음(같은 요청 n번을 동시에) 판정. job은 첫 행에만
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
  if v_uid is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;
  if p_feature is null or v_n < 1 or (not p_batch and v_n <> 1) or v_n > v_per_minute
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
    values (v_uid, p_card_id, p_feature, p_mode, 'running', case when i = 1 then p_job end, p_key_hashes[i])
    returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;
  return jsonb_build_object('ok', true, 'ids', to_jsonb(v_ids));
end;
$$;
revoke all on function public.start_ai_request(text, text, text, text, text[], boolean) from public, anon;
grant execute on function public.start_ai_request(text, text, text, text, text[], boolean) to authenticated;
comment on function public.start_ai_request(text, text, text, text, text[], boolean) is 'AI 호출 시작: 사용자별 잠금 안에서 오래된 running 닫기 → 한도 판정 → running 행(끝맺기 키 해시). lib/ai/request-log.ts';

-- 끝맺기: 주인·running·키가 맞을 때만. 고쳤으면 true(이미 끝났거나 키가 틀리면 false — 두 번 불러도 처음 것이 남음)
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
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('ok', 'error') or p_key is null then
    raise exception 'AI 호출 기록 끝맺기 값이 올바르지 않습니다' using errcode = '22023';
  end if;
  update public.ai_requests
     set status = p_status,
         model = coalesce(p_model, model),
         input_tokens = coalesce(p_input_tokens, input_tokens),
         output_tokens = coalesce(p_output_tokens, output_tokens),
         cache_read_tokens = coalesce(p_cache_read_tokens, cache_read_tokens),
         cache_write_tokens = coalesce(p_cache_write_tokens, cache_write_tokens),
         cache_write_1h_tokens = coalesce(p_cache_write_1h_tokens, cache_write_1h_tokens),
         error = coalesce(left(p_error, 300), error),
         finished_at = now(),
         duration_ms = coalesce(p_duration_ms, duration_ms),
         timings = coalesce(p_timings, timings),
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
comment on function public.finish_ai_request(bigint, text, text, text, integer, integer, integer, integer, integer, text, integer, jsonb) is 'AI 호출 끝맺기: 주인·running·끝맺기 키가 맞을 때만 결과 열을 씀. lib/ai/request-log.ts';
