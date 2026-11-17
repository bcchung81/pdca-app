// 지금 고른 트랙(머리띠 전환, 쿠키 `pdca_track`)을 서버에서 읽습니다. 권한이 아니라 보기 선택이라 데이터 접근은 늘 RLS가 정함.
// 트랙을 따르는 화면(과제 원장·내 과제·내려받기)은 이 값으로 카드를 거르고, 경영관리가 아직 지원하지 않는 화면은 「준비 중」 안내를 그림(components/shell/track-gate.tsx).
// 부서 담당자가 한 트랙의 과제만 볼 수 있으면(트랙 전환이 숨겨짐) 고른 값과 상관없이 그 트랙(resolveTrack, 2026-11-17).

import { cookies } from "next/headers";
import { cache } from "react";
import { getCurrentUser } from "../auth/dal.ts";
import { createClient } from "../supabase/server.ts";
import { TRACK_COOKIE, type TrackId, resolveTrack, trackOfUnit } from "./index.ts";

/** 부서 담당자가 볼 수 있는(지정된) 활성 카드의 트랙 — RLS로 셈, 요청마다 한 번. 성과관리팀·관리자는 모든 카드를 보므로(두 트랙) 조회하지 않음 */
const deptTracks = cache(async (): Promise<Set<TrackId>> => {
  const user = await getCurrentUser();
  if (user?.role !== "dept_user") return new Set();
  const supabase = await createClient();
  const { data } = await supabase.from("cards").select("eval_unit_id").eq("status", "active");
  return new Set((data ?? []).map((c) => trackOfUnit(c.eval_unit_id)));
});

export async function getTrack(): Promise<TrackId> {
  return resolveTrack((await cookies()).get(TRACK_COOKIE)?.value, await deptTracks());
}
