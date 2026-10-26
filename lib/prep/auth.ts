// /api/prep/run(크론·수동 호출) 인증 판정. Vercel 크론은 CRON_SECRET을 `Authorization: Bearer <값>`으로 보낸다. 입출력 없음.

import { timingSafeEqual } from "node:crypto";

/** 비밀이 비어 있으면 늘 거절(설정 실수로 열려 버리지 않게). 길이가 달라도 시간 차이로 새지 않게 같은 길이로 맞춰 비교 */
export function isPrepAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const m = /^Bearer (.+)$/.exec(header);
  if (!m) return false;
  const given = Buffer.from(m[1]);
  const want = Buffer.from(secret);
  if (given.length !== want.length) return false;
  return timingSafeEqual(given, want);
}
