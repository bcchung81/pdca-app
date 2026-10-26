-- AI 호출 기록: 진행 중(running)·끝맺기·소요 시간(2026-10-10 개선 계획 P0-3·B1 — docs/plan/코드-개선-계획.md).
-- 예전에는 AI가 끝난 뒤에야 행을 넣어 ① 1분 5회 제한이 5~10분짜리 진행 중 호출을 세지 못했고 ② 함수가 시간 제한에서 끊기면 쓴 토큰이 기록에서 빠졌고
-- ③ 걸린 시간을 몰라 운영에서 병목을 잴 수 없었음. 이제 호출 직전에 running 행을 넣고(제한에 셈), 끝나면 그 행을 ok·error로 끝맺으며 토큰·소요 시간을 채움.
-- 로그인 사용자는 자기 running 행의 결과 열만 고침(열 단위 권한 + 정책) — 끝난 행·남의 행·식별 열(user_id·feature·card_id·mode)은 못 고침.
-- 되돌리기(down): drop policy ai_requests_finish; revoke update on public.ai_requests from authenticated; drop index ai_requests_running_idx;
--   alter table public.ai_requests drop column timings, drop column duration_ms, drop column finished_at;
--   update public.ai_requests set status = 'error' where status = 'running'; 상태 check를 ('ok','error')로 되돌림

alter table public.ai_requests drop constraint if exists ai_requests_status_check;
alter table public.ai_requests add constraint ai_requests_status_check check (status in ('running', 'ok', 'error'));

alter table public.ai_requests
  add column finished_at timestamptz,
  add column duration_ms integer check (duration_ms is null or duration_ms >= 0),
  add column timings jsonb;
comment on column public.ai_requests.finished_at is '끝맺은 시각(running이면 null)';
comment on column public.ai_requests.duration_ms is '호출 시작(running 행을 넣은 때)부터 끝맺기까지 ms';
comment on column public.ai_requests.timings is '단계별 ms(prepare·call·fix·verify·save 등 — 있는 것만)';

-- 진행 중 호출 세기(사용자별 동시 실행 제한)
create index ai_requests_running_idx on public.ai_requests (user_id, created_at desc) where status = 'running';

grant update (status, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cache_write_1h_tokens, error, finished_at, duration_ms, timings) on public.ai_requests to authenticated;
create policy ai_requests_finish on public.ai_requests for update to authenticated
  using (user_id = (select auth.uid()) and status = 'running')
  with check (user_id = (select auth.uid()));
