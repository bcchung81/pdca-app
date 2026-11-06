// AI 백그라운드 작업 진행 상태(2026-11-06 — lib/ai/jobs.ts·background.ts). 서버 액션이 아닌 GET인 까닭: Next 클라이언트는 서버 액션을 한 번에 하나씩 보내고 기다려
// (07-mutating-data.md) 폴링을 서버 액션으로 하면 카드 자동 저장 같은 다른 액션이 줄을 섬. 로그인 사용자 본인의 작업만(RLS + user_id 조건 — 성과관리팀이라도 남의 작업은 안 옴).
//   GET /api/ai/requests            최근 30분 작업(머리띠 「AI 작업 N건」)
//   GET /api/ai/requests?card=<uid>  그 카드의 최근 30분 작업
//   ?ids=1,2                         창 밖(오래된) 작업도 그 id는 함께
import { getCurrentUser } from "../../../../lib/auth/dal.ts";
import { type AiJob, JOB_WINDOW_MS, type JobRow, parseIds, toAiJob } from "../../../../lib/ai/jobs.ts";
import { createClient } from "../../../../lib/supabase/server.ts";

const NO_STORE = { "Cache-Control": "no-store" };
const COLS = "id, feature, job, mode, status, error, created_at, finished_at, card:cards(uid, task_no, title), res:ai_results(ok:result->ok, message:result->>message)";

export async function GET(request: Request) {
  const me = await getCurrentUser();
  if (!me?.active) return Response.json({ error: "로그인이 필요합니다." }, { status: 401, headers: NO_STORE });
  const url = new URL(request.url);
  const ids = parseIds(url.searchParams.get("ids"));
  const uid = url.searchParams.get("card");
  const supabase = await createClient();
  const now = Date.now();
  let cardId: string | null = null;
  if (uid) {
    const { data } = await supabase.from("cards").select("id").eq("uid", uid).maybeSingle();
    if (!data) return Response.json({ now, jobs: [] }, { headers: NO_STORE });
    cardId = data.id;
  }
  const base = () => {
    const q = supabase.from("ai_requests").select(COLS).eq("user_id", me.id).not("job", "is", null);
    return cardId ? q.eq("card_id", cardId) : q;
  };
  const [recent, picked] = await Promise.all([
    base()
      .gte("created_at", new Date(now - JOB_WINDOW_MS).toISOString())
      .order("created_at", { ascending: false })
      .limit(30),
    ids.length ? base().in("id", ids) : Promise.resolve({ data: [], error: null }),
  ]);
  if (recent.error || picked.error) {
    console.error("[ai-job] 진행 상태 읽기 실패", recent.error?.message ?? picked.error?.message);
    return Response.json({ error: "AI 작업 상태를 읽지 못했습니다." }, { status: 500, headers: NO_STORE });
  }
  const rows = new Map<number, JobRow>();
  for (const r of [...(recent.data ?? []), ...(picked.data ?? [])] as JobRow[]) rows.set(Number(r.id), r);
  const jobs = [...rows.values()].map((r) => toAiJob(r, now)).filter((j): j is AiJob => j !== null);
  jobs.sort((a, b) => b.at.localeCompare(a.at));
  return Response.json({ now, jobs }, { headers: NO_STORE });
}
