-- 접속 기록 표(access_logs)·기록 rpc(log_access)와 AI 일시 중지 스위치(app_switches·set_ai_paused·start_ai_request 멈춤 확인) — 2026-11-18 관리 화면 기록 개선 2단계.
--
-- ① 접속 기록(「개인정보의 안전성 확보조치 기준」 제8조 — 식별자·접속일시·접속지·처리한 정보주체 정보·수행업무, 2026-11-18 사용자 결정 2·3)
--   무엇을: 로그인 성공(login)·하루 첫 접속(visit)·내려받기(download)·사용자 관리(user_manage)·AI 스위치(ai_switch) 한 줄씩.
--     화면 열람은 남기지 않습니다(결정 3). 권한 변경 내용 자체는 access_events(DB 트리거)에 따로 남고, 여기에는 작업 이름(op)만.
--   열: 누가(user_id = auth.uid()) · 언제(created_at) · 무엇을(action 허용 목록) · 대상(target — 과제 uid·평가단위·사용자 id 등) · 접속지(ip) · 기기 요약(ua) · 덧붙임(detail object).
--     user_id에 auth.users FK를 걸지 않습니다 — 이 앱의 사용자 「삭제」는 사용 중지이고, 계정을 지워도 기록은 남아야 하기 때문.
--   쓰기: 로그인 사용자에게 표 쓰기 권한을 주지 않고 rpc public.log_access로만 넣습니다(security definer, search_path ''):
--     맨 앞에서 앱 서버 경유 표지(private.app_write())를 확인하고(없으면 42501), user_id는 언제나 auth.uid()(남의 이름으로 못 씀),
--     action 허용 목록·길이·detail 크기를 검사합니다(어기면 22023). IP·기기는 앱 서버가 요청 머리글에서 읽어 넘깁니다(lib/ops/access-log.ts) —
--     표지 없는 직접 호출은 거절되므로 사용자가 앱 밖에서 IP를 꾸며 넣을 수 없습니다.
--   읽기: 관리자만(private.is_admin() — 사용 중지 관리자 제외). 「접속 기록」 화면 app/(app)/admin/access-log/page.tsx.
--   위·변조 방지(결정 2 — 수정·삭제 불가): 행 UPDATE·DELETE와 표 TRUNCATE를 막는 트리거. 트리거는 역할을 가리지 않아 서비스 키·postgres도 막힙니다.
--   보관: 1년 이상, 자동 삭제 없음. 정리(1년 넘은 행 — 보관 기간을 넘겨 지울 근거가 있을 때만)는 운영자가 SQL 편집기에서 한 트랜잭션으로:
--     begin; alter table public.access_logs disable trigger access_logs_no_delete;
--            delete from public.access_logs where created_at < now() - interval '<기간>';
--            alter table public.access_logs enable trigger access_logs_no_delete; commit;
--     (표 주인만 트리거를 끌 수 있음. 정리한 사실은 따로 기록해 둡니다.)
--   크기: target 200자 · ip 100자 · ua 200자 · detail object 4 KiB(20261117160000_size_checks.sql과 같은 꼴 — 앱은 더 작게 잘라 보냄).
--   용량 어림: 한 행 ≈ 0.3 KB(작은 칸뿐). 사용자 100명 × 하루 (로그인 1 + 첫 접속 1 + 내려받기 수 건) ≈ 하루 500행 ≈ 1년 18만 행 ≈ 60 MB 안쪽(색인 포함).
--
-- ② AI 일시 중지 스위치(AI보안 자체점검표 보완계획 1순위)
--   표 app_switches: 이름 하나(ai_paused)·켜짐(is_on)·사유·바꾼 사람·때. 기본 행은 꺼짐. 읽기는 로그인 사용자 전체(멈춤 안내), 직접 쓰기 권한은 없음.
--     열 이름은 is_on — 「on」은 SQL 예약어라 늘 따옴표가 필요해 피했습니다.
--   rpc set_ai_paused(p_on, p_reason): 표지 + 관리자(private.is_admin())만. 화면 components/admin/ai-switch.tsx → 서버 액션 app/(app)/admin/ai-switch-actions.ts.
--   start_ai_request: 표지·로그인 확인 바로 뒤에 멈춤이면 {"ok": false, "paused": true}를 돌려주고 running 행을 만들지 않습니다(lib/ai/request-log.ts가 안내 문구로 바꿈).
--     마지막 정의 20261117170000_material_parse_marker.sql을 그대로 옮기고 멈춤 확인 세 줄만 더했습니다(인자·반환형·권한·나머지 본문 그대로).
--     이미 시작한 호출(running)은 끝까지 돕니다 — 스위치는 새 시작만 막음.
--   rpc를 거치지 않는 AI 경로: 과제 매칭 처리기(lib/prep — 서비스 키, after()·/api/prep/run·pnpm prep run --ai)는 작업을 잡기 전마다 이 표를 읽고
--     멈춤이면 잡지 않고 남겨 둡니다(lib/prep/run.ts drainPrepJobs — 실패로 닫지 않음, 다음 처리 때 다시 함). 그래서 service_role에 읽기 권한을 줍니다.
--
-- 부르는 곳(2026-11-18): log_access ← lib/ops/access-log.ts(서버 액션·라우트의 lib/supabase/server.ts createClient — 표지를 실음,
--   proxy.ts의 하루 첫 접속 — proxy 클라이언트에는 표지가 없어 이 rpc 요청에만 머리글을 실음), set_ai_paused ← app/(app)/admin/ai-switch-actions.ts(createClient).
--
-- 운영 반영 순서: DB 먼저(pnpm db:push) → 앱 배포.
--   DB만 먼저면: 옛 앱은 새 rpc·표를 부르지 않으므로 그대로 동작(스위치는 꺼진 채 기본 행만 있음 — start_ai_request는 예전과 같은 답).
--   앱이 먼저면: log_access·set_ai_paused 호출이 「함수 없음」으로 실패 → 접속 기록은 console.error 한 줄만 남기고 사용자 일은 그대로(기록 실패가 막지 않음),
--     AI 스위치 단추는 「바꾸지 못했습니다」, 상태 읽기는 꺼짐으로 보임, 과제 매칭 처리기는 스위치를 못 읽으면 멈추지 않고 돌며(예전과 같음) 경고 한 줄.
--   반영 뒤 확인: 로그인 1회 → 「접속 기록」에 로그인·첫 접속 각 1줄, 카드 한글 내려받기 1회 → 내려받기 1줄, 스위치 켜기 → AI 요청이 멈춤 안내로 거절, 끄기 → 다시 됨.
--
-- 되돌리기(down — 앱을 먼저 이 변경 전으로 되돌린 뒤):
--   start_ai_request: 20261117170000_material_parse_marker.sql의 start_ai_request 정의와 바로 뒤 revoke·grant 두 줄을 다시 실행
--   drop function public.set_ai_paused(boolean, text);
--   drop table public.app_switches;
--   drop function public.log_access(text, text, text, text, jsonb);
--   drop table public.access_logs;   (트리거는 표와 함께 지워짐 — TRUNCATE·DELETE 막기는 drop table을 막지 않음. 기록을 지우게 되므로 먼저 내보내 보관)
--   drop function private.access_logs_immutable();

-- ── ① 접속 기록 ─────────────────────────────────────────────────────────────────────────────
create table public.access_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  action text not null check (action in ('login', 'visit', 'download', 'user_manage', 'ai_switch')),
  target text,
  ip text,
  ua text,
  detail jsonb,
  constraint access_logs_target_length check (char_length(target) <= 200),
  constraint access_logs_ip_length check (char_length(ip) <= 100),
  constraint access_logs_ua_length check (char_length(ua) <= 200),
  constraint access_logs_detail_size check (octet_length(detail::text) <= 4096),
  constraint access_logs_detail_shape check (jsonb_typeof(detail) = 'object')
);
comment on table public.access_logs is '접속 기록(고시 제8조): 로그인·하루 첫 접속·내려받기·사용자 관리·AI 스위치. rpc log_access로만 넣고 수정·삭제 불가, 1년 이상 보관(자동 삭제 없음)';
comment on column public.access_logs.user_id is '누가(auth.uid() — FK 없음: 계정을 지워도 기록은 남음)';
comment on column public.access_logs.target is '대상: 과제 uid·평가단위 id·사용자 id 등(없으면 null)';
comment on column public.access_logs.ip is '접속지: 앱 서버가 읽은 x-forwarded-for 첫 값(없으면 x-real-ip)';
comment on column public.access_logs.ua is '기기 요약(「브라우저 · OS」 — 앱 서버가 user-agent를 줄인 것)';
comment on column public.access_logs.detail is '덧붙임: 내려받기 {kind, name?}, 사용자 관리 {op, count?}, AI 스위치 {on, reason?} 등';
create index access_logs_created_idx on public.access_logs (created_at desc);
create index access_logs_user_idx on public.access_logs (user_id, created_at desc);

alter table public.access_logs enable row level security;
create policy access_logs_read on public.access_logs for select to authenticated using (private.is_admin());

revoke all on public.access_logs from public, anon, authenticated;
grant select on public.access_logs to authenticated;
grant select on public.access_logs to service_role;
revoke all on sequence public.access_logs_id_seq from public, anon, authenticated;

-- 위·변조 막기: 행 수정·삭제와 비우기는 누구도(서비스 키·postgres 포함) 못 함
create function private.access_logs_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '접속 기록은 고치거나 지울 수 없습니다' using errcode = '42501';
end;
$$;
comment on function private.access_logs_immutable() is '접속 기록 위·변조 막기 트리거: UPDATE·DELETE·TRUNCATE를 모두 거절(정리 절차는 20261118140000 머리 주석)';
revoke all on function private.access_logs_immutable() from public, anon, authenticated;

create trigger access_logs_no_update before update on public.access_logs
  for each row execute function private.access_logs_immutable();
create trigger access_logs_no_delete before delete on public.access_logs
  for each row execute function private.access_logs_immutable();
create trigger access_logs_no_truncate before truncate on public.access_logs
  for each statement execute function private.access_logs_immutable();

-- 기록 넣기(앱 서버만 — 표지, 자기 이름으로만)
create function public.log_access(p_action text, p_target text default null, p_ip text default null, p_ua text default null, p_detail jsonb default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not private.app_write() then
    raise exception '앱 서버를 거친 요청만 받습니다' using errcode = '42501';
  end if;
  if v_uid is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('login', 'visit', 'download', 'user_manage', 'ai_switch')
     or char_length(p_target) > 200 or char_length(p_ip) > 100 or char_length(p_ua) > 200
     or (p_detail is not null and (jsonb_typeof(p_detail) <> 'object' or octet_length(p_detail::text) > 4096)) then
    raise exception '접속 기록 값이 올바르지 않습니다' using errcode = '22023';
  end if;
  insert into public.access_logs (user_id, action, target, ip, ua, detail)
  values (v_uid, p_action, nullif(p_target, ''), nullif(p_ip, ''), nullif(p_ua, ''), p_detail);
end;
$$;
comment on function public.log_access(text, text, text, text, jsonb) is '접속 기록 한 줄(앱 서버 경유 표지 필요, 행위자 = auth.uid())';
revoke all on function public.log_access(text, text, text, text, jsonb) from public, anon;
grant execute on function public.log_access(text, text, text, text, jsonb) to authenticated;

-- ── ② AI 일시 중지 스위치 ──────────────────────────────────────────────────────────────────────
create table public.app_switches (
  name text primary key check (name in ('ai_paused')),
  is_on boolean not null default false,
  reason text check (char_length(reason) <= 200),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
comment on table public.app_switches is '운영 스위치. ai_paused = 관리자가 AI 기능을 잠시 멈춤(start_ai_request·과제 매칭 처리기가 확인). 쓰기는 rpc set_ai_paused만';
insert into public.app_switches (name, is_on) values ('ai_paused', false);

alter table public.app_switches enable row level security;
create policy app_switches_read on public.app_switches for select to authenticated using (true);

revoke all on public.app_switches from public, anon, authenticated;
grant select on public.app_switches to authenticated;
grant select on public.app_switches to service_role;

create function public.set_ai_paused(p_on boolean, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.app_switches%rowtype;
begin
  if not private.app_write() then
    raise exception '앱 서버를 거친 요청만 받습니다' using errcode = '42501';
  end if;
  if not private.is_admin() then
    raise exception '관리자만 바꿀 수 있습니다' using errcode = '42501';
  end if;
  if p_on is null or char_length(p_reason) > 200 then
    raise exception 'AI 스위치 값이 올바르지 않습니다' using errcode = '22023';
  end if;
  update public.app_switches
     set is_on = p_on, reason = nullif(btrim(p_reason), ''), updated_by = auth.uid(), updated_at = now()
   where name = 'ai_paused'
  returning * into v_row;
  return jsonb_build_object('on', v_row.is_on, 'reason', v_row.reason, 'updated_at', v_row.updated_at);
end;
$$;
comment on function public.set_ai_paused(boolean, text) is 'AI 일시 중지 켜기·끄기(앱 서버 경유 표지 + 관리자)';
revoke all on function public.set_ai_paused(boolean, text) from public, anon;
grant execute on function public.set_ai_paused(boolean, text) to authenticated;

-- start_ai_request (예전 정의: 20261117170000_material_parse_marker.sql — 바뀐 곳은 「AI 일시 중지」 확인 세 줄뿐)
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
  -- 관리자 AI 일시 중지(20261118140000) — 행을 만들지 않고 멈춤만 알림
  if exists (select 1 from public.app_switches s where s.name = 'ai_paused' and s.is_on) then
    return jsonb_build_object('ok', false, 'paused', true);
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
