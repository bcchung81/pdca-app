-- 경평 초안 구성안(재료표·짜임 — 담당자가 보고 고친 뒤 승인하면 그 짜임대로 집필). 구현 계획 2단계(docs/plan/경평초안-구현계획.md).
-- 과제·연도당 하나라 초안 행에 칸을 더합니다(2026-09-27 사용자 결정). 권한은 초안과 같습니다(읽기 can_read_card, 쓰기 can_write_card).
-- 구성안만 있고 아직 초안이 없는 행을 두려고 spec의 NOT NULL을 풀고, 둘 다 비는 행은 막습니다.

alter table public.card_report_drafts alter column spec drop not null;

alter table public.card_report_drafts
  add column outline jsonb,
  add column outline_status text check (outline_status in ('draft', 'approved')),
  add column outline_warnings jsonb not null default '[]'::jsonb,
  add column outline_model text,
  add column outline_at timestamptz,
  add column outline_approved_by uuid references auth.users (id),
  add column outline_approved_at timestamptz;

alter table public.card_report_drafts
  add constraint card_report_drafts_has_content check (spec is not null or outline is not null),
  add constraint card_report_drafts_outline_status check ((outline is null) = (outline_status is null));

comment on column public.card_report_drafts.spec is '소항목 초안 spec(lib/reports/section.ts) — 구성안만 만든 행은 null';
comment on column public.card_report_drafts.outline is '구성안(lib/reports/composition.ts Composition): 재료표·핵심 메시지·평가 논점·이야기 틀·블록 목록·그림 자리·담당자 메모';
comment on column public.card_report_drafts.outline_status is 'draft = 담당자 확인 전, approved = 승인(그 짜임대로 집필)';
