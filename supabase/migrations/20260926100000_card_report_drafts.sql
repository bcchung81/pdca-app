-- 12월 경영실적보고서 과제별 초안: 과제관리카드 1장 → 평가내용2 소항목(가.) spec(JSON). HTML·HWPX 렌더러가 같은 spec을 읽습니다.
-- 초안은 원장(확정 카드) 기준으로 만들고, 만들 때의 원장 개정 번호(source_rev)를 남겨 원장이 바뀌면 「다시 만들기」를 알립니다.
-- 읽기는 그 카드를 볼 수 있는 사람, 쓰기는 그 카드를 고칠 수 있는 사람(부서는 자기 부서 카드, 성과관리팀·관리자는 전부).

create table public.card_report_drafts (
  card_id text not null references public.cards (id) on delete cascade,
  year integer not null check (year between 2020 and 2100),
  spec jsonb not null,
  warnings jsonb not null default '[]'::jsonb,
  unknown_numbers text[] not null default '{}',
  model text,
  source_rev integer,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (card_id, year)
);
comment on table public.card_report_drafts is '12월 보고서 과제별(소항목) 초안 spec. 카드에 없는 숫자는 unknown_numbers로 경고';
create trigger card_report_drafts_touch before update on public.card_report_drafts
  for each row execute function private.touch_updated_at();

revoke all on public.card_report_drafts from anon;
grant select, insert, update, delete on public.card_report_drafts to authenticated;
grant all on public.card_report_drafts to service_role;

alter table public.card_report_drafts enable row level security;
create policy card_report_drafts_read on public.card_report_drafts for select to authenticated using (private.can_read_card(card_id));
create policy card_report_drafts_write on public.card_report_drafts for all to authenticated
  using (private.can_write_card(card_id)) with check (private.can_write_card(card_id));
