-- 기관 공통 자료 읽기 범위 좁히기(2026-11-10 보안 점검 T4 H1 — 심층 방어, 사용자 결정 2026-11-10: 가입 끄기 + 이 마이그레이션).
-- 문제: Supabase 가입이 열려 있으면(disable_signup=false) 외부 메일도 공개 키로 Auth API를 직접 불러 계정을 만들 수 있고, 가입 트리거(handle_new_user)가
--   활성 부서 담당자(팀 없음) 프로필을 만듦 → 공통 지식 조각·문서 목록·knowledge 버킷 원본 파일·평가단위·팀 정책이 using (true)라 그대로 읽힘.
--   사용 중지한 계정도 남은 접근 토큰(최대 1시간) 동안 같은 표를 읽음(이 정책들은 my_role()을 안 봄).
-- 고침: 공통 지식(조각·문서·원본 파일)은 성과관리팀·관리자 또는 팀이 지정된 활성 사용자만(private.is_member()),
--   평가단위·팀 이름은 민감하지 않아 활성 사용자면 됨(팀 미지정 첫 화면 틀은 그대로).
-- 영향: 팀이 아직 없는 활성 부서 담당자는 팀이 지정될 때까지 공통 지식을 못 봄(2026-11-10 운영 실측 1명 — 적용 전에 팀 지정 권장).
--   기관 메일이 아닌 계정 2개는 모두 관리자라 그대로. 서비스 키 스크립트(knowledge:*·db:seed·prep 처리기)는 RLS 밖이라 영향 없음.
--   search_knowledge(security invoker)는 조각 정책을 그대로 따름. 코드는 is_member를 부르지 않음(정책만 바뀜).
-- 운영 반영 순서(docs/ops/운영-전환.md §10):
--   1) Supabase 대시보드에서 「Allow new users to sign up」 끄기(사용자 — 옛 코드와 함께 써도 됨, 지금 바로) — 관리자 API 계정 만들기는 그대로 됨.
--   2) 팀 없는 활성 부서 담당자에게 팀 지정(「사용자」 화면).
--   3) pnpm db:push 한 번 — 이 파일과 20261110120000_ai_requests_job_inspect.sql을 함께(하나만 미루면 supabase db push가 원격 최신보다 이른 번호를 거절 — --include-all 필요).
--      이 파일은 코드와 무관(새 코드가 이 정책에 기대지 않음). 20261110120000은 새 코드보다 먼저 있어야 함.
--   4) 새 코드 배포.
--   5) 확인: 팀 있는 부서 담당자 계정으로 「공통 지식」이 보이는지, 아래 select로 정책 다섯 개가 바뀌었는지.
--      select policyname, qual from pg_policies where policyname in ('knowledge_chunks_read','knowledge_documents_read','knowledge_objects_read','eval_units_read','teams_read');
-- 되돌리기(down):
--   drop policy knowledge_chunks_read on public.knowledge_chunks;
--   create policy knowledge_chunks_read on public.knowledge_chunks for select to authenticated using (true);
--   drop policy knowledge_documents_read on public.knowledge_documents;
--   create policy knowledge_documents_read on public.knowledge_documents for select to authenticated using (true);
--   drop policy knowledge_objects_read on storage.objects;
--   create policy knowledge_objects_read on storage.objects for select to authenticated using (bucket_id = 'knowledge');
--   drop policy eval_units_read on public.eval_units;
--   create policy eval_units_read on public.eval_units for select to authenticated using (true);
--   drop policy teams_read on public.teams;
--   create policy teams_read on public.teams for select to authenticated using (true);
--   drop function private.is_member();

create or replace function private.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.is_staff() or private.my_team() is not null, false)
$$;
comment on function private.is_member() is '기관 공통 자료를 읽을 수 있는 사람: 성과관리팀·관리자 또는 팀이 지정된 활성 사용자(외부 가입·팀 미지정·사용 중지 계정 제외)';
grant execute on function private.is_member() to authenticated, service_role;

drop policy knowledge_chunks_read on public.knowledge_chunks;
create policy knowledge_chunks_read on public.knowledge_chunks for select to authenticated using (private.is_member());

drop policy knowledge_documents_read on public.knowledge_documents;
create policy knowledge_documents_read on public.knowledge_documents for select to authenticated using (private.is_member());

drop policy knowledge_objects_read on storage.objects;
create policy knowledge_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'knowledge' and private.is_member());

drop policy eval_units_read on public.eval_units;
create policy eval_units_read on public.eval_units for select to authenticated using (private.my_role() is not null);

drop policy teams_read on public.teams;
create policy teams_read on public.teams for select to authenticated using (private.my_role() is not null);
