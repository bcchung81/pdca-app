-- 앱 서버 경유 표지 기반(근본책 1단계 A, 2026-11-17): 키 표·판정 함수·확인 함수. 이 파일은 정책을 바꾸지 않습니다(정책은 20261117130000).
--
-- 무엇을: 앱 서버가 DB에 보내는 요청에만 서버 전용 비밀(APP_WRITE_KEY)을 머리글 x-app-write로 싣고(lib/supabase/server.ts·job-client.ts),
--   DB는 그 값의 sha256이 키 표에 있는지만 봅니다(private.app_write()). 쓰기 정책에 「and private.app_write()」를 더한 표는
--   로그인 사용자가 공개 키 + 자기 토큰으로 앱 밖에서 직접 쓰지 못하고, 서버 액션의 검증·다시 점검을 거친 쓰기만 들어옵니다.
--   역할·RLS 행 판정·가드 트리거·auth.uid()·감사 트리거는 그대로입니다(서비스 키를 쓰지 않음). 설계: docs/design/auth-db.md 「앱 서버 경유 표지」.
--
-- 머리글 이름: PostgREST는 요청 머리글을 이름을 소문자로 바꾼 JSON 객체로 request.headers 설정에 넣습니다
--   (PostgREST 문서 「Accessing Request Headers, Cookies and JWT claims」 — current_setting('request.headers', true)::json->>'user-agent' 꼴).
--   HTTP 머리글 이름은 대소문자를 가리지 않으므로 앱이 어떻게 적어 보내든 여기서는 소문자 'x-app-write'로 읽습니다.
--   설정이 없거나(직접 연결·스크립트) 빈 문자열이면 json 변환 전에 null로 돌려 false가 되게 합니다(nullif).
--
-- 키 표: 비밀 자체는 두지 않고 sha256(hex 64자)만. 누구에게도 읽기·쓰기 권한을 주지 않습니다(postgres·service_role만 — 등록은 운영자 SQL).
--   교체 기간에만 2행(새 키·옛 키), 그 밖에는 1행. 3행째는 트리거가 거절합니다.
--
-- 해시 등록(운영자가 SQL 편집기에서 — 비밀 값은 저장소·마이그레이션에 넣지 않음. scripts/db/app-write-key.ts가 키와 이 SQL을 만들어 줌):
--   insert into private.app_write_key (hash, note) values ('<sha256 hex of APP_WRITE_KEY>', '2026-11 첫 키');
--   (같은 값: select encode(sha256(convert_to('<APP_WRITE_KEY>', 'UTF8')), 'hex'); — 이 줄은 비밀이 SQL 기록에 남으므로 운영에서는 로컬에서 계산한 해시만 넣음)
--
-- 키 교체(끊김 없이):
--   1. 새 키를 만들고 그 해시를 insert(이때 2행) → 2. Vercel APP_WRITE_KEY를 새 값으로 바꾸고 다시 배포
--   → 3. public.app_write_probe()가 새 배포에서 true인지 확인 → 4. 옛 해시 delete(1행). 유출이 의심되면 1~4를 바로 합니다.
--
-- 확인 함수 public.app_write_probe(): 이 요청에 맞는 표지가 실렸는지 true·false만 돌려줍니다(정책을 걸기 전, 운영 관문이 머리글을 DB까지 넘기는지 확인용).
--   비밀은 256비트 난수라 이 함수로 맞혀 보는 것은 의미가 없어 anon·authenticated 모두 부를 수 있게 둡니다.
--
-- 운영 반영 순서: 순서 무관(정책을 바꾸지 않으므로 앱 동작이 바뀌지 않음). 다만 정책 파일(20261117130000)은
--   이 파일 + 앱 머리글 배포 + 해시 등록 + 확인 함수 true를 모두 본 뒤에만 올립니다.
--
-- 되돌리기(down — 20261117130000을 먼저 되돌린 뒤):
--   drop function public.app_write_probe();
--   drop function private.app_write();
--   drop table private.app_write_key;
--   drop function private.guard_app_write_key();

create table private.app_write_key (
  hash text primary key check (hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  note text
);
comment on table private.app_write_key is '앱 서버 경유 표지(x-app-write) 비밀의 sha256 hex. 평소 1행, 키 교체 때만 2행. 등록·삭제는 운영자 SQL';
alter table private.app_write_key enable row level security; -- 정책 없음 = 표 주인(postgres)·service_role만
revoke all on private.app_write_key from public, anon, authenticated;
grant select, insert, delete on private.app_write_key to service_role;

create function private.guard_app_write_key()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from private.app_write_key) >= 2 then
    raise exception '표지 키는 교체 기간에도 2개까지입니다 — 옛 키를 먼저 지워 주세요';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_app_write_key() from public, anon, authenticated;
create trigger app_write_key_guard before insert on private.app_write_key
  for each row execute function private.guard_app_write_key();

-- 이 요청에 맞는 표지가 실렸는지. 머리글이 없거나 비었거나 키 표에 없는 값이면 false(null을 돌려주지 않음)
create function private.app_write()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select exists (
      select 1 from private.app_write_key k
      where k.hash = encode(sha256(convert_to(h.v, 'UTF8')), 'hex')
    )
    from (select nullif(nullif(current_setting('request.headers', true), '')::json ->> 'x-app-write', '') as v) h
    where h.v is not null
  ), false)
$$;
comment on function private.app_write() is '요청 머리글 x-app-write의 sha256이 private.app_write_key에 있으면 true — 쓰기 정책의 「앱 서버 경유」 조건';
revoke all on function private.app_write() from public, anon;
grant execute on function private.app_write() to authenticated, service_role;

create function public.app_write_probe()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.app_write()
$$;
comment on function public.app_write_probe() is '확인용: 이 요청에 맞는 앱 서버 경유 표지가 실렸는지(운영 관문이 머리글을 넘기는지 정책 적용 전에 확인)';
revoke all on function public.app_write_probe() from public;
grant execute on function public.app_write_probe() to anon, authenticated, service_role;
