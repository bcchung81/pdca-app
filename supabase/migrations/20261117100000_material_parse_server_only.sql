-- 첨부 「읽은 글」은 서버만 씀 + AI 호출 기록 값 상한(2026-11-17 시큐어 코딩 3차 — 교차 재점검 후속).
--
-- ① 첨부 읽은 글(card_materials·report_materials)
--   예전(20260929090000): 로그인 사용자에게 읽은 글 칸(sha256·parsed_text·parse_status·parser_version·parsed_at·parse_error·parsed_chars)의
--   update와 표 전체 insert가 열려 있어, 앱의 파서 결과가 아닌 글도 저장될 수 있었음. 이 글은 AI 요청의 첨부 원문이자
--   경평 초안 숫자 대조(없는 숫자 다시 세기)의 근거라 무결성이 필요함.
--   이제:
--     · authenticated의 update를 모두 거둠(열 단위 grant 포함 — 표 단위 revoke가 열 권한도 거둠). 다른 update 칸이 없으므로
--       update 정책 card_materials_update·report_materials_update도 지움.
--     · insert는 등록 칸만(id·소속·경로·이름·형식·크기·올린 사람) — 읽은 글 칸은 기본값(pending·비어 있음)으로만 들어감.
--     · 읽은 글은 서버가 저장소에서 사용자 권한으로 직접 내려받아 읽은 결과만 서비스 키로 씀(lib/ai/attachments.ts parseAndStore →
--       lib/ai/material-text.ts saveParsed — 쓰기 전에 사용자 권한으로 그 행을 읽을 수 있는지·경로가 방금 읽은 파일과 같은지 확인).
--     · 서비스 키는 RLS를 건너뛰므로 보고서 제출·확정 잠금을 다시 보지 않음: 읽은 글은 (저장소 파일, 파서 판)으로 정해지는 값이고
--       파일 경로는 누구도 못 바꾸며(update 권한 없음) 저장소 파일도 덮어쓸 수 없음(update 정책 없음). 누가 읽기를 일으켜도 같은 글이 들어감.
--
-- ② 권한 변경 기록(access_events)에 ban_failed(사용 중지·복구 때 로그인 차단 실패 — 앱이 서비스 키로 남김)를 더함(표 설명만).
--
-- ③ AI 호출 기록 rpc(20261116110000) 값 상한 — 직접 부른 자기 행에 아무 값이나 적는 것을 줄임
--     · start_ai_request: 기능 이름은 허용 목록만(lib/ai/models.ts FEATURE_TIER와 같은 목록 — lib/db/migrations.test.ts가 대조), mode는 60자까지
--     · finish_ai_request: model 100자, 토큰 수 0~200만(호출 한 번), 소요 시간 0~하루, timings는 객체·4,000자까지(넘으면 비움)
--
-- 운영 반영 순서: 새 코드 배포 먼저 → 바로 pnpm db:push.
--   새 코드는 읽은 글을 서비스 키로 쓰므로 이 마이그레이션 전에도 동작함. 거꾸로(db:push 먼저)면 그 사이 옛 코드의 읽은 글 저장이
--   거절돼 첨부가 「아직 안 읽음」으로 남음(요청 때마다 다시 읽음 — 기능은 동작). ③은 지금 코드가 쓰는 값과 같아 순서 무관.
--
-- 되돌리기(down):
--   grant update (sha256, parsed_text, parse_status, parser_version, parsed_at, parse_error, parsed_chars) on public.card_materials to authenticated;
--   grant update (sha256, parsed_text, parse_status, parser_version, parsed_at, parse_error, parsed_chars) on public.report_materials to authenticated;
--   create policy card_materials_update on public.card_materials for update to authenticated
--     using (private.can_write_card(card_id)) with check (private.can_write_card(card_id));
--   create policy report_materials_update on public.report_materials for update to authenticated
--     using (private.can_edit_report_content(report_id)) with check (private.can_edit_report_content(report_id));
--   grant insert on public.card_materials, public.report_materials to authenticated;
--   start_ai_request·finish_ai_request는 20261116110000_ai_requests_rpc.sql의 두 함수 정의를 다시 실행

-- ── ① 첨부 읽은 글 ──────────────────────────────────────────────────────────────────────────
revoke update on public.card_materials, public.report_materials from authenticated;
drop policy card_materials_update on public.card_materials;
drop policy report_materials_update on public.report_materials;

revoke insert on public.card_materials, public.report_materials from authenticated;
grant insert (id, card_id, storage_path, file_name, mime_type, bytes, uploaded_by) on public.card_materials to authenticated;
grant insert (id, report_id, storage_path, file_name, mime_type, bytes, uploaded_by) on public.report_materials to authenticated;

comment on column public.card_materials.parsed_text is '서버가 저장소 파일을 읽은 전체 글(서비스 키로만 씀 — 20261117100000). AI 첨부 원문·숫자 근거';
comment on column public.report_materials.parsed_text is '서버가 저장소 파일을 읽은 전체 글(서비스 키로만 씀 — 20261117100000). AI 첨부 원문·숫자 근거';

-- ── ② 권한 변경 기록 ─────────────────────────────────────────────────────────────────────────
comment on table public.access_events is '누가 누구의 계정·부서·활성·과제 담당을 바꿨나(DB 트리거가 남김, 계정 만들기·로그인 차단 실패만 앱이 서비스 키로). action: user_added · user_updated · user_deactivated · user_restored · assigned · unassigned · ban_failed. 행위자 없음(actor_id null)은 서비스 키·DB 직접 변경(detail.via = system)';

-- ── ③ AI 호출 기록 값 상한 ───────────────────────────────────────────────────────────────────
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

-- 끝맺기: 주인·running·키가 맞을 때만. 값은 호출 한 번의 상식 범위로 자름(토큰 0~200만, 소요 시간 0~하루, timings 객체 4,000자)
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
