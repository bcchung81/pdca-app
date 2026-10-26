-- 참고자료 3단계 3-5 재정의(2026-09-30) 정리: 쓰지 않게 된 표·예약 값을 걷어낸다(docs/plan/참고자료-3단계-구현계획.md 「3-5 재정의」).
--  · 근거 목록표는 요청 때 계산한다 → card_context_manifest 표 삭제(운영 0행)
--  · 보고서 추가자료의 과제는 사람이 고른다(AI 제안 없음) → report_material_cards는 confirmed만
--  · 처리기가 있는 작업은 공통 지식 매칭뿐 → prep_jobs.kind는 match_knowledge만
-- 지우는 행은 모두 AI가 만든 제안·처리한 작업 기록이고, 사람이 확정한 연결(confirmed)과 대응표는 건드리지 않는다.

-- ── 1) 근거 목록표 ─────────────────────────────────────────────────────────────────────────
drop table public.card_context_manifest;

-- ── 2) 보고서 추가자료 ↔ 과제: 사람이 확정한 것만 ──────────────────────────────────────────
delete from public.report_material_cards where status <> 'confirmed';
alter table public.report_material_cards drop constraint report_material_cards_status_check;
alter table public.report_material_cards add constraint report_material_cards_status_check check (status = 'confirmed');
alter table public.report_material_cards alter column status set default 'confirmed';
comment on table public.report_material_cards is '보고서 추가자료↔과제 연결. 사람이 고른 것만 담음(status = confirmed) — 이 자료의 수치를 그 과제 초안의 숫자 근거로 인정. 연결이 없으면 「같은 보고서 자료」(초안에는 넣되 숫자 근거 아님)';

-- ── 3) 작업 대기열: 공통 지식 매칭만 ───────────────────────────────────────────────────────
delete from public.prep_jobs where kind <> 'match_knowledge'; -- ai_requests.job_id는 on delete set null
alter table public.prep_jobs drop constraint prep_jobs_kind_check;
alter table public.prep_jobs add constraint prep_jobs_kind_check check (kind = 'match_knowledge');
comment on table public.prep_jobs is '공통 지식 매칭 작업 대기열. 등록은 로그인 사용자 권한(RLS), 처리는 서버 처리기(비밀 키). kind = match_knowledge, target = cards.id';

-- 작업 등록 권한: 그 카드를 쓸 수 있는 사람(자료 매칭 분기는 없앰)
create or replace function private.can_enqueue_prep(p_kind text, p_target text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_kind = 'match_knowledge' and private.can_write_card(p_target)
$$;
grant execute on function private.can_enqueue_prep(text, text) to authenticated, service_role;
