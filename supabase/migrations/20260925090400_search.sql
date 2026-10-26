-- 한국어 전문 검색(PGroonga). 호스티드 Supabase에서만 확인 가능(PGlite 테스트는 이 파일을 건너뜀).
-- 색인은 search_text(적재 때 foldForSearch로 정규화한 글자)에, 질의도 앱에서 같은 정규화를 거쳐 넘깁니다.

create extension if not exists pgroonga with schema extensions;

create index knowledge_chunks_search_idx on public.knowledge_chunks
  using pgroonga (search_text);

-- 기능별 범위 필터 안에서 키워드 순위를 매깁니다. RLS는 호출자 권한으로 적용(security invoker).
create or replace function public.search_knowledge(
  query text,
  tracks text[] default null,
  businesses text[] default null,
  eval_items text[] default null,
  unit_types text[] default null,
  doc_ids text[] default null,
  max_rows integer default 20
)
returns table (chunk_key text, doc_id text, unit_type text, title text, score double precision)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select c.chunk_key, c.doc_id, c.unit_type, c.title, extensions.pgroonga_score(c.tableoid, c.ctid) as score
  from public.knowledge_chunks c
  where c.searchable
    and c.search_text &@~ query
    and (tracks is null or c.track = any (tracks))
    and (businesses is null or c.business = any (businesses))
    and (eval_items is null or c.eval_item = any (eval_items))
    and (unit_types is null or c.unit_type = any (unit_types))
    and (doc_ids is null or c.doc_id = any (doc_ids))
  order by score desc, c.chunk_key
  limit least(greatest(max_rows, 1), 100)
$$;

grant execute on function public.search_knowledge(text, text[], text[], text[], text[], text[], integer) to authenticated;
