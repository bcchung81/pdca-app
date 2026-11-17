// 앱 서버 경유 표지(근본책 1단계, 2026-11-17 — docs/design/auth-db.md): 서버가 만드는 사용자 권한 Supabase 클라이언트에만 비밀 머리글을 실어,
// DB 쓰기 정책(private.app_write())이 「앱 서버를 거친 요청」만 통과시키게 함. 비밀은 서버 환경변수 APP_WRITE_KEY에만 두고(NEXT_PUBLIC_ 아님),
// DB에는 그 sha256 hex만 등록함(scripts/db/app-write-key.ts). 값이 없으면 머리글을 싣지 않음 — 로컬·시험·정책을 걸기 전 DB는 그대로 동작.
// 순수 모듈(입출력 없음)이라 시험이 직접 부름. 부르는 곳은 server-only 모듈(server.ts·job-client.ts)뿐이고 브라우저 클라이언트(browser.ts)는 부르지 않음(app-write.test.ts가 확인).

/** 요청 머리글 이름(PostgREST가 request.headers에 소문자로 담음) */
export const APP_WRITE_HEADER = "x-app-write";

/** 서버 Supabase 클라이언트의 global.headers에 더할 머리글 — APP_WRITE_KEY가 있을 때만(앞뒤 공백은 걷음) */
export function appWriteHeaders(env: Record<string, string | undefined> = process.env): Record<string, string> {
  const key = env.APP_WRITE_KEY?.trim();
  return key ? { [APP_WRITE_HEADER]: key } : {};
}
