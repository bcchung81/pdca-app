// 부서 화면 보기(성과관리팀·관리자가 ?team=으로 부서 담당자 화면을 그대로 봄 — lib/auth/scope.ts deptScope)에서 보낸 요청인가(순수, 2026-10-10 개선 계획 P2-6).
// 서버 액션은 지금 화면 주소로 POST되고 브라우저가 Referer에 그 주소를 실어 보냄 — 읽기 전용이 화면에서만이던 것을 서버 쓰기 액션도 거절하게.

export const PREVIEW_WRITE_MSG = "부서 화면 보기(읽기 전용)에서는 고칠 수 없습니다. 부서 화면 보기를 닫고 원래 화면에서 해 주세요.";

/**
 * 부서 화면 보기 주소: /my·/my/…(부서 담당자 화면), 카드 전체 페이지 /cards/<uid>, 경평 초안의 과제별 초안 /reports/cards/<uid>·보고서 검토 /reports/<숫자 id>
 * 중 ?team=이 붙은 것(목록·목차·사업 조판 같은 성과관리팀 화면은 아님)
 */
export function isPreviewUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  let u: URL;
  try {
    u = new URL(url, "http://local");
  } catch {
    return false;
  }
  if (!u.searchParams.get("team")) return false;
  return /^\/my(\/|$)/.test(u.pathname) || /^\/cards\/[^/]+$/.test(u.pathname) || /^\/reports\/cards\/[^/]+$/.test(u.pathname) || /^\/reports\/\d+$/.test(u.pathname);
}
