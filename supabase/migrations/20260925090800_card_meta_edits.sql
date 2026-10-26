-- Notion 주요사업 DB 속성 중 카드 원본에 없는 운영 값(PDCA 단계·진도율·상태)과 카드 수정 이력.

alter table public.cards
  add column stage text check (stage in ('Plan', 'Do', 'Check', 'Act')),
  add column progress smallint check (progress between 0 and 100),
  add column work_status text not null default '진행중' check (work_status in ('진행중', '완료', '보류'));
comment on column public.cards.stage is 'PDCA 단계(Notion 속성)';
comment on column public.cards.progress is '진도율 %(Notion 속성)';
comment on column public.cards.work_status is '상태: 진행중·완료·보류(Notion 속성)';

-- 원장 수정 이력(감사 추적). 성과관리팀·관리자가 원본 양식에서 고칠 때마다 한 행.
create table public.card_edits (
  id bigint generated always as identity primary key,
  card_id text not null references public.cards (id) on delete cascade,
  edited_by uuid references auth.users (id),
  edited_at timestamptz not null default now(),
  summary text,
  before jsonb not null,
  after jsonb not null
);
comment on table public.card_edits is '과제관리카드 원장 수정 이력(수정 전·후 JSON)';
create index card_edits_card_idx on public.card_edits (card_id, edited_at desc);

revoke all on public.card_edits from anon;
grant select, insert on public.card_edits to authenticated;
grant all on public.card_edits to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

alter table public.card_edits enable row level security;
create policy card_edits_read on public.card_edits for select to authenticated using (private.can_read_card(card_id));
create policy card_edits_insert on public.card_edits for insert to authenticated
  with check (private.is_staff() and edited_by = (select auth.uid()));
