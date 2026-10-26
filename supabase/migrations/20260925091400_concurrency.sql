-- 동시 편집 보호(2차 리뷰 반영)
-- 1) 원장 개정 번호: 원장 카드 JSON을 쓸 때마다 1씩 올리고, 불러온 번호가 그대로일 때만 씀(오래 열어 둔 창이 확정·다른 수정을 덮지 않게)
-- 2) 카드마다 열린 작성본(작성 중·제출)은 하나만
-- 3) 고정 영역이 잠긴 카드: 작성본의 data뿐 아니라 base의 Act·Plan·계량지표도 원장 값으로(확정 병합에서 가짜 변경이 생기지 않게)

alter table public.cards add column data_rev integer not null default 0;
comment on column public.cards.data_rev is '원장 카드 JSON 개정 번호. 저장·작성본 확정 때 불러온 번호와 같을 때만 쓰고 1 올림';

do $$
begin
  if exists (
    select card_id from public.card_versions where status in ('draft', 'submitted') group by card_id having count(*) > 1
  ) then
    raise exception '열린 작성본이 둘 이상인 카드가 있습니다. 먼저 정리한 뒤 다시 적용하세요';
  end if;
end;
$$;
create unique index card_versions_one_open_idx on public.card_versions (card_id) where status in ('draft', 'submitted');

create or replace function private.guard_card_version()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ledger jsonb;
  locked timestamptz;
  fixed jsonb;
begin
  if current_user in ('authenticated', 'anon') and not private.is_staff() then
    if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status is distinct from 'confirmed') then
      raise exception '작성본 확정은 성과관리팀만 할 수 있습니다';
    end if;
    if tg_op = 'UPDATE' and old.status = 'submitted' and new.data is distinct from old.data then
      raise exception '제출한 작성본은 제출을 취소한 뒤 고칠 수 있습니다';
    end if;
    if tg_op = 'UPDATE' and (new.confirmed_by, new.confirmed_at) is distinct from (old.confirmed_by, old.confirmed_at) then
      raise exception '확정 정보는 성과관리팀만 바꿀 수 있습니다';
    end if;
    -- 고정 영역이 확정된 카드: 작성본의 Act·Plan·계량지표는 늘 원장 값(data·base 모두)
    select c.data, c.fixed_locked_at into ledger, locked from public.cards c where c.id = new.card_id;
    if locked is not null then
      fixed := jsonb_build_object('act', ledger -> 'act', 'plan', ledger -> 'plan', 'kpi', ledger -> 'kpi');
      new.data := new.data || fixed;
      if new.base is not null then
        new.base := new.base || fixed;
      end if;
    end if;
  end if;
  return new;
end;
$$;
