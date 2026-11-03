-- 권한별 입력부 점검 후속(2026-11-03 — docs/plan/권한별-입력부-점검-핸드오프-2026-11-03.md §5의 1·2·3).
-- ① 공통 지식 쓰기는 관리자만(§5-2): 화면(/admin/library)·서버 액션은 관리자만인데 DB 정책은 성과관리팀까지 열려 있어,
--    성과관리팀이 자기 로그인 토큰으로 API를 직접 부르면 일반 문서·붙임2 조각과 버킷 그림을 넣거나 지울 수 있었음.
--    knowledge_documents_write·knowledge_chunks_write(public)와 knowledge_objects_write(storage.objects)를 is_admin으로 좁힘.
--    읽기 정책·knowledge_card_links_write·task_map_write는 그대로. 스크립트(pnpm knowledge:*·db:seed)는 서비스 키(RLS 밖)라 영향 없음.
-- ② 보낸·확인한 점검표 삭제 막기(§5-3): inspections_staff가 for all이라 성과관리팀이 보낸(sent)·확인한(acknowledged) 점검표를
--    API로 지울 수 있었음(잠금 트리거 guard_inspection_ack는 update만). select·insert·update는 예전 조건 그대로 나누고,
--    delete만 「성과관리팀 + 초안(draft)」으로 좁힘. 행 트리거(before delete)를 쓰지 않은 까닭: 관리자 영구 삭제(purgeCard → cards 삭제 →
--    inspections.card_id on delete cascade)에서 행 트리거는 발동해 영구 삭제를 막을 수 있지만, RLS는 참조 무결성 동작(연쇄 삭제)에
--    적용되지 않음 — lib/db/migrations.test.ts가 보관 카드 영구 삭제가 계속 되는지 확인함.
-- ③ 부서 확정 조건 재료를 팀 전체 과제로(§5-1): 확정은 팀 단위(can_write_report)이고 확정하면 report_locked가 그 평가단위 × 팀의
--    모든 과제 초안을 잠그는데, 확정 점검(lib/reports/queries.ts loadSubmitCards)은 사용자 권한이라 부서 담당자에게는 지정된 과제만
--    읽혀 동료 담당 과제 초안이 없어도 확정됐음. public.report_submit_cards(보고서 id)가 그 보고서의 평가단위 × 팀 × 연도 활성 카드마다
--    판정 재료만 돌려줌(과제번호·목차 포함·정렬·원장 개정 번호·초안 개정 번호·초안/구성안 있음·spec 형식 머리 — 제목·본문·spec 본문·uid는 안 줌).
--    판정은 TS submitReadiness 하나(lib/reports/submission.ts)가 하고, 여기서는 고르기만 함. 트랙·목차 포함 규칙은 loadSubmitCards와 같음.
--
-- 운영 반영 순서: db:push를 배포보다 먼저. ①②는 옛 코드가 쓰지 않는 동작(성과관리팀의 공통 지식 쓰기·점검표 지우기)만 막아 순서 무관이지만,
--   새 코드는 ③의 함수를 부르므로 함수가 없으면 확정 점검이 「확정 조건을 확인하지 못했습니다」로 막힘(화면 판정은 자기 과제 기준으로 돌아감).
--   함수만 먼저 생겨도 옛 코드는 부르지 않으므로 해가 없음.
--
-- 되돌리기(down):
--   drop function public.report_submit_cards(bigint);
--   drop policy inspections_staff_read on public.inspections; drop policy inspections_staff_insert on public.inspections;
--   drop policy inspections_staff_update on public.inspections; drop policy inspections_staff_delete on public.inspections;
--   create policy inspections_staff on public.inspections for all to authenticated using (private.is_staff()) with check (private.is_staff());
--   세 공통 지식 쓰기 정책은 private.is_admin()을 private.is_staff()로 바꿔 다시 만듦(20260925090200_rls.sql·20260925090300_storage.sql).

-- ① 공통 지식 쓰기: 관리자만
drop policy knowledge_documents_write on public.knowledge_documents;
create policy knowledge_documents_write on public.knowledge_documents for all to authenticated using (private.is_admin()) with check (private.is_admin());
drop policy knowledge_chunks_write on public.knowledge_chunks;
create policy knowledge_chunks_write on public.knowledge_chunks for all to authenticated using (private.is_admin()) with check (private.is_admin());
drop policy knowledge_objects_write on storage.objects;
create policy knowledge_objects_write on storage.objects for all to authenticated
  using (bucket_id = 'knowledge' and private.is_admin())
  with check (bucket_id = 'knowledge' and private.is_admin());

-- ② 점검표: 성과관리팀 정책을 동작별로 나누고 지우기는 초안만(부서의 읽기·확인 정책 inspections_read·inspections_ack는 그대로)
drop policy inspections_staff on public.inspections;
create policy inspections_staff_read on public.inspections for select to authenticated using (private.is_staff());
create policy inspections_staff_insert on public.inspections for insert to authenticated with check (private.is_staff());
create policy inspections_staff_update on public.inspections for update to authenticated using (private.is_staff()) with check (private.is_staff());
create policy inspections_staff_delete on public.inspections for delete to authenticated using (private.is_staff() and status = 'draft');

-- ③ 부서 확정 조건 재료(팀 전체 과제): 그 보고서를 읽을 수 있는 사람(can_read_report — 성과관리팀·관리자 전체, 작성 부서, 주관 부서)만 받고
--    아니면 0행. mine = 부르는 사람이 그 카드를 읽을 수 있음(can_read_card — 부서 담당자는 지정된 과제) — 거짓이면 화면이 「동료 담당」으로 표시.
--    spec_head는 spec이 객체일 때 형식 판별에 쓰는 머리만(version 값, rows·blocks가 배열이면 빈 배열) — TS readSection이 유효한 초안인지 판정함.
--    트랙: loadSubmitCards처럼 평가단위 id로 정한 트랙(MG-…면 경영관리, 아니면 주요사업 — lib/tracks trackOfUnit)과 eval_units.track이 같은 카드만.
--    목차 포함: report_outline 줄이 없거나 included가 비어 있으면 든 것으로 봄(loadSubmitCards의 `included !== false`).
create or replace function public.report_submit_cards(p_report_id bigint)
returns table (card_id text, task_no text, included boolean, sort integer, data_rev integer, has_draft boolean, has_outline boolean, spec_head jsonb, source_rev integer, mine boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.task_no,
    coalesce(o.included, true),
    o.sort,
    c.data_rev,
    d.card_id is not null,
    coalesce(jsonb_typeof(d.outline) <> 'null', false),
    case
      when jsonb_typeof(d.spec) = 'object' then jsonb_build_object(
        'version', d.spec -> 'version',
        'rows', case when jsonb_typeof(d.spec -> 'rows') = 'array' then '[]'::jsonb end,
        'blocks', case when jsonb_typeof(d.spec -> 'blocks') = 'array' then '[]'::jsonb end
      )
    end,
    d.source_rev,
    private.can_read_card(c.id)
  from public.reports r
  join public.eval_units u on u.id = r.eval_unit_id
  join public.cards c on c.eval_unit_id = r.eval_unit_id and c.team_id = r.team_id and c.status = 'active'
  left join public.report_outline o on o.card_id = c.id and o.year = r.year
  left join public.card_report_drafts d on d.card_id = c.id and d.year = r.year
  where r.id = p_report_id
    and private.can_read_report(r.id)
    and u.track = case when r.eval_unit_id ~ '^MG-' then '경영관리' else '주요사업' end
  order by o.sort nulls last, c.task_no
$$;
revoke all on function public.report_submit_cards(bigint) from public, anon;
grant execute on function public.report_submit_cards(bigint) to authenticated;
comment on function public.report_submit_cards(bigint) is '부서 확정 조건 재료: 보고서의 평가단위 × 팀 × 연도 활성 카드마다 과제번호·목차 포함·개정 번호·초안 있음만(제목·본문 없음). 판정은 TS submitReadiness';
