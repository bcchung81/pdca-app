-- AI 요청을 백그라운드 작업으로(2026-11-06 사용자 결정 — 「다른 화면으로 가도 답이 나올 때까지 유지」).
-- 과제원장 AI 작성지원(개선 제안·실적 발굴·실적 반영·보완 점검·질문)·카드 리뷰어 코멘트와 경평 초안(구성안 만들기·여러 안·절 다시 짜기·집필·자료 반영 고치기·바로 만들기)은
-- 서버 액션이 「시작」만 하고(권한·입력 검증·제한·running 행) AI 호출·검증·저장은 응답 뒤 after()에서 돎(lib/ai/background.ts).
-- 화면은 진행 상태를 GET 라우트(app/api/ai/requests)로 읽어 폴링하고, 끝난 결과는 이 표에서 읽음(app/api/ai/results).
--
-- 1) ai_requests.job: 백그라운드 작업이면 그 종류(null이면 예전처럼 동기 호출 — 블록 고치기·월간 점검·첨부 그림 설명 등).
--    진행 중 판정은 「job이 있고 결과 행이 아직 없음」(호출 기록은 AI가 돌려준 직후 ok로 끝맺지만 검증·저장·분량 채움은 그 뒤에도 돎).
--    로그인 사용자는 넣을 때만 정하고 고치지 못함(열 단위 update 권한 목록 — 20261010100000 — 에 넣지 않음).
-- 2) ai_results: 백그라운드 작업 하나의 결과(작업 행 = ai_requests의 그 요청 — 여러 안 묶음은 첫 행). 요청한 본인만 읽고 지움, 7일 뒤 만료.
--    result = { ok, message, data? } — data는 기능마다(작성지원·질문의 대화 차례, 코멘트 처리 결과와 보낼 때의 카드, 여러 안 견본). 경평 초안의 구성안·초안 본문은
--    예전처럼 card_report_drafts에 저장하고 여기에는 끝맺음 글만 남김.
--    본문을 서버에 두는 까닭: 예전에는 작성지원·질문 답을 브라우저 탭(sessionStorage)에만 둬 새로 고침·탭 닫기·다른 PC에서 잃었음.
--    · 읽기: 본인 행이고 만료 전(expires_at > now())만 — 성과관리팀·관리자도 남의 답은 못 읽음(ai_requests는 staff가 읽지만 본문은 다름)
--    · 넣기: 본인 이름으로, 자기 요청 기록(같은 카드·같은 기능)에만 — after() 안에서 사용자 권한 클라이언트가 넣음(서비스 키 안 씀)
--    · 지우기: 본인 행(「기록 지우기」)
--    · 만료 행 물리 삭제: 넣을 때마다 문장 트리거(private.prune_ai_results — security definer)가 만료 행을 모두 지움. 읽기 정책이 만료 행을 숨겨
--      사용자 권한의 delete … where는 만료 행을 못 보므로(정책상 where가 있는 delete는 select 정책도 받음) DB 함수가 지움. 정기 작업(크론)은 이 저장소에 없음.
--    · 과제 영구 삭제(관리자 purgeCard)면 card_id on delete cascade로 함께 지워짐, 요청 기록이 지워지면(사용자 삭제 연쇄) request_id로 함께.
--
-- 운영 반영 순서: db:push를 배포보다 먼저. 새 코드는 ai_requests.job 열과 ai_results 표에 쓰므로 표가 없으면 AI 요청 시작이 실패함.
--   옛 코드는 새 열·표를 쓰지 않아 db:push만 먼저 돼도 깨지지 않음.
--
-- 되돌리기(down):
--   drop trigger ai_results_prune on public.ai_results; drop function private.prune_ai_results();
--   drop table public.ai_results; alter table public.ai_requests drop column job;

alter table public.ai_requests
  add column job text check (job is null or job in ('outline', 'alts', 'part', 'plan', 'revise', 'draft', 'assist', 'chat', 'comment'));
comment on column public.ai_requests.job is '백그라운드 작업 종류(after()에서 도는 AI 요청 — lib/ai/jobs.ts JOB_KINDS). null이면 동기 호출';
create index ai_requests_job_idx on public.ai_requests (user_id, created_at desc) where job is not null;

create table public.ai_results (
  request_id bigint primary key references public.ai_requests (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  card_id text references public.cards (id) on delete cascade,
  feature text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);
comment on table public.ai_results is 'AI 백그라운드 작업 결과(요청한 본인만 읽음, 7일 뒤 만료 — 넣을 때 만료 행을 지움)';
comment on column public.ai_results.result is '{ ok, message, data? } — data는 기능마다(lib/ai/jobs.ts)';
create index ai_results_user_card_idx on public.ai_results (user_id, card_id, created_at desc);
create index ai_results_expires_idx on public.ai_results (expires_at);

revoke all on public.ai_results from anon;
grant select, insert, delete on public.ai_results to authenticated;
grant all on public.ai_results to service_role;
alter table public.ai_results enable row level security;

create policy ai_results_read on public.ai_results for select to authenticated
  using (user_id = (select auth.uid()) and expires_at > now());
create policy ai_results_insert on public.ai_results for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (card_id is null or private.can_read_card(card_id))
    and exists (
      select 1 from public.ai_requests r
      where r.id = request_id and r.user_id = (select auth.uid()) and r.job is not null
        and r.feature = ai_results.feature and r.card_id is not distinct from ai_results.card_id
    )
  );
create policy ai_results_delete on public.ai_results for delete to authenticated
  using (user_id = (select auth.uid()));

create or replace function private.prune_ai_results()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.ai_results where expires_at <= now();
  return null;
end;
$$;
comment on function private.prune_ai_results() is 'ai_results에 넣을 때마다 만료(7일) 행을 지움 — 사용자 권한으로는 만료 행이 안 보여 못 지움';
revoke all on function private.prune_ai_results() from public;
create trigger ai_results_prune after insert on public.ai_results for each statement execute function private.prune_ai_results();
