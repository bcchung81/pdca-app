-- 자동 저장: 같은 사람이 30분 안에 이어서 고치면 수정 이력 한 행을 갱신(이력 폭증 방지) → 본인 행 update 허용
grant update on public.card_edits to authenticated;
create policy card_edits_update on public.card_edits for update to authenticated
  using (private.is_staff() and edited_by = (select auth.uid()))
  with check (private.is_staff() and edited_by = (select auth.uid()));

-- AI 작성지원 사용 기록(비용·남용 점검). 본인 기록 쓰기, 읽기는 본인과 성과관리팀·관리자
create table public.ai_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  card_id text references public.cards (id) on delete set null,
  feature text not null,
  mode text,
  model text,
  status text not null check (status in ('ok', 'error')),
  input_tokens integer,
  output_tokens integer,
  cache_read_tokens integer,
  error text,
  created_at timestamptz not null default now()
);
comment on table public.ai_requests is 'AI 호출 기록(토큰·오류). 프롬프트·응답 본문은 저장하지 않음';
create index ai_requests_user_idx on public.ai_requests (user_id, created_at desc);

revoke all on public.ai_requests from anon;
grant select, insert on public.ai_requests to authenticated;
grant all on public.ai_requests to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
alter table public.ai_requests enable row level security;
create policy ai_requests_insert on public.ai_requests for insert to authenticated
  with check (user_id = (select auth.uid()) and (card_id is null or private.can_read_card(card_id)));
create policy ai_requests_read on public.ai_requests for select to authenticated
  using (user_id = (select auth.uid()) or private.is_staff());
