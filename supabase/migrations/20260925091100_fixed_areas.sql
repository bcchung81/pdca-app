-- 고정 영역 확정(6월 셋업): 성과관리팀이 카드의 Act·Plan·계량지표를 확정하면, 부서 작성본은 그 영역을 바꾸지 못합니다.

alter table public.cards
  add column fixed_locked_at timestamptz,
  add column fixed_locked_by uuid references auth.users (id);
comment on column public.cards.fixed_locked_at is '고정 영역(Act·Plan·계량지표) 확정 시각. 확정 뒤 부서 작성본은 이 영역을 바꾸지 못함';

create or replace function private.guard_card_version()
returns trigger
language plpgsql
set search_path = ''
as $$
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
    if exists (
      select 1 from public.cards c
      where c.id = new.card_id
        and c.fixed_locked_at is not null
        and (new.data -> 'act', new.data -> 'plan', new.data -> 'kpi') is distinct from (c.data -> 'act', c.data -> 'plan', c.data -> 'kpi')
    ) then
      raise exception '고정 영역(Act·Plan·계량지표)은 확정되어 작성본에서 바꿀 수 없습니다';
    end if;
  end if;
  return new;
end;
$$;
