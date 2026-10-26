-- 코드 리뷰 반영
-- 1) 작성본 병합 확정: 작성본을 시작할 때의 원장(base)을 남겨, 확정 때 부서가 바꾼 구역만 원장에 반영(3-way)
-- 2) 고정 영역이 잠긴 카드: 부서 작성본의 Act·Plan·계량지표는 거절하지 않고 원장 값으로 맞춤(잠금 뒤 작성본이 막히지 않게)
-- 3) 리뷰 코멘트: 부서는 상태(해결·다시 열기)만 바꾸고, 해결한 사람은 로그인 사용자로 기록
-- 4) 제출·승인된 보고서: 부서는 내용(계량 실적·블록)과 추가자료를 바꾸지 못함

alter table public.card_versions add column base jsonb;
comment on column public.card_versions.base is '작성본을 시작할 때의 원장 카드 JSON. 확정 때 이것과 비교해 부서가 바꾼 구역만 원장에 반영';

create or replace function private.guard_card_version()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ledger jsonb;
  locked timestamptz;
begin
  if current_user in ('authenticated', 'anon') and not private.is_staff() then
    if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status is distinct from 'confirmed') then
      raise exception '작성본 확정은 성과관리팀만 할 수 있습니다';
    end if;
    if tg_op = 'UPDATE' and old.status = 'submitted' and new.data is distinct from old.data then
      raise exception '제출한 작성본은 제출을 취소한 뒤 고칠 수 있습니다';
    end if;
    if tg_op = 'UPDATE' and (new.confirmed_by, new.confirmed_at) is distinct from (old.confirmed_by, old.confirmed_at) then
      raise exception '확정 정보는 성과관리팀만 바꿀 수 있습니다';
    end if;
    -- 고정 영역이 확정된 카드: 작성본의 Act·Plan·계량지표는 늘 원장 값
    select c.data, c.fixed_locked_at into ledger, locked from public.cards c where c.id = new.card_id;
    if locked is not null then
      new.data := new.data || jsonb_build_object('act', ledger -> 'act', 'plan', ledger -> 'plan', 'kpi', ledger -> 'kpi');
    end if;
  end if;
  return new;
end;
$$;

-- 코멘트: 본문·작성자·앵커는 쓴 뒤 바꾸지 않음. 상태만 바꾸고, 해결한 사람·시각은 서버가 채움
revoke update on public.report_comments from authenticated;
grant update (status, resolved_by, resolved_at) on public.report_comments to authenticated;

-- security invoker: current_user가 호출 역할(authenticated)이어야 판정됨
create or replace function private.guard_report_comment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.status = 'resolved' and old.status is distinct from 'resolved' then
      new.resolved_by := auth.uid();
      new.resolved_at := now();
    elsif new.status = 'open' then
      new.resolved_by := null;
      new.resolved_at := null;
    else
      new.resolved_by := old.resolved_by;
      new.resolved_at := old.resolved_at;
    end if;
  end if;
  return new;
end;
$$;

create trigger report_comments_guard before update on public.report_comments
  for each row execute function private.guard_report_comment();

-- 보고서 내용: 자료 준비·초안 작성 단계에서만 부서가 고침(제출·승인 뒤엔 성과관리팀만)
create or replace function private.can_edit_report_content(p_report_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff() or exists (
    select 1 from public.reports r
    where r.id = p_report_id and private.my_team() is not null and r.team_id = private.my_team()
      and r.status in ('preparing', 'drafting')
  )
$$;
grant execute on function private.can_edit_report_content(bigint) to authenticated;

create or replace function private.guard_report()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and not private.is_staff() then
    if (new.eval_unit_id, new.year, new.team_id, new.approved_at, new.approved_by, new.created_by)
       is distinct from (old.eval_unit_id, old.year, old.team_id, old.approved_at, old.approved_by, old.created_by) then
      raise exception '보고서 식별 값·승인 정보는 성과관리팀만 바꿀 수 있습니다';
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

drop policy report_materials_insert on public.report_materials;
drop policy report_materials_delete on public.report_materials;
create policy report_materials_insert on public.report_materials for insert to authenticated
  with check (private.can_edit_report_content(report_id) and uploaded_by = (select auth.uid()));
create policy report_materials_delete on public.report_materials for delete to authenticated using (private.can_edit_report_content(report_id));

drop policy report_materials_objects_insert on storage.objects;
drop policy report_materials_objects_delete on storage.objects;
create policy report_materials_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'report-materials' and private.can_edit_report_content(private.report_id_from_path(name)));
create policy report_materials_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'report-materials' and private.can_edit_report_content(private.report_id_from_path(name)));
