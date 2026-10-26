import type { NextRequest } from "next/server";
import { requireAtLeast } from "../../../../../lib/auth/dal.ts";
import { listCards } from "../../../../../lib/cards/queries.ts";
import { currentPeriod } from "../../../../../lib/cards/view.ts";
import { isPeriod } from "../../../../../lib/format.ts";
import { readResult } from "../../../../../lib/inspections/model.ts";
import { inspectionsForPeriod } from "../../../../../lib/inspections/queries.ts";
import { type SummaryInput, summarize, summaryMarkdown } from "../../../../../lib/inspections/summary.ts";
import { createClient } from "../../../../../lib/supabase/server.ts";
import { getTrack } from "../../../../../lib/tracks/current.ts";
import { TRACK_SPECS } from "../../../../../lib/tracks/index.ts";

/** 월간 점검 취합 결과보고서 내려받기(.md, ?period=YYYY-MM) — 성과관리팀·관리자. 화면과 같은 집계(머리띠에서 고른 트랙의 과제) */
export async function GET(request: NextRequest) {
  const me = await requireAtLeast("pmo", "/inspections/summary");
  if (!me) return new Response("성과관리팀·관리자만 내려받을 수 있습니다.", { status: 403 });
  const raw = request.nextUrl.searchParams.get("period") ?? "";
  const period = isPeriod(raw) ? raw : currentPeriod();
  const supabase = await createClient();
  const track = await getTrack();
  const [rows, inspections] = await Promise.all([listCards({ track }), inspectionsForPeriod(supabase, period)]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const list: SummaryInput[] = [...inspections.values()].flatMap((ins) => {
    const c = byId.get(ins.cardId);
    return c ? [{ card: { taskNo: c.taskNo, title: c.title, business: c.business, department: c.department, team: c.team }, status: ins.status, result: readResult(ins.result) }] : [];
  });
  const md = summaryMarkdown(period, summarize(list, TRACK_SPECS[track].inspectionForm));
  return new Response(md, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="inspection-summary.md"; filename*=UTF-8''${encodeURIComponent(`월간점검_취합보고_${period}.md`)}`,
      "cache-control": "no-store",
    },
  });
}
