-- 월별 작성본 제출 흐름 보강 + 12월 경영실적보고서(부서×지표 보고서·추가자료·리뷰 코멘트)

-- 1) 월별 작성본: 저장·제출 시각
alter table public.card_versions
  add column updated_at timestamptz,
  add column submitted_at timestamptz,
  add column submitted_by uuid references auth.users (id);
comment on column public.card_versions.note is '성과관리팀이 돌려보낼 때 남기는 메모(다시 제출하면 지움)';
create trigger card_versions_touch before update on public.card_versions
  for each row execute function private.touch_updated_at();
create index card_versions_period_idx on public.card_versions (period, card_id);

-- 부서 담당자는 확정을 못 하고, 제출한 작성본의 내용·확정 정보를 바꾸지 못합니다(제출 취소 → 고치기).
create or replace function private.guard_card_version()
returns trigger
language plpgsql
set search_path = ''
as $$
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
  end if;
  return new;
end;
$$;

-- 2) 12월 보고서: 평가 단위(주요사업n) × 작성 부서. 주관 부서(eval_units.lead_team_id)는 사업 공통 부분도 씁니다.
create table public.reports (
  id bigint generated always as identity primary key,
  eval_unit_id text not null references public.eval_units (id),
  year integer not null check (year between 2020 and 2100),
  team_id bigint not null references public.teams (id),
  status text not null default 'preparing' check (status in ('preparing', 'drafting', 'submitted', 'approved')),
  inputs jsonb not null default '{}'::jsonb,
  blocks jsonb not null default '[]'::jsonb,
  submitted_at timestamptz,
  submitted_by uuid references auth.users (id),
  approved_at timestamptz,
  approved_by uuid references auth.users (id),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (eval_unit_id, year, team_id)
);
comment on table public.reports is '12월 경영실적보고서(부서×지표). 상태: 자료 준비 → 초안 작성 → 제출(리뷰) → 승인';
comment on column public.reports.inputs is '부서가 넣는 값(계량 실적 잠정치 등). AI는 수치를 만들지 않음';
comment on column public.reports.blocks is '보고서 블록 JSON(초안 생성·리뷰 반영 결과). 블록 id가 코멘트 앵커';
create index reports_team_idx on public.reports (team_id);
create trigger reports_touch before update on public.reports
  for each row execute function private.touch_updated_at();

create table public.report_materials (
  id uuid primary key default gen_random_uuid(),
  report_id bigint not null references public.reports (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  bytes bigint,
  uploaded_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
comment on table public.report_materials is '보고서 추가자료(사진·수상·언론 등). 그 보고서에서만 씀. 경로 report-materials/{reports.id}/{id}';
create index report_materials_report_idx on public.report_materials (report_id);

create table public.report_comments (
  id bigint generated always as identity primary key,
  report_id bigint not null references public.reports (id) on delete cascade,
  anchor text not null default 'all',
  kind text not null default '수정' check (kind in ('수정', '삭제', '질문', '좋음')),
  body text not null check (length(body) between 1 and 4000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  author_id uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  resolved_by uuid references auth.users (id),
  resolved_at timestamptz
);
comment on table public.report_comments is '보고서 리뷰 코멘트(블록 id 앵커, 4유형)';
create index report_comments_report_idx on public.report_comments (report_id, created_at);

-- 보고서 권한: 성과관리팀·관리자 전체, 작성 부서는 자기 보고서, 주관 부서는 그 사업의 보고서를 읽음
create or replace function private.can_read_report(p_report_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff() or exists (
    select 1
    from public.reports r
    join public.eval_units u on u.id = r.eval_unit_id
    where r.id = p_report_id
      and private.my_team() is not null
      and (r.team_id = private.my_team() or u.lead_team_id = private.my_team())
  )
$$;

create or replace function private.can_write_report(p_report_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff() or exists (
    select 1 from public.reports r
    where r.id = p_report_id and private.my_team() is not null and r.team_id = private.my_team()
  )
$$;

create or replace function private.report_id_from_path(p_name text)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9]{1,18}$' then split_part(p_name, '/', 1)::bigint end
$$;

-- 부서는 보고서의 식별 값·승인을 못 바꾸고, 승인된 보고서는 고치지 못합니다.
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
  end if;
  return new;
end;
$$;

create trigger reports_guard before update on public.reports
  for each row execute function private.guard_report();

grant execute on all functions in schema private to authenticated;

revoke all on public.reports, public.report_materials, public.report_comments from anon;
grant select, insert, update, delete on public.reports, public.report_materials, public.report_comments to authenticated;
grant all on public.reports, public.report_materials, public.report_comments to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

alter table public.reports enable row level security;
alter table public.report_materials enable row level security;
alter table public.report_comments enable row level security;

create policy reports_read on public.reports for select to authenticated using (private.can_read_report(id));
create policy reports_insert on public.reports for insert to authenticated with check (private.is_staff());
create policy reports_update on public.reports for update to authenticated
  using (private.can_write_report(id)) with check (private.can_write_report(id));
create policy reports_delete on public.reports for delete to authenticated using (private.is_staff());

create policy report_materials_read on public.report_materials for select to authenticated using (private.can_read_report(report_id));
create policy report_materials_insert on public.report_materials for insert to authenticated
  with check (private.can_write_report(report_id) and uploaded_by = (select auth.uid()));
create policy report_materials_delete on public.report_materials for delete to authenticated using (private.can_write_report(report_id));

create policy report_comments_read on public.report_comments for select to authenticated using (private.can_read_report(report_id));
create policy report_comments_insert on public.report_comments for insert to authenticated
  with check (private.can_read_report(report_id) and author_id = (select auth.uid()));
create policy report_comments_update on public.report_comments for update to authenticated
  using (private.can_write_report(report_id) or author_id = (select auth.uid()))
  with check (private.can_read_report(report_id));
create policy report_comments_delete on public.report_comments for delete to authenticated
  using (author_id = (select auth.uid()) or private.is_staff());

-- 추가자료 파일(비공개): report-materials/{reports.id}/{report_materials.id}
insert into storage.buckets (id, name, public, file_size_limit)
values ('report-materials', 'report-materials', false, 52428800)
on conflict (id) do nothing;

create policy report_materials_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'report-materials' and private.can_read_report(private.report_id_from_path(name)));
create policy report_materials_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'report-materials' and private.can_write_report(private.report_id_from_path(name)));
create policy report_materials_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'report-materials' and private.can_write_report(private.report_id_from_path(name)));
