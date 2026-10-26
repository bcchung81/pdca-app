-- 경평 초안 부서 제출 단위(2026-09-27 사용자 결정 「직접 쓰기는 부서 흐름에서 뺌 · 초안 필수 + 나머지 경고 · 잠금은 DB 트리거 + 액션 + 화면
-- · 성과관리팀 검토 · 사업 맥락 읽기」).
-- 부서 보고서(사업 × 부서 × 연도)는 과제별 초안 묶음 + 계량 실적 + 추가자료를 내는 단위. 예전에는 제출·잠금이 원고 블록(reports.blocks)에만
-- 걸려, 부서가 제출·승인한 뒤에도 과제별 초안(card_report_drafts)을 계속 바꿀 수 있었음 → 초안에도 같은 잠금을 겁니다.

-- 1) 그 카드의 부서 보고서가 제출·승인 상태인가(부서 잠금 판정 — 값 하나만 돌려줌)
create or replace function private.report_locked(p_card_id text, p_year integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.cards c
    join public.reports r on r.eval_unit_id = c.eval_unit_id and r.team_id = c.team_id
    where c.id = p_card_id and r.year = p_year and r.status in ('submitted', 'approved')
  )
$$;

-- 2) 과제별 초안·구성안·블록 고치기 이력 잠금: 부서는 제출·승인 중에 넣기·고치기·지우기 불가(성과관리팀은 잠금 밖 — guard_report와 같음).
--    security invoker(트리거 안 current_user로 역할을 판정 — definer면 소유자가 되어 판정이 무력해짐)
create or replace function private.guard_card_report_draft()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_card text;
  v_year integer;
begin
  if current_user in ('authenticated', 'anon') and not private.is_staff() then
    if tg_op = 'DELETE' then
      v_card := old.card_id;
      v_year := old.year;
    else
      v_card := new.card_id;
      v_year := new.year;
    end if;
    if private.report_locked(v_card, v_year) then
      raise exception '제출한 보고서의 과제입니다 — 제출을 취소한 뒤 고칠 수 있습니다';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger card_report_drafts_guard before insert or update or delete on public.card_report_drafts
  for each row execute function private.guard_card_report_draft();
create trigger report_draft_edits_guard before insert on public.report_draft_edits
  for each row execute function private.guard_card_report_draft();

-- 3) 첫 과제별 초안(또는 구성안)이 생기면 부서 보고서를 자료 준비 → 초안 작성으로(예전에는 원고 블록을 저장할 때만).
--    쓰는 사람 권한으로(부서는 자기 보고서만 — RLS, 보고서 가드가 상태 전환을 봄)
create or replace function private.report_drafting_on_draft()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.reports r
  set status = 'drafting'
  from public.cards c
  where c.id = new.card_id
    and r.eval_unit_id = c.eval_unit_id
    and r.team_id = c.team_id
    and r.year = new.year
    and r.status = 'preparing';
  return null;
end;
$$;

create trigger card_report_drafts_drafting after insert or update on public.card_report_drafts
  for each row execute function private.report_drafting_on_draft();

-- 4) 성과관리팀 검토 메모(돌려보내기·승인 때) — 부서는 읽기만
alter table public.reports
  add column review_note text not null default '' check (length(review_note) <= 2000),
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references auth.users (id);
comment on column public.reports.review_note is '성과관리팀 검토 메모(돌려보내기 사유 등) — 부서 화면에 보임, 부서는 못 바꿈';

create or replace function private.guard_report()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and not private.is_staff() then
    if (new.eval_unit_id, new.year, new.team_id, new.approved_at, new.approved_by, new.created_by, new.review_note, new.reviewed_at, new.reviewed_by)
       is distinct from (old.eval_unit_id, old.year, old.team_id, old.approved_at, old.approved_by, old.created_by, old.review_note, old.reviewed_at, old.reviewed_by) then
      raise exception '보고서 식별 값·승인·검토 정보는 성과관리팀만 바꿀 수 있습니다';
    end if;
    if old.status = 'approved' or new.status = 'approved' then
      raise exception '승인은 성과관리팀만 합니다';
    end if;
    if old.status = 'submitted' and (new.inputs, new.blocks) is distinct from (old.inputs, old.blocks) then
      raise exception '제출한 보고서는 제출을 취소한 뒤 고칠 수 있습니다';
    end if;
  end if;
  return new;
end;
$$;

-- 5) 사업 맥락 읽기: 같은 사업 목차 줄(과제번호·과제명·부서·쪽·자리)만 — 그 사업에 카드가 있는 부서·주관 부서·성과관리팀.
--    카드 본문·초안·uid는 내주지 않음(다른 부서 카드는 여전히 RLS가 막음). 부서가 목차 안 자기 자리(앞뒤 과제·쪽)를 보게.
create or replace function public.report_outline_context(p_eval_unit text, p_year integer)
returns table (task_no text, title text, team_name text, section text, subsection text, sort integer, pages numeric, included boolean, mine boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.task_no, c.title, t.name, o.section, o.subsection, o.sort, o.pages, o.included, c.team_id = private.my_team()
  from public.report_outline o
  join public.cards c on c.id = o.card_id
  left join public.teams t on t.id = c.team_id
  where o.eval_unit_id = p_eval_unit
    and o.year = p_year
    and c.status = 'active'
    and (
      private.is_staff()
      or (
        private.my_team() is not null
        and (
          exists (select 1 from public.cards m where m.eval_unit_id = p_eval_unit and m.team_id = private.my_team() and m.status = 'active')
          or exists (select 1 from public.eval_units u where u.id = p_eval_unit and u.lead_team_id = private.my_team())
        )
      )
    )
  order by o.sort, c.task_no
$$;
revoke all on function public.report_outline_context(text, integer) from public, anon;
grant execute on function public.report_outline_context(text, integer) to authenticated;

-- 6) 주석 바로잡기: 주관 부서는 그 사업 보고서·카드·과제별 초안을 읽기만(공통 부분 쓰기는 다음 단계 — 아직 없음)
comment on table public.reports is '경평 초안 부서 보고서(사업 × 부서 × 연도) = 과제별 초안 묶음 + 계량 실적(inputs) + 추가자료를 내는 단위. 상태: 자료 준비 → 초안 작성 → 제출(검토) → 승인. 제출·승인 중에는 부서가 그 과제별 초안도 못 바꿈(guard_card_report_draft)';
comment on column public.reports.blocks is '원고 블록 JSON(「직접 쓰기」 — 부서 흐름에서는 뺌, 주관 부서 공통 부분 자리로 돌려쓸 예정). 블록 id가 코멘트 앵커';
comment on function private.can_read_report(bigint) is '보고서 읽기: 성과관리팀·관리자 전체, 작성 부서는 자기 보고서, 주관 부서는 그 사업의 보고서(읽기만)';
