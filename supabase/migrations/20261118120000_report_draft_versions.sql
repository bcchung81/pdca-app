-- 경평 초안 「판 기록」(2026-11-18 사용자 결정 3~6): 과제·연도 초안 행(card_report_drafts)이 저장될 때마다 저장 직전 판(초안 + 구성안)을 남깁니다.
--
-- 무엇을: card_report_drafts는 과제·연도 한 행을 덮어써 옛 초안 전체가 어디에도 남지 않았습니다(블록 고치기 이력 report_draft_edits는 블록 단위뿐).
--   AFTER UPDATE 트리거가 spec이나 outline이 바뀐 저장마다 OLD 행(초안·경고·없는 숫자·모델·원장 개정 번호 + 구성안 칸 전부)을
--   card_report_draft_versions에 넣고, 화면(components/reports/draft-versions.tsx)이 고른 판을 서버 액션(app/(app)/reports/cards/version-actions.ts
--   restoreDraftVersion → lib/reports/draft-store.ts saveDraftRow)으로 되씁니다. 되돌리기도 저장이라 되돌리기 직전 판이 남아 되돌리기를 되돌릴 수 있습니다.
--   지표 단위 부분(eval_unit_report_parts)·목차(report_outline)는 넣지 않습니다(결정 6).
--
-- 판을 남기지 않는 때: 처음 만들 때(INSERT — 덮인 것이 없음), spec·outline이 그대로인 저장(모델·경고·구성안 상태만 바뀐 저장 포함).
--   초안 행을 지우면 그 과제·연도의 판도 사라집니다(초안 행 FK on delete cascade — 카드 영구 삭제의 cascade도 같은 길).
--
-- 직접 고침 묶음(결정 3): 앱이 직접 고침 자동 저장(edit-actions.ts saveDraftTexts)에만 요청 머리글 x-draft-save: text를 싣습니다
--   (postgrest-js setHeader — 표지 머리글 x-app-write와 같은 길, lib/reports/draft-versions.ts DRAFT_SAVE_HEADER).
--   이번 저장이 직접 고침이고, 이 과제·연도의 가장 최근 판이 같은 사람의 직접 고침 판이며 마지막 저장이 10분 안이면 새 판을 넣지 않습니다
--   → 고치기 시작 전 판 하나가 남습니다. 10분은 마지막 저장부터 셉니다(이어 고치는 동안은 판 하나, 10분 쉬었다 다시 고치면 새 판).
--   표시가 없거나 빠지면 언제나 새 판을 넣습니다(판이 더 쌓일 뿐 잃지 않음). 되돌리기(restoreDraftVersion)는 x-draft-save: restore로 목록에 「되돌리기」 표시만 남김.
--   머리글은 앱 밖에서도 실을 수 있지만, 초안 표 쓰기는 앱 서버 경유 표지(private.app_write() — 20261117130000)가 이미 막고, 위조해도 판이 덜 쌓일 뿐입니다.
-- 보관 상한(결정 4): 넣은 뒤 이 과제·연도의 판이 30개를 넘으면 오래된 것(id 작은 것)부터 지웁니다.
--
-- 권한: 읽기는 그 카드를 볼 수 있는 사람(private.can_read_card — 부서 담당자는 지정된 자기 과제만). 사용자 쓰기 정책·권한은 두지 않습니다
--   (판은 트리거만 씀 — authenticated는 select만, anon 없음, 시퀀스 권한 없음). 트리거 함수는 private 스키마 security definer(표 주인으로 넣음 — RLS 밖)이고
--   auth.uid()로 덮은 사람을 적습니다(서비스 키·postgres 스크립트의 저장이면 null — 화면 「관리 작업」).
--   트리거 함수는 rpc로 부를 수 없고(private, returns trigger) 실행 권한도 회수합니다. 표지 확인을 따로 하지 않는 까닭: 초안 행 쓰기 자체를
--   card_report_drafts 정책(표지 포함)이 이미 거르고, 서비스 키 스크립트의 저장도 판으로 남아야 하기 때문입니다.
--
-- 크기(20261117160000_size_checks.sql과 같은 꼴): spec·outline 4 MiB, object. 초안 행의 같은 제약을 지난 값을 그대로 옮기므로 정상 저장을 막지 않습니다.
--   용량 어림: 판 하나 ≈ spec(운영 최대 25.5KB) + outline(운영 최대 30.7KB) + 작은 칸 → 최대 약 57KB(::text, TOAST 압축 전).
--   × 30판 × 과제 103장 ≈ 최대 176MB, 평균(spec p50·outline p50 어림 각 15KB) 쪽이면 ≈ 95MB. TOAST 압축(pglz)으로 실제 저장은 이보다 작음.
--
-- 운영 반영 순서: DB 먼저(이 파일 pnpm db:push) — 트리거만으로 동작하므로 앱 배포 전에도 판이 쌓입니다(그동안 직접 고침 묶음 없이 저장마다 새 판).
--   그 뒤 앱 배포(직접 고침 묶음 머리글·판 기록 화면·되돌리기). 앱을 먼저 배포하면 판 기록 화면이 표를 못 읽어 「판 기록을 읽지 못했습니다」만 보임(저장은 그대로).
--
-- 되돌리기(down):
--   drop trigger card_report_drafts_version on public.card_report_drafts;
--   drop function private.keep_card_report_draft_version();
--   drop table public.card_report_draft_versions;

create table public.card_report_draft_versions (
  id bigint generated always as identity primary key,
  card_id text not null references public.cards (id) on delete cascade,
  year integer not null check (year between 2020 and 2100),
  -- 판 내용: 그 시점 초안 행의 칸 그대로(card_report_drafts와 같은 이름·꼴)
  spec jsonb,
  warnings jsonb not null default '[]'::jsonb,
  unknown_numbers text[] not null default '{}',
  model text,
  source_rev integer,
  outline jsonb,
  outline_status text check (outline_status in ('draft', 'approved')),
  outline_warnings jsonb not null default '[]'::jsonb,
  outline_model text,
  outline_at timestamptz,
  outline_approved_by uuid references auth.users (id) on delete set null,
  outline_approved_at timestamptz,
  -- 판 정보
  state_at timestamptz not null,
  replaced_by uuid references auth.users (id) on delete set null,
  replaced_at timestamptz not null default now(),
  changed text not null check (changed in ('draft', 'outline', 'both')),
  save_kind text check (save_kind in ('text', 'restore')),
  -- 목록용(본문을 읽지 않고 블록 수를 보임)
  block_count integer generated always as (case when jsonb_typeof(spec -> 'blocks') = 'array' then jsonb_array_length(spec -> 'blocks') end) stored,
  constraint card_report_draft_versions_draft foreign key (card_id, year) references public.card_report_drafts (card_id, year) on delete cascade,
  constraint card_report_draft_versions_has_content check (spec is not null or outline is not null),
  constraint card_report_draft_versions_spec_size check (octet_length(spec::text) <= 4194304),
  constraint card_report_draft_versions_spec_shape check (jsonb_typeof(spec) = 'object'),
  constraint card_report_draft_versions_outline_size check (octet_length(outline::text) <= 4194304),
  constraint card_report_draft_versions_outline_shape check (jsonb_typeof(outline) = 'object')
);
comment on table public.card_report_draft_versions is '경평 초안 판 기록: card_report_drafts 저장 직전 판(초안 + 구성안). 트리거만 씀, 과제·연도마다 최근 30판';
comment on column public.card_report_draft_versions.state_at is '그 판이 저장된 때(덮이기 전 행의 updated_at)';
comment on column public.card_report_draft_versions.replaced_by is '그 판을 덮은 사람(auth.uid() — 스크립트면 null)';
comment on column public.card_report_draft_versions.changed is '무엇이 바뀌어 덮였나: draft = 초안, outline = 구성안, both = 둘 다';
comment on column public.card_report_draft_versions.save_kind is '덮은 저장의 종류(머리글 x-draft-save): text = 직접 고침(같은 사람 10분 안 묶음), restore = 판 되돌리기, null = 그 밖';
create index card_report_draft_versions_key on public.card_report_draft_versions (card_id, year, id desc);

alter table public.card_report_draft_versions enable row level security;
create policy card_report_draft_versions_read on public.card_report_draft_versions for select to authenticated using (private.can_read_card(card_id));

revoke all on public.card_report_draft_versions from public, anon, authenticated;
grant select on public.card_report_draft_versions to authenticated;
grant all on public.card_report_draft_versions to service_role;
revoke all on sequence public.card_report_draft_versions_id_seq from public, anon, authenticated;

-- 저장 직전 판 넣기(AFTER UPDATE — 저장이 성공한 뒤에만, 가드 트리거 card_report_drafts_guard를 지난 저장만)
create function private.keep_card_report_draft_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_kind text;
  v_last public.card_report_draft_versions%rowtype;
begin
  v_kind := nullif(current_setting('request.headers', true), '')::json ->> 'x-draft-save';
  if v_kind is not null and v_kind not in ('text', 'restore') then
    v_kind := null;
  end if;
  -- 직접 고침 묶음: 가장 최근 판이 같은 사람의 직접 고침 판이고 마지막 저장(old.updated_at)이 10분 안이면 넣지 않음(고치기 시작 전 판이 남아 있음).
  -- 10분은 마지막 저장부터 셈(2026-11-18 사용자 결정 — 원장 수정 이력의 30분 묶음과 같은 방식). 가장 최근 판이 이 사람의 직접 고침 판이면
  -- 그 뒤의 spec·outline 저장은 모두 이 사람의 묶인 직접 고침이므로 old.updated_at이 곧 묶음의 마지막 저장 시각
  if v_kind = 'text' and v_me is not null then
    select * into v_last
      from public.card_report_draft_versions v
     where v.card_id = old.card_id and v.year = old.year
     order by v.id desc
     limit 1;
    if found and v_last.save_kind = 'text' and v_last.replaced_by = v_me and old.updated_at > now() - interval '10 minutes' then
      return null;
    end if;
  end if;
  insert into public.card_report_draft_versions (
    card_id, year, spec, warnings, unknown_numbers, model, source_rev,
    outline, outline_status, outline_warnings, outline_model, outline_at, outline_approved_by, outline_approved_at,
    state_at, replaced_by, replaced_at, changed, save_kind
  ) values (
    old.card_id, old.year, old.spec, old.warnings, old.unknown_numbers, old.model, old.source_rev,
    old.outline, old.outline_status, old.outline_warnings, old.outline_model, old.outline_at, old.outline_approved_by, old.outline_approved_at,
    old.updated_at, v_me, now(),
    case
      when old.spec is distinct from new.spec and old.outline is distinct from new.outline then 'both'
      when old.spec is distinct from new.spec then 'draft'
      else 'outline'
    end,
    v_kind
  );
  -- 보관 상한: 이 과제·연도 최근 30판만
  delete from public.card_report_draft_versions v
   where v.card_id = old.card_id and v.year = old.year
     and v.id not in (
       select k.id from public.card_report_draft_versions k
        where k.card_id = old.card_id and k.year = old.year
        order by k.id desc
        limit 30
     );
  return null;
end;
$$;
comment on function private.keep_card_report_draft_version() is '경평 초안 판 기록 트리거: 저장 직전 판을 넣고(직접 고침은 같은 사람 10분 안 묶음) 과제·연도마다 최근 30판만 남김';
revoke all on function private.keep_card_report_draft_version() from public, anon, authenticated;

create trigger card_report_drafts_version after update on public.card_report_drafts
  for each row
  when (old.spec is distinct from new.spec or old.outline is distinct from new.outline)
  execute function private.keep_card_report_draft_version();
