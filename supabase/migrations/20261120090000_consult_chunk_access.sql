-- 외부 컨설팅 의견 조각(knowledge_chunks.unit_type = 'consult_comment' — 문서 consult26-mg)을 카드 단위로만 읽게 함(2026-11-20 사용자 결정).
-- 문제: 공통 지식 읽기 정책(knowledge_chunks_read — 20261110100000)은 구성원(private.is_member())이면 조각 전부를 읽게 해서,
--   부서 담당자가 공통 지식 화면·검색(search_knowledge — security invoker라 이 정책을 따름)·직접 조회(PostgREST)로 다른 카드에 대한 컨설팅 의견까지 읽음.
-- 고침: consult_comment 조각은 성과관리팀·관리자 또는 그 조각이 가리키는 카드(meta.card_ids — lib/knowledge/parsers/consult-mg.ts, 대개 1개·나뉜 과제는 여럿)를
--   읽을 수 있는 사람(private.can_read_card — 부서 담당자는 지정된 활성 과제)만. 나머지 유형은 예전 그대로 구성원 전부.
--   관리자 읽기 정책(knowledge_chunks_admin_read — 20261117140000)은 그대로(관리자는 어차피 전부).
-- 영향(코드): 앱은 컨설팅 조각을 공유 조각 캐시에 넣지 않고(lib/ai/context.ts loadBundleChunks가 이 유형을 빼고 읽음) 카드 요청마다 그 카드 것만 사용자 권한으로 따로 읽음(loadCardConsult).
--   공통 지식 화면은 부서 담당자에게 이 유형을 아예 안 보임(app/(app)/knowledge/page.tsx — 자기 카드 의견도 그 카드 화면에서만).
--   서비스 키 스크립트(knowledge:*·db:seed·prep 처리기)는 RLS 밖이라 영향 없음.
-- 문서 행(knowledge_documents)·원본 파일 버킷 정책은 바꾸지 않음 — 문서 행은 제목·건수뿐이고, 원본 xlsx(담당자 실명 열 있음)는 버킷에 올리지 않음(docs/design/knowledge.md).
-- 운영 반영 순서: 새 코드 배포(새 코드는 이 정책이 없어도 같은 결과 — 카드 id로 거르고 화면에서 뺌) → pnpm db:push(이 파일) → 컨설팅 조각 적재(pnpm db:seed --knowledge-only --doc consult26-mg).
--   적재를 정책보다 먼저 하면 그 사이 부서 담당자가 직접 조회로 다른 카드 의견을 읽을 수 있으므로 적재는 맨 끝.
-- 확인: select policyname, qual from pg_policies where policyname = 'knowledge_chunks_read';
-- 되돌리기(down):
--   drop policy knowledge_chunks_read on public.knowledge_chunks;
--   create policy knowledge_chunks_read on public.knowledge_chunks for select to authenticated using (private.is_member());
--   drop function private.can_read_consult(jsonb);

create or replace function private.can_read_consult(p_card_ids jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff() or exists (
    select 1
    from jsonb_array_elements_text(case when jsonb_typeof(p_card_ids) = 'array' then p_card_ids else '[]'::jsonb end) as t(card_id)
    where private.can_read_card(t.card_id)
  )
$$;
comment on function private.can_read_consult(jsonb) is '외부 컨설팅 의견 조각 읽기: 성과관리팀·관리자, 또는 조각이 가리키는 카드(meta.card_ids) 중 하나를 읽을 수 있는 사람(부서 담당자는 지정된 활성 과제)';
grant execute on function private.can_read_consult(jsonb) to authenticated, service_role;

drop policy knowledge_chunks_read on public.knowledge_chunks;
create policy knowledge_chunks_read on public.knowledge_chunks for select to authenticated
  using (private.is_member() and (unit_type <> 'consult_comment' or private.can_read_consult(meta -> 'card_ids')));
