import { requireAtLeast } from "../../../../lib/auth/dal.ts";
import { listCards } from "../../../../lib/cards/queries.ts";
import { versionLabel, versionStates } from "../../../../lib/cards/versions.ts";
import { currentPeriod } from "../../../../lib/cards/view.ts";
import { csvResponse } from "../../../../lib/csv.ts";
import { getTrack } from "../../../../lib/tracks/current.ts";
import { fmtDate, monthLabel } from "../../../../lib/format.ts";
import { createClient } from "../../../../lib/supabase/server.ts";

/** 과제 원장 목록 내려받기(CSV) — 성과관리팀·관리자 */
export async function GET() {
  const me = await requireAtLeast("pmo", "/cards");
  if (!me) return new Response("성과관리팀·관리자만 내려받을 수 있습니다.", { status: 403 });
  const period = currentPeriod();
  const supabase = await createClient();
  const track = await getTrack();
  const [rows, versions] = await Promise.all([listCards({ track }), versionStates(supabase, period)]);
  const header = ["과제번호", "대상사업", "과제명", "본부", "부서", "담당자", "과제구분", `${monthLabel(period)} 작성본`, "AI 컨설팅(최종 점검)", "고정 영역", "수정일자"];
  const body = rows.map((r) => [
    r.taskNo,
    r.business,
    r.title,
    r.department,
    r.team ?? "",
    r.person,
    r.kind ?? "",
    versionLabel(versions.get(r.id)) ?? "",
    r.inspection?.title ?? "",
    r.fixedLocked ? "확정" : "",
    fmtDate(r.updatedAt),
  ]);
  return csvResponse(`과제원장${track === "경영관리" ? "_경영관리" : ""}_${period}.csv`, [header, ...body]);
}
