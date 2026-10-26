-- 공통 지식 선별 결과(지식공급 하이브리드 선별 — docs/plan/지식공급-하이브리드선별-결과.md §9·§10, 2026-10-26 사용자 결정: 주요사업 경평·질문, 새 표).
-- 카드마다 이 과제에 고른 사례류 조각(지적·실사·2025 보고서 절·사례)과 순위. 선별 방식 요청(lib/ai/context.ts dbSelection)은 이 행을 순위대로 원문으로 넣고
-- 나머지 사례류는 제목 목록으로 알림. 과제 대응표(card_knowledge_scope)의 auto·confirmed는 이 표와 상관없이 늘 넣고, rejected인 조각은 이 표에 있어도 뺌.
-- 채우는 일은 스크립트(서비스 키). 행이 없는 카드는 통째로 넣기.
-- 되돌리기(down): drop table public.card_knowledge_select;

create table public.card_knowledge_select (
  card_id text not null references public.cards (id) on delete cascade,
  chunk_key text not null references public.knowledge_chunks (chunk_key) on delete cascade,
  rank integer not null check (rank >= 1),
  score real,
  judge text not null,
  created_at timestamptz not null default now(),
  primary key (card_id, chunk_key)
);
comment on table public.card_knowledge_select is '공통 지식 선별 결과(과제×조각): 선별 방식 요청에 원문으로 넣을 사례류 조각. 대응표 rejected 조각은 요청 때 뺌. 행이 없으면 통째로 넣기';
comment on column public.card_knowledge_select.rank is '1부터, 작을수록 요청 앞';
comment on column public.card_knowledge_select.score is '판정 확률(Jev p 등) — 표시·검토용';
comment on column public.card_knowledge_select.judge is '고른 판정기와 기준(예: jev-1.14.0:strict:p>=0.2)';
create index card_knowledge_select_chunk_idx on public.card_knowledge_select (chunk_key);

-- RLS: 읽기는 과제 대응표와 같이 카드를 볼 수 있는 사람, 쓰기는 성과관리팀·관리자(스크립트는 서비스 키)
alter table public.card_knowledge_select enable row level security;
create policy card_knowledge_select_read on public.card_knowledge_select for select to authenticated
  using (private.can_read_card(card_id));
create policy card_knowledge_select_write on public.card_knowledge_select for all to authenticated
  using (private.is_staff()) with check (private.is_staff());

revoke all on public.card_knowledge_select from anon, authenticated;
grant select, insert, update, delete on public.card_knowledge_select to authenticated;
grant all on public.card_knowledge_select to service_role;
