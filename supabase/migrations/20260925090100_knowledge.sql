-- 공통 지식: 문서·조각·카드 연결·과제 대응표
-- 조각은 lib/knowledge 적재 결과(resources/knowledge/_chunks/*.jsonl)와 열 이름이 같습니다.

create table public.knowledge_documents (
  doc_id text primary key,
  title text not null,
  file_name text not null,
  storage_path text,
  edition text,
  published date,
  issuer text,
  basis_year integer,
  tracks text[] not null default '{}',
  scope text,
  status text not null default 'ingest' check (status in ('ingest', 'deferred', 'retired')),
  supersedes text references public.knowledge_documents (doc_id),
  sha256 text,
  parser_version text,
  chunk_count integer not null default 0,
  unit_counts jsonb not null default '{}'::jsonb,
  checks jsonb not null default '[]'::jsonb,
  uploaded_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.knowledge_documents is '공통 지식 문서. 성과관리팀·관리자가 올리고 바꿈';
create trigger knowledge_documents_touch before update on public.knowledge_documents
  for each row execute function private.touch_updated_at();

create table public.knowledge_chunks (
  chunk_key text primary key,
  doc_id text not null references public.knowledge_documents (doc_id) on delete cascade,
  seq integer not null,
  unit_type text not null,
  track text not null check (track in ('주요사업', '경영관리', '가점')),
  business text references public.eval_units (id),
  eval_item text,
  measure text,
  q_type text[] not null default '{}',
  title text not null,
  context_prefix text not null,
  blocks jsonb not null,
  text text not null,
  search_text text not null,
  searchable boolean not null default true,
  pdf_page_start integer,
  pdf_page_end integer,
  printed_page integer,
  report_page_2025 integer,
  dept_resp text[] not null default '{}',
  dept_coop text[] not null default '{}',
  meta jsonb not null default '{}'::jsonb,
  unique (doc_id, seq)
);
comment on column public.knowledge_chunks.blocks is '인용 단위. search_result content의 text 블록 하나씩';
comment on column public.knowledge_chunks.search_text is '색인용(정규화·표 선형화). 질의도 같은 정규화(foldForSearch)를 거침';
create index knowledge_chunks_filter_idx on public.knowledge_chunks (track, business, eval_item);
create index knowledge_chunks_qtype_idx on public.knowledge_chunks using gin (q_type);

create table public.knowledge_card_links (
  card_id text not null references public.cards (id) on delete cascade,
  finding_index integer not null default 0,
  chunk_key text not null references public.knowledge_chunks (chunk_key) on delete cascade,
  finding_no integer not null default 0,
  card_finding text,
  method text not null,
  score real,
  basis text,
  rank integer,
  status text not null default 'candidate' check (status in ('auto', 'candidate', 'confirmed', 'rejected')),
  confirmed_by uuid references auth.users (id),
  confirmed_at timestamptz,
  primary key (card_id, finding_index, chunk_key, finding_no)
);
comment on table public.knowledge_card_links is '카드 지적사항 ↔ 지적 원문 연결. 적재가 auto·candidate를 넣고 성과관리팀이 확정';
create index knowledge_card_links_chunk_idx on public.knowledge_card_links (chunk_key);

create table public.task_map (
  card_id text primary key references public.cards (id) on delete cascade,
  plan_task_key text references public.knowledge_chunks (chunk_key) on delete set null,
  report2025_task text,
  draft_status text,
  score real,
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  note text,
  confirmed_by uuid references auth.users (id),
  confirmed_at timestamptz
);
comment on table public.task_map is '9월 카드 ↔ 7월 과제 목록 ↔ 2025 실행과제 대응. 성과관리팀이 부서와 협의해 확정';
