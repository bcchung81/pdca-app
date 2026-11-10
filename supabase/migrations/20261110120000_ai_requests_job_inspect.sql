-- 월간 점검 AI 초안을 백그라운드 작업으로(2026-11-10 — lib/ai/jobs.ts JOB_KINDS.inspect, app/(app)/inspections/actions.ts runInspectionDraft).
-- 예전에는 서버 액션 안에서 5~8분 동기로 돌아 창을 닫거나 요청이 끊기면 호출이 멈출 수 있었음. 이제 작성지원·경평 초안처럼 서버 액션은 시작만 하고
-- AI 호출·검증·초안 저장은 응답 뒤 after()에서 돎(lib/ai/background.ts). ai_requests.job 허용값에 'inspect'를 더함(feature는 예전 그대로 'inspection', mode는 'pre'·'month').
--
-- 운영 반영 순서: db:push를 배포보다 먼저. 새 코드는 job = 'inspect'로 running 행을 넣으므로 이 제약이 없으면 AI 점검 시작이
--   「AI 호출 기록을 남기지 못해 요청을 멈췄습니다」로 실패함. 옛 코드는 점검에 job을 쓰지 않아(동기 호출 — job null) db:push만 먼저 돼도 깨지지 않음.
--
-- 되돌리기(down):
--   update public.ai_requests set job = null where job = 'inspect';
--   alter table public.ai_requests drop constraint ai_requests_job_check;
--   alter table public.ai_requests add constraint ai_requests_job_check check (job is null or job in ('outline', 'alts', 'part', 'plan', 'revise', 'draft', 'assist', 'chat', 'comment'));

alter table public.ai_requests drop constraint ai_requests_job_check;
alter table public.ai_requests add constraint ai_requests_job_check
  check (job is null or job in ('outline', 'alts', 'part', 'plan', 'revise', 'draft', 'assist', 'chat', 'comment', 'inspect'));
