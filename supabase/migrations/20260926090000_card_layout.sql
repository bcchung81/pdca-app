-- 과제관리카드 원본 배치: 한글 파일에서 뗀 카드 표·붙임 표(칸·문단·줄 배치·글자와 문단 모양·그림 자리)와 문단마다 그때의 카드 JSON 경로.
-- 화면은 이것과 지금 카드 JSON으로 원본 그대로 그립니다(lib/cards/layout-render.ts). 그림 바이트는 card-originals/{uid}/hwp-….
-- 권한은 카드 행 그대로(읽기 can_read_card, 쓰기 성과관리팀·관리자). 비어 있으면 원본 양식 렌더러(render.ts)로 그립니다.
alter table public.cards add column layout jsonb;
comment on column public.cards.layout is '원본 배치(lib/hwp/layout.ts CardLayout + 문단 잇기 표시). 적재(pnpm db:layout)·현행화 때 채움';

-- 현행화: 올린 한글 파일(HWP)에서 뗀 카드 배치. 원장 반영·새 과제 등록 때 cards.layout으로
alter table public.card_import_items add column layout jsonb;
comment on column public.card_import_items.layout is '파일의 원본 배치(HWP일 때). 원장 반영 때 cards.layout으로 옮김';

-- 수정일자: 원본 배치만 바뀐 경우(적재 스크립트가 배치를 채울 때)는 그대로 둠 — 목록의 「수정일자」가 글을 고친 때를 가리키게
create or replace function private.touch_card_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'layout' - 'updated_at') is distinct from (to_jsonb(old) - 'layout' - 'updated_at') then
    new.updated_at := now();
  end if;
  return new;
end;
$$;
drop trigger cards_touch on public.cards;
create trigger cards_touch before update on public.cards
  for each row execute function private.touch_card_updated_at();
