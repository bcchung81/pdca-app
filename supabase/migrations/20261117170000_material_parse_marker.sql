-- 첨부 「읽은 글」 쓰기를 서비스 키에서 사용자 권한 + 앱 서버 경유 표지로 되돌림 · 사용 중지 계정의 AI 호출 시작 거절 ·
-- 카드 영구 삭제 감사 기록(2026-11-17 웹 취약점 점검 마무리 C).
--
-- ① 첨부 읽은 글(card_materials·report_materials)
--   3차(20261117100000)는 로그인 사용자가 앱 밖에서 읽은 글을 바꿔 적는 것을 막으려고 그 칸의 update를 거두고 서버가 서비스 키로 썼음
--   (lib/ai/material-text.ts saveParsed). 서비스 키는 RLS·잠금을 모두 건너뛰고 「서비스 키는 Auth 관리 API 때만」 원칙의 예외였음.
--   이제 모든 쓰기 정책에 앱 서버 경유 표지(private.app_write() — 20261117120000·20261117140000)가 있어 앱 밖 직접 쓰기는 막히므로,
--   읽은 글 칸 7개(sha256·parsed_text·parse_status·parser_version·parsed_at·parse_error·parsed_chars)의 열 단위 update만
--   로그인 사용자에게 다시 주고, 행 판정은 그 자료를 지울 수 있는 사람과 같게 둠:
--     · 카드 전용 자료: 카드 쓰기 권한(can_write_card) + 잠긴 근거가 아님(not card_material_locked — 20261104100000).
--       잠금을 더한 까닭: 확정(제출·승인)한 보고서 초안·구성안의 근거 자료는 읽은 글도 그대로 둠(확정본의 숫자 근거가 파서 판 변경으로 바뀌지 않게
--       — 3차 재점검 「카드 자료는 확정 뒤에도 고칠 수 있음」). 정상 흐름은 막지 않음: 올린 직후 읽기는 새 자료라 아직 어느 초안의 근거도 아님.
--       잠긴 자료가 낡은 판이면(파서 판을 올린 뒤) 저장만 거절되고 요청 때마다 다시 읽어 씀(기능은 동작 — 확정을 풀면 다시 저장됨).
--     · 보고서 추가자료: 3차 전 정책 그대로(can_edit_report_content — 팀은 제출 전, 성과관리팀·관리자는 늘).
--     · 갱신은 WITH CHECK에 표지(USING은 행 판정만 — 다른 쓰기 정책과 같은 모양, 표지 없는 갱신은 RLS 오류).
--     · 다른 칸(card_id·report_id·storage_path·file_name 등)은 update 권한이 없어 누구도 못 바꿈. 넣기는 3차대로 등록 칸만.
--   앱: saveParsed가 사용자 권한 클라이언트(서버 액션 createClient·백그라운드 createJobClient — 둘 다 표지를 실음)로 씀.
--   쓰기 전 「사용자에게 보이는 행 + 경로가 방금 읽은 파일과 같음」 확인은 그대로.
--
-- ② start_ai_request: 사용 중지 계정(profiles.active = false — private.my_role()이 비어 있음) 거절.
--   예전엔 auth.uid()만 봐서 사용 중지된 계정이 남은 토큰 수명 동안 호출 기록을 시작할 수 있었음(재점검 T2 N3).
--   첫 문장 표지 확인은 그대로 첫 문장(grants.test.ts 구조 시험), 로그인 확인 바로 뒤에 활성 확인. 나머지 본문은 20261117150000 그대로.
--
-- ③ 카드 영구 삭제 감사 기록: cards 행이 지워지면 DB 트리거가 access_events에 card_purged 한 줄
--   (행위자 = auth.uid(), 대상 사용자 없음, detail = 카드 id·과제번호·제목·평가단위·상태). 영구 삭제는 그 카드의 card_edits도 연쇄로 지우므로
--   이력이 남지 않았음(재점검 T4 주의). 로그인 사용자는 access_events에 못 씀(20261116120000) — 트리거만 남기므로 위조·누락 없음.
--   서비스 키·DB 직접 연결(시드·초기화 스크립트)로 지운 것도 actor_id null·detail.via = system으로 남김.
--
-- 운영 반영 순서: pnpm db:push 먼저 → 그다음 앱 배포(①의 saveParsed 변경).
--   거꾸로(배포 먼저)면 배포 ~ db:push 사이 새 코드의 읽은 글 저장이 권한 오류로 실패해 첨부가 「아직 안 읽음」으로 남음(요청 때마다 다시 읽음).
--   db:push 먼저면 그 사이 옛 코드는 서비스 키로 쓰므로 그대로 동작. ②③은 앱 변경이 없어 순서 무관.
--   반영 뒤 확인: 카드 전용 자료·보고서 추가자료를 하나씩 올려 목록에 「읽음」(글자 수)이 뜨는지(= parse_status parsed).
--
-- 되돌리기(down — 앱을 먼저 이 변경 전 saveParsed(서비스 키)로 되돌린 뒤):
--   drop policy card_materials_update on public.card_materials;
--   drop policy report_materials_update on public.report_materials;
--   revoke update on public.card_materials, public.report_materials from authenticated;
--   comment on column public.card_materials.parsed_text is '서버가 저장소 파일을 읽은 전체 글(서비스 키로만 씀 — 20261117100000). AI 첨부 원문·숫자 근거';
--   comment on column public.report_materials.parsed_text is '서버가 저장소 파일을 읽은 전체 글(서비스 키로만 씀 — 20261117100000). AI 첨부 원문·숫자 근거';
--   start_ai_request: 20261117150000_app_write_rpcs.sql의 start_ai_request 정의와 바로 뒤 revoke·grant 두 줄을 다시 실행
--   drop trigger cards_purge_event on public.cards;
--   drop function private.log_card_purge_event();
--   comment on table public.access_events는 20261117100000_material_parse_server_only.sql의 문장을 다시 실행

-- ── ① 첨부 읽은 글 ──────────────────────────────────────────────────────────────────────────
grant update (sha256, parsed_text, parse_status, parser_version, parsed_at, parse_error, parsed_chars) on public.card_materials to authenticated;
grant update (sha256, parsed_text, parse_status, parser_version, parsed_at, parse_error, parsed_chars) on public.report_materials to authenticated;

create policy card_materials_update on public.card_materials for update to authenticated
  using (private.can_write_card(card_id) and not private.card_material_locked(storage_path))
  with check (private.can_write_card(card_id) and not private.card_material_locked(storage_path) and private.app_write());

create policy report_materials_update on public.report_materials for update to authenticated
  using (private.can_edit_report_content(report_id))
  with check (private.can_edit_report_content(report_id) and private.app_write());

comment on column public.card_materials.parsed_text is '서버가 저장소 파일을 읽은 전체 글(앱 서버가 사용자 권한으로 씀 — 20261117170000, 잠긴 근거는 못 바꿈). AI 첨부 원문·숫자 근거';
comment on column public.report_materials.parsed_text is '서버가 저장소 파일을 읽은 전체 글(앱 서버가 사용자 권한으로 씀 — 20261117170000, 제출 뒤 부서는 못 바꿈). AI 첨부 원문·숫자 근거';

-- ── ② AI 호출 시작: 사용 중지 계정 거절 ───────────────────────────────────────────────────────
-- start_ai_request (예전 정의: 20261117150000_app_write_rpcs.sql — 바뀐 곳은 「사용 중지」 확인 세 줄뿐)
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
  -- 사용 중지(profiles.active = false)·프로필 없는 계정 — my_role()은 활성 프로필의 역할만 돌려줌
  if private.my_role() is null then
    raise exception '사용 중지된 계정입니다' using errcode = '42501';
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

-- ── ③ 카드 영구 삭제 감사 기록 ───────────────────────────────────────────────────────────────
create or replace function private.log_card_purge_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  insert into public.access_events (actor_id, target_user_id, action, detail)
  values (
    v_actor,
    null,
    'card_purged',
    jsonb_build_object('card_id', old.id, 'task_no', old.task_no, 'title', old.title, 'eval_unit_id', old.eval_unit_id, 'status', old.status)
      || case when v_actor is null then jsonb_build_object('via', 'system') else '{}'::jsonb end
  );
  return null;
end;
$$;
create trigger cards_purge_event after delete on public.cards
  for each row execute function private.log_card_purge_event();
revoke execute on function private.log_card_purge_event() from public, anon, authenticated;

comment on table public.access_events is '누가 누구의 계정·부서·활성·과제 담당을 바꿨나, 누가 어느 과제를 영구 삭제했나(DB 트리거가 남김, 계정 만들기·로그인 차단 실패만 앱이 서비스 키로). action: user_added · user_updated · user_deactivated · user_restored · assigned · unassigned · ban_failed · card_purged(대상 사용자 없음, detail에 카드 id·과제번호·제목). 행위자 없음(actor_id null)은 서비스 키·DB 직접 변경(detail.via = system)';
