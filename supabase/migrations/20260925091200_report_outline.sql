-- 12월 보고서 목차·쪽 배정(6월 셋업, 카드↔목차 연결): 평가내용2는 주요사업마다 15±1쪽, 과제(소항목)마다 0.5쪽 단위.
-- 목차 1단 = 대상사업, 2단 = 실행과제, 3단 = 과제(카드). 성과관리팀이 배정하고 부서는 자기 과제 배정을 봅니다.

create table public.report_outline (
  card_id text not null references public.cards (id) on delete cascade,
  year integer not null check (year between 2020 and 2100),
  eval_unit_id text not null references public.eval_units (id),
  section text not null,
  subsection text,
  sort integer not null default 0,
  pages numeric(3, 1) not null default 1 check (pages >= 0 and pages <= 10 and pages * 2 = floor(pages * 2)),
  included boolean not null default true,
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  primary key (card_id, year)
);
comment on table public.report_outline is '보고서 목차 위치(대상사업·실행과제)와 쪽 배정(0.5쪽 단위). 평가내용2 예산은 주요사업마다 15±1쪽';
create index report_outline_unit_idx on public.report_outline (year, eval_unit_id, sort);
create trigger report_outline_touch before update on public.report_outline
  for each row execute function private.touch_updated_at();

revoke all on public.report_outline from anon;
grant select, insert, update, delete on public.report_outline to authenticated;
grant all on public.report_outline to service_role;

alter table public.report_outline enable row level security;
create policy report_outline_read on public.report_outline for select to authenticated using (private.can_read_card(card_id));
create policy report_outline_write on public.report_outline for all to authenticated using (private.is_staff()) with check (private.is_staff());
