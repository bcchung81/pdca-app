-- 참고자료 설계 3단계(docs/reference-materials.md §4.2·§4.6·§6, docs/plan/참고자료-3단계-구현계획.md):
-- 과제 대응표·보고서 추가자료↔과제 매칭·과제별 근거 목록표·백그라운드 작업 대기열.
-- 옛 knowledge_card_links(지적 단위)는 (과제, 조각) 단위인 card_knowledge_scope로 옮기고, 옛 표는 운영 확인 뒤 별도 마이그레이션에서 지움.

-- ── 과제 대응표: 이 과제에 해당하는 공통 지식 조각 ─────────────────────────────────────────
-- 거르는 장치가 아님(원칙 1) — 「이 과제 해당」 표시·닮은 순·숫자 근거 범위에만 씀
create table public.card_knowledge_scope (
  card_id text not null references public.cards (id) on delete cascade,
  chunk_key text not null references public.knowledge_chunks (chunk_key) on delete cascade,
  status text not null default 'auto' check (status in ('auto', 'candidate', 'confirmed', 'rejected')),
  method text not null check (method in ('rule', 'ai', 'human')),
  score real,
  rank integer,
  basis text,
  meta jsonb not null default '{}'::jsonb,
  confirmed_by uuid references auth.users (id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (card_id, chunk_key)
);
comment on table public.card_knowledge_scope is '과제 대응표(과제×조각). 자동 초안(auto·candidate)은 처리기·적재가, 확정·뺌(confirmed·rejected)은 성과관리팀이. 다시 매칭해도 확정·뺌은 덮지 않음';
comment on column public.card_knowledge_scope.method is '누가 제안했나: rule(적재 규칙) · ai(light 모델) · human(사람이 직접 추가). 결정은 status';
comment on column public.card_knowledge_scope.meta is '규칙 연결의 지적 단위 정보(finding_index·finding_no·card_finding·link_method)';
create index card_knowledge_scope_chunk_idx on public.card_knowledge_scope (chunk_key);
create trigger card_knowledge_scope_touch before update on public.card_knowledge_scope
  for each row execute function private.touch_updated_at();

-- 옛 지적 연결을 (과제, 조각) 단위로 합쳐 옮김. 사람이 정한 것이 먼저(confirmed > rejected > auto > candidate), 그다음 순위·점수
insert into public.card_knowledge_scope (card_id, chunk_key, status, method, score, rank, basis, meta, confirmed_by, confirmed_at)
select distinct on (card_id, chunk_key)
  card_id, chunk_key, status, 'rule', score, rank, basis,
  jsonb_build_object('finding_index', finding_index, 'finding_no', finding_no, 'card_finding', card_finding, 'link_method', method),
  confirmed_by, confirmed_at
from public.knowledge_card_links
order by card_id, chunk_key,
  case status when 'confirmed' then 0 when 'rejected' then 1 when 'auto' then 2 else 3 end,
  rank nulls last, score desc nulls last, finding_index, finding_no;

-- ── 보고서 추가자료 ↔ 과제 매칭 ───────────────────────────────────────────────────────────
-- 연결된 과제에서만 그 자료의 수치를 숫자 근거로 인정(사람이 확정한 것만). 하나도 안 이으면 「같은 보고서 자료」
create table public.report_material_cards (
  material_id uuid not null references public.report_materials (id) on delete cascade,
  card_id text not null references public.cards (id) on delete cascade,
  status text not null default 'auto' check (status in ('auto', 'confirmed')),
  method text not null check (method in ('ai', 'human')),
  basis text,
  confirmed_by uuid references auth.users (id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (material_id, card_id)
);
comment on table public.report_material_cards is '보고서 추가자료↔과제 연결. auto=AI 제안(확정 전), confirmed=사람이 고른 것(숫자 근거 인정)';
create index report_material_cards_card_idx on public.report_material_cards (card_id);

-- ── 과제별 근거 목록표(준비물) ─────────────────────────────────────────────────────────────
create table public.card_context_manifest (
  card_id text primary key references public.cards (id) on delete cascade,
  items jsonb not null default '{}'::jsonb,
  tokens jsonb not null default '{}'::jsonb,
  inputs_version text not null,
  status text not null default 'fresh' check (status in ('fresh', 'stale', 'building')),
  built_at timestamptz not null default now()
);
comment on table public.card_context_manifest is '과제별 근거 목록표. inputs_version(판 요약 해시)이 지금과 다르면 낡은 것 — 요청 때 그 자리에서 다시 만들어 씀';

-- ── 백그라운드 작업 대기열 ─────────────────────────────────────────────────────────────────
create table public.prep_jobs (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('match_knowledge', 'match_report_material', 'build_manifest')),
  target text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  attempts integer not null default 0,
  progress jsonb not null default '{}'::jsonb,
  error text,
  requested_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
comment on table public.prep_jobs is '매칭·준비물 작업 대기열. 등록은 로그인 사용자 권한(RLS), 처리는 서버 처리기(비밀 키). target: match_knowledge·build_manifest=cards.id, match_report_material=report_materials.id';
create index prep_jobs_status_idx on public.prep_jobs (status, created_at);
-- 같은 대상의 대기 작업은 하나(자동 저장이 작업을 폭주시키지 않게). 실행 중인 것과는 함께 있을 수 있음
create unique index prep_jobs_queued_uidx on public.prep_jobs (kind, target) where status = 'queued';

alter table public.ai_requests
  alter column user_id drop not null,
  add column job_id bigint references public.prep_jobs (id) on delete set null;
comment on column public.ai_requests.job_id is '처리기(prep_jobs)가 부른 호출이면 그 작업. 시드·스크립트가 건 작업은 user_id가 없음';

-- ── 권한 판정 ──────────────────────────────────────────────────────────────────────────────
-- 보고서 추가자료를 그 보고서의 (사업, 부서) 활성 카드에 이을 수 있나
create or replace function private.can_match_material(p_material uuid, p_card text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.report_materials m
    join public.reports r on r.id = m.report_id
    join public.cards c on c.id = p_card
    where m.id = p_material
      and private.can_edit_report_content(m.report_id)
      and c.eval_unit_id = r.eval_unit_id
      and c.team_id = r.team_id
      and c.status = 'active'
  )
$$;

-- 이 작업을 등록할 수 있나: 카드 작업은 그 카드를 쓸 수 있는 사람, 자료 매칭은 그 보고서 내용을 고칠 수 있는 사람
create or replace function private.can_enqueue_prep(p_kind text, p_target text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_kind in ('match_knowledge', 'build_manifest') then private.can_write_card(p_target)
    when p_kind = 'match_report_material' then
      p_target ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and exists (
        select 1 from public.report_materials m
        where m.id = p_target::uuid and private.can_edit_report_content(m.report_id)
      )
    else false
  end
$$;
grant execute on function private.can_match_material(uuid, text) to authenticated, service_role;
grant execute on function private.can_enqueue_prep(text, text) to authenticated, service_role;

-- ── RLS·권한 ───────────────────────────────────────────────────────────────────────────────
alter table public.card_knowledge_scope enable row level security;
alter table public.report_material_cards enable row level security;
alter table public.card_context_manifest enable row level security;
alter table public.prep_jobs enable row level security;

-- 대응표: 카드를 볼 수 있는 사람은 읽고, 확정·뺌은 성과관리팀·관리자
create policy card_knowledge_scope_read on public.card_knowledge_scope for select to authenticated
  using (private.can_read_card(card_id));
create policy card_knowledge_scope_write on public.card_knowledge_scope for all to authenticated
  using (private.is_staff()) with check (private.is_staff());

-- 보고서 추가자료 연결: 그 보고서를 읽을 수 있는 사람은 읽고, 고칠 수 있는 사람이 그 보고서 과제에만 잇기
create policy report_material_cards_read on public.report_material_cards for select to authenticated
  using (exists (select 1 from public.report_materials m where m.id = material_id and private.can_read_report(m.report_id)));
create policy report_material_cards_insert on public.report_material_cards for insert to authenticated
  with check (private.can_match_material(material_id, card_id));
create policy report_material_cards_update on public.report_material_cards for update to authenticated
  using (private.can_match_material(material_id, card_id)) with check (private.can_match_material(material_id, card_id));
create policy report_material_cards_delete on public.report_material_cards for delete to authenticated
  using (private.can_match_material(material_id, card_id));

-- 근거 목록표: 카드를 볼 수 있는 사람은 읽기만(쓰기는 처리기만 — 목록에 카드 전용 자료 id가 있어 카드 권한을 따름)
create policy card_context_manifest_read on public.card_context_manifest for select to authenticated
  using (private.can_read_card(card_id));

-- 작업 대기열: 본인이 건 것·성과관리팀이 읽고, 등록은 자기 이름 + 그 대상 권한이 있을 때만
create policy prep_jobs_read on public.prep_jobs for select to authenticated
  using (private.is_staff() or requested_by = (select auth.uid()));
create policy prep_jobs_insert on public.prep_jobs for insert to authenticated
  with check (requested_by = (select auth.uid()) and private.can_enqueue_prep(kind, target));

revoke all on public.card_knowledge_scope, public.report_material_cards, public.card_context_manifest, public.prep_jobs from anon, authenticated;
grant select, insert, update, delete on public.card_knowledge_scope, public.report_material_cards to authenticated;
grant select on public.card_context_manifest, public.prep_jobs to authenticated;
grant insert (kind, target, payload, requested_by) on public.prep_jobs to authenticated;
grant all on public.card_knowledge_scope, public.report_material_cards, public.card_context_manifest, public.prep_jobs to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
