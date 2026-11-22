-- 사용자 결정 반영(2026-11-22 저녁, QA 라운드 결정 D4) — 경영관리 카드 밖 부분(R5, eval_unit_report_parts) 쓰기는 성과관리팀 이상만.
--
-- 왜: 예전 private.can_write_unit_parts(20261016100000)는 성과관리팀·관리자 + 주관 부서(eval_units.lead_team_id)에게 쓰기를 허용했음.
--   그런데 카드 밖 부분의 재료(lib/reports/unit-parts-queries.ts loadUnitMaterials)는 사용자 권한(RLS)으로 읽고, 부서 담당자는 지정된 과제의 카드·초안만 읽으므로
--   (20261001100000 — 주관 부서의 카드 전체 읽기 예외 없앰) 주관 부서 담당자가 「재료로 다시 채우기」를 하면 일부 카드로만 code 칸·행이 다시 만들어지고
--   나머지 행이 「사라진 행」으로 빠진 채 저장될 수 있었음(QA Q3-04). 쓰기 권한과 재료 범위를 맞추려고 쓰기를 성과관리팀 이상만으로 좁힘.
--   읽기(private.can_read_unit_parts — 성과관리팀·관리자 + 그 지표·연도에 보고서 행이 있는 부서 + 주관 부서)·확정 가드(guard_unit_report_part)·지우기 정책은 그대로.
--   서명·language sql·stable·security definer·search_path = ''는 예전 정의와 같고, create or replace라 grant(authenticated·service_role 실행)는 그대로 남음.
--   정책(eval_unit_report_parts_insert·update — 20261117130000의 app_write 표지 포함)은 이 함수를 부르므로 바꾸지 않음.
-- 영향: 운영 경영관리 14개 지표 모두 주관 부서가 비어 있고 화면(/reports/business/<지표>/parts)은 성과관리팀 이상만 열려서 바뀌는 사용 흐름 없음.
--   주요사업 지표(BZ-n)에 주관 부서가 지정돼 있어도 이 표에는 주요사업 행을 쓰는 곳이 없음(서버 액션이 MG-N만 받음).
-- 서버: app/(app)/reports/business/[unit]/parts/actions.ts가 같은 판정(lib/reports/unit-parts-edit.ts canWriteUnitParts — 성과관리팀 이상)으로 먼저 거절.
-- 운영 반영 순서: 무관. 앱이 주관 부서 쓰기에 기대는 곳이 없어 배포 전·후 어느 쪽에 db:push해도 됨(먼저 올리면 옛 서버가 주관 부서에게 단추를 보여도 저장은 RLS가 거절 — 운영 주관 부서 0곳이라 실제로 안 생김).
-- 역할별 사례: lib/db/migrations.test.ts 「지표 단위 부분(eval_unit_report_parts, R5b)」.
-- 확인: select pg_get_functiondef('private.can_write_unit_parts(text)'::regprocedure);  -- 본문이 private.is_staff()만
--       select obj_description('private.can_write_unit_parts(text)'::regprocedure, 'pg_proc');
-- 되돌리기(down — 예전 정의로):
--   create or replace function private.can_write_unit_parts(p_eval_unit text)
--   returns boolean language sql stable security definer set search_path = '' as $$
--     select private.is_staff() or (
--       private.my_team() is not null
--       and exists (select 1 from public.eval_units u where u.id = p_eval_unit and u.lead_team_id = private.my_team())
--     )
--   $$;
--   comment on function private.can_write_unit_parts(text) is '지표 단위 부분 쓰기: 성과관리팀·관리자, 주관 부서(eval_units.lead_team_id)';

-- 쓰기: 성과관리팀·관리자만(주관 부서는 읽기만). p_eval_unit은 정책이 넘기는 서명을 지키려고 둠
create or replace function private.can_write_unit_parts(p_eval_unit text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff()
$$;
comment on function private.can_write_unit_parts(text) is '지표 단위 부분 쓰기: 성과관리팀·관리자만(2026-11-22 결정 — 주관 부서는 읽기만, 서버 canWriteUnitParts와 같음)';
