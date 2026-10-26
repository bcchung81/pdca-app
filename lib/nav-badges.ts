import "server-only";

import type { CurrentUser } from "./auth/dal.ts";
import { currentPeriod } from "./cards/view.ts";
import { createClient } from "./supabase/server.ts";
import { type TrackId, DEFAULT_TRACK } from "./tracks/index.ts";

/**
 * 왼쪽 메뉴 할 일 배지(주소 → 개수). 가벼운 개수 조회만 하고, 실패하면 배지 없이 둡니다.
 *  성과관리팀: 확정 대기 작성본(과제 원장) · 보내지 않은 점검 초안(월간 점검) · 검토 대기 보고서(경평 초안) — 머리띠에서 고른 트랙의 과제·보고서만
 *  부서 담당자: 돌려받은 작성본(내 과제) · 확인할 점검(점검 결과 — 고른 트랙의 과제 점검만) · 올해 돌려받았거나 해결 안 된 코멘트가 있는 보고서(경평 초안 — 고른 트랙, 팀 단위)
 */
export async function navBadges(user: CurrentUser, track: TrackId = DEFAULT_TRACK.id): Promise<Record<string, number>> {
  const supabase = await createClient();
  const period = currentPeriod();
  const head = { count: "exact" as const, head: true };
  try {
    if (user.role === "dept_user") {
      if (!user.team) return {};
      const year = Number(period.slice(0, 4));
      const [returned, toAck, reports] = await Promise.all([
        supabase.from("card_versions").select("id, card:cards!inner(team_id)", head).eq("card.team_id", user.team.id).eq("status", "draft").not("note", "is", null),
        supabase.from("inspections").select("id, card:cards!inner(team_id, unit:eval_units!inner(track))", head).eq("card.team_id", user.team.id).eq("card.unit.track", track).eq("status", "sent"),
        // 팀당 보고서가 몇 건뿐이라 행을 읽어 코드로 셈: 돌려받음(작성 중 + 마지막 제출 뒤 검토 메모) 또는 해결 안 된 코멘트
        supabase.from("reports").select("id, status, review_note, reviewed_at, submitted_at, unit:eval_units!inner(track), report_comments(status)").eq("team_id", user.team.id).eq("year", year).eq("unit.track", track),
      ]);
      // 검토 메모는 다시 제출·제출 취소해도 남으므로 마지막 제출 뒤에 남긴 것만(부서가 스스로 제출 취소한 것은 돌려받음이 아님)
      const returnedReport = (r: { status: string; review_note: string | null; reviewed_at: string | null; submitted_at: string | null }) =>
        r.status === "drafting" && (r.review_note ?? "").trim() !== "" && Boolean(r.reviewed_at) && (!r.submitted_at || r.reviewed_at! >= r.submitted_at);
      const todo = (reports.data ?? []).filter((r) => returnedReport(r) || (r.report_comments ?? []).some((c) => c.status === "open")).length;
      return { "/my": returned.count ?? 0, "/my/inspections": toAck.count ?? 0, "/my/report": todo };
    }
    const [submitted, drafts, reports] = await Promise.all([
      supabase.from("card_versions").select("id, card:cards!inner(unit:eval_units!inner(track))", head).eq("status", "submitted").eq("card.unit.track", track),
      supabase.from("inspections").select("id, card:cards!inner(unit:eval_units!inner(track))", head).eq("period", period).eq("status", "draft").eq("card.unit.track", track),
      supabase.from("reports").select("id, unit:eval_units!inner(track)", head).eq("status", "submitted").eq("unit.track", track),
    ]);
    return { "/cards": submitted.count ?? 0, "/inspections": drafts.count ?? 0, "/reports": reports.count ?? 0 };
  } catch {
    return {};
  }
}
