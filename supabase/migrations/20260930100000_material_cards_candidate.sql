-- 참고자료 3단계(3-4): 보고서 추가자료 ↔ 과제 연결에 「후보」 상태를 더함.
-- AI가 확신한 과제는 auto(화면에서 미리 체크), 애매하다고 한 과제는 candidate(체크 없이 「확인 필요」 — 사람이 고름), 사람이 고른 것은 confirmed.
-- 숫자 근거는 사람이 확정한 연결(confirmed)만 인정한다(docs/plan/참고자료-3단계-구현계획.md P3).
alter table public.report_material_cards drop constraint report_material_cards_status_check;
alter table public.report_material_cards add constraint report_material_cards_status_check check (status in ('auto', 'candidate', 'confirmed'));
comment on table public.report_material_cards is '보고서 추가자료↔과제 연결. auto=AI 확신 제안(확정 전), candidate=AI가 애매하다고 한 후보(사람이 고름), confirmed=사람이 고른 것(숫자 근거 인정)';
