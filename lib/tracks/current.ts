// 지금 고른 트랙(머리띠 전환, 쿠키 `pdca_track`)을 서버에서 읽습니다. 권한이 아니라 보기 선택이라 데이터 접근은 늘 RLS가 정함.
// 트랙을 따르는 화면(과제 원장·내 과제·내려받기)은 이 값으로 카드를 거르고, 경영관리가 아직 지원하지 않는 화면은 「준비 중」 안내를 그림(components/shell/track-gate.tsx).

import { cookies } from "next/headers";
import { TRACK_COOKIE, type TrackId, parseTrack } from "./index.ts";

export async function getTrack(): Promise<TrackId> {
  return parseTrack((await cookies()).get(TRACK_COOKIE)?.value);
}
