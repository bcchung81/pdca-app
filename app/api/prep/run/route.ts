// 작업 대기열을 비우는 안전망 — 크론(Authorization: Bearer CRON_SECRET)이나 수동 호출이 부른다.
// 평소에는 서버 액션 뒤 after()가 처리하므로(lib/prep/enqueue.ts) 이 라우트는 놓친 작업을 거두는 용도.
// 크론 설정(vercel.json)은 공식 문서(요금제별 주기 제한 포함) 확인 뒤 docs/ops/운영-전환.md에서 — 이 파일은 설정 없이도 안전하다(비밀이 없으면 늘 401).
import { isPrepAuthorized } from "../../../../lib/prep/auth.ts";
import { PREP_HANDLERS } from "../../../../lib/prep/handlers/index.ts";
import { ALL_PREP_KINDS } from "../../../../lib/prep/policy.ts";
import { drainPrepJobs } from "../../../../lib/prep/run.ts";
import { prepStore } from "../../../../lib/prep/store.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BUDGET_MS = 240_000;

export async function GET(request: Request) {
  if (!isPrepAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) return new Response("unauthorized", { status: 401 });
  try {
    const result = await drainPrepJobs({ store: prepStore(), handlers: PREP_HANDLERS, kinds: [...ALL_PREP_KINDS], budgetMs: BUDGET_MS });
    return Response.json(result);
  } catch (e) {
    console.error("[prep] 라우트 처리 실패", e);
    return Response.json({ error: "처리하지 못했습니다" }, { status: 500 });
  }
}
