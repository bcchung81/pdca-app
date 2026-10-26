-- 경평 초안 블록 고치기 이력(과제별 초안 미리보기에서 글을 끌어 고르고 「AI 수정 요청」 — 블록 하나를 AI가 다시 씀, 2026-09-27 사용자 결정 「블록 단위 · 이력은 DB에」).
-- 누가·언제·어느 블록을 어떤 요청으로 바꿨는지와 전후 블록 JSON을 남깁니다. 되돌리기도 한 행(kind undo, ref_id = 되돌린 고치기).
-- 이력은 고치지도 지우지도 않습니다(쓰기는 넣기만). 권한은 초안과 같습니다: 읽기 can_read_card, 넣기 can_write_card + 쓴 사람 = 로그인 사용자.
-- 초안을 다시 만들면(AI가 새로 씀) 고친 블록은 사라지지만 이력은 남아 참고할 수 있습니다.

create table public.report_draft_edits (
  id bigint generated always as identity primary key,
  card_id text not null references public.cards (id) on delete cascade,
  year integer not null check (year between 2020 and 2100),
  block_index integer not null check (block_index >= 0),
  kind text not null check (kind in ('edit', 'undo')),
  request text not null default '',
  quote text not null default '',
  reply text not null default '',
  before jsonb not null,
  after jsonb not null,
  model text,
  -- 이 고치기 전에도 이 블록이 사람이 고친 블록(spec.humanEdits)이었는지 — 되돌리면 표시를 그대로 둘지 뺄지
  was_human boolean not null default false,
  ref_id bigint references public.report_draft_edits (id) on delete set null,
  edited_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);
comment on table public.report_draft_edits is '경평 초안 블록 고치기 이력: 드래그 「AI 수정 요청」으로 바꾼 블록의 전후 JSON·요청·쓴 사람(되돌리기는 kind undo). 넣기만 함';
create index report_draft_edits_card_idx on public.report_draft_edits (card_id, year, created_at desc);

revoke all on public.report_draft_edits from anon;
grant select, insert on public.report_draft_edits to authenticated;
grant all on public.report_draft_edits to service_role;

alter table public.report_draft_edits enable row level security;
create policy report_draft_edits_read on public.report_draft_edits for select to authenticated using (private.can_read_card(card_id));
create policy report_draft_edits_insert on public.report_draft_edits for insert to authenticated
  with check (private.can_write_card(card_id) and edited_by = auth.uid());
