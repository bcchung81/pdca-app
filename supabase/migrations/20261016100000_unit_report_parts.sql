-- 경평 초안 지표(평가단위) 단위 부분(R5b — 설계 docs/plan/경영관리-R5-지표단위-설계.md §3.3·§3.4, 2026-10-16 승인 Q2·Q3).
-- 경영관리 지표별 보고서에서 과제별 초안이 쓰지 않는 부분(표지·지적사항 조치실적·전년 대비 주요 추진실적·성과분석 및 환류)을
-- 평가단위 × 연도 × 부분마다 한 행으로 둡니다. 부분마다 행이라 한 사람이 지적 표를, 다른 사람이 성과분석을 고쳐도 서로 덮지 않고,
-- 저장은 읽을 때의 updated_at이 그대로일 때만(버전 조건 — lib/reports/draft-store.ts saveUnitPartRow).
-- 권한: 읽기 = 성과관리팀·관리자 전체 + 그 지표·연도에 보고서 행이 있는 부서(reports.team_id — 보고서처럼 팀 단위, 담당자 지정과 무관) + 주관 부서,
--       쓰기 = 성과관리팀·관리자 + 주관 부서(eval_units.lead_team_id — 경영관리는 지금 14개 모두 비어 있어 사실상 성과관리팀). 확정(status)은 성과관리팀 이상.
-- 표·권한 함수는 두 트랙 공용(Q10 — 주요사업 「사업 공통 부분」도 부분 키만 더해 씀). 부분 키 허용 목록은 지금 경영관리 넷(lib/tracks TrackSpec.unitParts와 같음).
-- 되돌리기(down): drop table public.eval_unit_report_parts; drop function private.guard_unit_report_part(), private.can_read_unit_parts(text, integer), private.can_write_unit_parts(text);

create table public.eval_unit_report_parts (
  eval_unit_id text not null references public.eval_units (id),
  year integer not null check (year between 2020 and 2100),
  part text not null check (part in ('cover', 'findings', 'prior', 'outcome')),
  spec jsonb not null,
  source jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  model text,
  prompt_version text,
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (eval_unit_id, year, part)
);
comment on table public.eval_unit_report_parts is '경평 초안 지표 단위 부분(평가단위 × 연도 × 부분): 경영관리 지표별 보고서의 표지·지적사항 조치실적·전년 대비·성과분석 및 환류. spec = 부분 내용(칸마다 code·ai·human — lib/reports/unit-parts-mg.ts), source = 재료 판, updated_at = 버전 조건';
comment on column public.eval_unit_report_parts.status is 'draft · confirmed(성과관리팀 확정 — 표시용, 확정 뒤에도 성과관리팀은 고침)';
create trigger eval_unit_report_parts_touch before update on public.eval_unit_report_parts
  for each row execute function private.touch_updated_at();

-- 읽기: 성과관리팀·관리자 전체, 그 지표·연도에 보고서 행이 있는 부서, 주관 부서(보고서처럼 팀 단위 — can_read_report와 같은 결)
create or replace function private.can_read_unit_parts(p_eval_unit text, p_year integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff() or (
    private.my_team() is not null
    and (
      exists (select 1 from public.reports r where r.eval_unit_id = p_eval_unit and r.year = p_year and r.team_id = private.my_team())
      or exists (select 1 from public.eval_units u where u.id = p_eval_unit and u.lead_team_id = private.my_team())
    )
  )
$$;
comment on function private.can_read_unit_parts(text, integer) is '지표 단위 부분 읽기: 성과관리팀·관리자 전체, 그 지표·연도에 보고서 행이 있는 부서, 주관 부서';

-- 쓰기: 성과관리팀·관리자, 주관 부서
create or replace function private.can_write_unit_parts(p_eval_unit text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff() or (
    private.my_team() is not null
    and exists (select 1 from public.eval_units u where u.id = p_eval_unit and u.lead_team_id = private.my_team())
  )
$$;
comment on function private.can_write_unit_parts(text) is '지표 단위 부분 쓰기: 성과관리팀·관리자, 주관 부서(eval_units.lead_team_id)';

-- 가드: 지표·연도·부분은 못 바꾸고, 확정(status)은 성과관리팀 이상만, 고친 사람은 트리거가 채움(로그인 사용자 요청만 — 서비스 키·마이그레이션은 막지 않음).
-- 문구는 서버 액션(lib/reports/unit-parts-edit.ts UNIT_PART_*_MSG)과 같음
create or replace function private.guard_unit_report_part()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'UPDATE' and (new.eval_unit_id, new.year, new.part) is distinct from (old.eval_unit_id, old.year, old.part) then
      raise exception '지표 단위 부분의 지표·연도·부분은 바꿀 수 없습니다';
    end if;
    if not private.is_staff()
       and ((tg_op = 'INSERT' and new.status <> 'draft') or (tg_op = 'UPDATE' and new.status is distinct from old.status)) then
      raise exception '지표 단위 부분 확정은 성과관리팀만 할 수 있습니다';
    end if;
    new.updated_by := (select auth.uid());
  end if;
  return new;
end;
$$;

create trigger eval_unit_report_parts_guard before insert or update on public.eval_unit_report_parts
  for each row execute function private.guard_unit_report_part();

grant execute on function private.can_read_unit_parts(text, integer) to authenticated, service_role;
grant execute on function private.can_write_unit_parts(text) to authenticated, service_role;

revoke all on public.eval_unit_report_parts from anon;
grant select, insert, update, delete on public.eval_unit_report_parts to authenticated;
grant all on public.eval_unit_report_parts to service_role;

alter table public.eval_unit_report_parts enable row level security;
create policy eval_unit_report_parts_read on public.eval_unit_report_parts for select to authenticated
  using (private.can_read_unit_parts(eval_unit_id, year));
create policy eval_unit_report_parts_insert on public.eval_unit_report_parts for insert to authenticated
  with check (private.can_write_unit_parts(eval_unit_id));
create policy eval_unit_report_parts_update on public.eval_unit_report_parts for update to authenticated
  using (private.can_write_unit_parts(eval_unit_id)) with check (private.can_write_unit_parts(eval_unit_id));
create policy eval_unit_report_parts_delete on public.eval_unit_report_parts for delete to authenticated
  using (private.is_staff());
