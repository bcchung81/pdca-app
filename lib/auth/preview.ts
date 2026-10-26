import "server-only";

import { headers } from "next/headers";
import { getCurrentUser } from "./dal.ts";
import { isPreviewUrl } from "./preview-url.ts";

export { PREVIEW_WRITE_MSG } from "./preview-url.ts";

/**
 * 이 서버 액션이 부서 화면 보기(읽기 전용)에서 왔나 — 성과관리팀·관리자일 때만(부서 담당자는 ?team=을 무시하므로 해당 없음). 쓰기 액션이 맨 앞에서 부름(개선 계획 P2-6).
 * Referer가 없으면(브라우저 정책) 막지 않음 — 권한 상승을 막는 장치가 아니라(권한은 RLS) 미리보기에서 실수로 쓰는 것을 막는 이중 장치
 */
export async function previewWriteBlocked(): Promise<boolean> {
  if (!isPreviewUrl((await headers()).get("referer"))) return false;
  const me = await getCurrentUser();
  return Boolean(me && me.role !== "dept_user");
}
