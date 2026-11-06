// AI 백그라운드 작업 결과 읽기(ai_results — 요청한 본인만·만료 7일 전만, RLS). 진행 상태는 app/api/ai/requests.
//   GET /api/ai/results?ids=1,2                                   그 작업들의 결과
//   GET /api/ai/results?card=<uid>&feature=card_assist,card_chat  그 카드의 최근 결과(과제원장 AI 작성지원 대화를 다른 PC·닫은 탭에서 다시 채움 — 12건)
import { getCurrentUser } from "../../../../lib/auth/dal.ts";
import { ASSIST_KEEP } from "../../../../lib/ai/assist-thread.ts";
import { JOB_KINDS, type JobOutcome, type JobResultRow, parseIds } from "../../../../lib/ai/jobs.ts";
import { createClient } from "../../../../lib/supabase/server.ts";

const NO_STORE = { "Cache-Control": "no-store" };
const FEATURES = new Set<string>(Object.values(JOB_KINDS).map((k) => k.feature));

export async function GET(request: Request) {
  const me = await getCurrentUser();
  if (!me?.active) return Response.json({ error: "로그인이 필요합니다." }, { status: 401, headers: NO_STORE });
  const url = new URL(request.url);
  const ids = parseIds(url.searchParams.get("ids"), 20);
  const uid = url.searchParams.get("card");
  const features = String(url.searchParams.get("feature") ?? "")
    .split(",")
    .filter((f) => FEATURES.has(f));
  if (!ids.length && !uid) return Response.json({ error: "ids 또는 card가 필요합니다." }, { status: 400, headers: NO_STORE });
  const supabase = await createClient();
  let q = supabase.from("ai_results").select("request_id, feature, created_at, result").eq("user_id", me.id);
  if (ids.length) q = q.in("request_id", ids);
  if (uid) {
    const { data: card } = await supabase.from("cards").select("id").eq("uid", uid).maybeSingle();
    if (!card) return Response.json({ results: [] }, { headers: NO_STORE });
    q = q.eq("card_id", card.id);
  }
  if (features.length) q = q.in("feature", features);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(ids.length || ASSIST_KEEP);
  if (error) {
    console.error("[ai-job] 결과 읽기 실패", error.message);
    return Response.json({ error: "AI 결과를 읽지 못했습니다." }, { status: 500, headers: NO_STORE });
  }
  const results: JobResultRow[] = (data ?? []).map((r: { request_id: number; feature: string; created_at: string; result: JobOutcome }) => ({ requestId: Number(r.request_id), feature: r.feature, at: r.created_at, result: r.result }));
  return Response.json({ results }, { headers: NO_STORE });
}
