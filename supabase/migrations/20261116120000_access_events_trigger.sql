-- 권한 변경 기록(access_events)을 DB 트리거가 남김(2026-11-16 시큐어 코딩 2차 점검 — 감사 기록).
-- 예전(20260930120000)에는 앱(lib/users/service.ts logAccessEvent)이 바꾼 뒤에 따로 기록했음. 그래서
--   ① 기록이 실패하면 로그 한 줄만 남고 변경은 그대로 ② 화면을 거치지 않은 직접 변경(PostgREST로 profiles·card_assignees)은 기록이 없음
--   ③ 정책상 성과관리팀이 자기 이름으로 임의 내용의 기록을 넣을 수 있었음(위조).
--
-- 이제:
--   · profiles의 역할·팀·활성이 바뀌면 행 트리거가 한 줄: 활성이 바뀌면 user_deactivated·user_restored, 아니면 user_updated.
--     detail은 바뀐 칸만 {"role"|"team"|"active": {"from", "to"}}(이름 바꾸기는 권한 변경이 아니라 남기지 않음).
--   · card_assignees 추가·삭제는 문장 트리거가 사용자마다 한 줄: assigned·unassigned {"count", "card_ids"(앞 60개)} — 앱이 남기던 모양.
--     다른 변경에 딸려 지워진 것(사용자 팀·역할 변경, 카드 팀 변경, 카드 영구 삭제의 연쇄)은 detail.auto = true.
--     계정 자체가 지워지는 중(auth.users 삭제 연쇄)이면 남기지 않음 — 대상 행이 없어 외래 키가 삭제를 막기 때문.
--   · 행위자는 auth.uid(). 서비스 키·DB 직접 연결(계정 생성 직후 가입 트리거, pnpm db:user, 시드·e2e 정리)은 auth.uid()가 없어
--     actor_id = null, detail.via = 'system'으로 남김.
--   · 계정 만들기(user_added)는 서비스 키(Auth 관리 API)로 일어나 DB가 행위자를 모름 → 앱이 서비스 키로 남김(createAccount).
--     그 뒤 이름·팀·역할 지정과 팀 과제 지정은 트리거가 user_updated·assigned로 남김.
--   · 로그인 사용자의 access_events 쓰기를 모두 거둠(insert 정책 삭제 + 명시적 revoke — 운영 DB에는 Supabase 기본 권한이 남아 있을 수 있음).
--     읽기(access_events_read: 성과관리팀·관리자)는 그대로. 서비스 키(service_role)는 그대로 씀.
--   · 트리거 함수는 security definer + search_path = '', 실행 권한은 public·anon·authenticated에서 거둠(트리거 실행에는 필요 없음).
--
-- 운영 반영 순서: 배포 먼저 → 바로 pnpm db:push.
--   새 코드는 user_updated·user_deactivated·user_restored·assigned·unassigned를 남기지 않고(트리거 몫) user_added만 서비스 키로 남김.
--   · 배포 ~ db:push 사이(몇 분): 화면에서 바꾼 역할·팀·활성·담당 지정의 기록이 빠짐(변경 자체는 정상). 계정 만들기 기록은 남음.
--   · 거꾸로(db:push 먼저) 하면 그 사이 옛 코드의 기록 insert가 권한 오류로 실패(로그 한 줄, 변경은 정상)하고 트리거가 남기므로 기록은 빠지지 않음.
--     다만 옛 코드의 계정 만들기 기록(user_added)이 빠짐. 둘 다 본 작업은 막지 않음 — 계정 만들기가 드문 때라면 db:push 먼저도 됨.
--
-- 되돌리기(down):
--   drop trigger profiles_access_event on public.profiles;
--   drop trigger card_assignees_access_added on public.card_assignees;
--   drop trigger card_assignees_access_removed on public.card_assignees;
--   drop function private.log_profile_access_event();
--   drop function private.log_assignee_access_event();
--   grant insert on public.access_events to authenticated;
--   create policy access_events_insert on public.access_events for insert to authenticated
--     with check (private.is_staff() and actor_id = (select auth.uid()));
--   (앱은 이 변경 전 커밋의 logAccessEvent 호출로 되돌림)

-- ── 로그인 사용자의 기록 쓰기 거둠 ─────────────────────────────────────────────────────────
drop policy access_events_insert on public.access_events;
revoke all on public.access_events from anon, authenticated;
grant select on public.access_events to authenticated;

comment on table public.access_events is '누가 누구의 계정·부서·활성·과제 담당을 바꿨나(DB 트리거가 남김, 계정 만들기만 앱이 서비스 키로). action: user_added · user_updated · user_deactivated · user_restored · assigned · unassigned. 행위자 없음(actor_id null)은 서비스 키·DB 직접 변경(detail.via = system)';

-- ── 프로필: 역할·팀·활성 ───────────────────────────────────────────────────────────────────
create or replace function private.log_profile_access_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_detail jsonb := '{}'::jsonb;
  v_action text;
begin
  if new.role is distinct from old.role then
    v_detail := v_detail || jsonb_build_object('role', jsonb_build_object('from', old.role, 'to', new.role));
  end if;
  if new.team_id is distinct from old.team_id then
    v_detail := v_detail || jsonb_build_object('team', jsonb_build_object('from', old.team_id, 'to', new.team_id));
  end if;
  if new.active is distinct from old.active then
    v_detail := v_detail || jsonb_build_object('active', jsonb_build_object('from', old.active, 'to', new.active));
    v_action := case when new.active then 'user_restored' else 'user_deactivated' end;
  else
    v_action := 'user_updated';
  end if;
  if v_actor is null then
    v_detail := v_detail || jsonb_build_object('via', 'system');
  end if;
  insert into public.access_events (actor_id, target_user_id, action, detail) values (v_actor, new.id, v_action, v_detail);
  return null;
end;
$$;
create trigger profiles_access_event after update of role, team_id, active on public.profiles
  for each row
  when ((old.role, old.team_id, old.active) is distinct from (new.role, new.team_id, new.active))
  execute function private.log_profile_access_event();

-- ── 과제 담당자: 추가·삭제(문장 단위 — 한 번에 여러 과제를 지정해도 사용자마다 한 줄) ──────────────
create or replace function private.log_assignee_access_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_extra jsonb := '{}'::jsonb;
begin
  if v_actor is null then
    v_extra := v_extra || jsonb_build_object('via', 'system');
  end if;
  -- 다른 트리거·외래 키 연쇄 안에서 일어난 변경(사용자 팀·역할 변경, 카드 팀 변경·영구 삭제)
  if pg_trigger_depth() > 1 then
    v_extra := v_extra || jsonb_build_object('auto', true);
  end if;
  if tg_op = 'INSERT' then
    insert into public.access_events (actor_id, target_user_id, action, detail)
    select v_actor, r.user_id, 'assigned',
           jsonb_build_object('count', count(*), 'card_ids', to_jsonb((array_agg(r.card_id order by r.card_id))[1:60])) || v_extra
    from new_rows r
    where exists (select 1 from auth.users u where u.id = r.user_id)
    group by r.user_id;
  else
    insert into public.access_events (actor_id, target_user_id, action, detail)
    select v_actor, r.user_id, 'unassigned',
           jsonb_build_object('count', count(*), 'card_ids', to_jsonb((array_agg(r.card_id order by r.card_id))[1:60])) || v_extra
    from old_rows r
    where exists (select 1 from auth.users u where u.id = r.user_id)
    group by r.user_id;
  end if;
  return null;
end;
$$;
create trigger card_assignees_access_added after insert on public.card_assignees
  referencing new table as new_rows
  for each statement execute function private.log_assignee_access_event();
create trigger card_assignees_access_removed after delete on public.card_assignees
  referencing old table as old_rows
  for each statement execute function private.log_assignee_access_event();

revoke execute on function private.log_profile_access_event() from public, anon, authenticated;
revoke execute on function private.log_assignee_access_event() from public, anon, authenticated;
