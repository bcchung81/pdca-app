// 공통 지식 조각 캐시(서버 인스턴스마다 — 그 인스턴스의 모든 요청이 함께 씀). 적재할 때만 바뀌므로 5분.
// 열쇠: 트랙 id·"all"(lib/ai/context.ts loadBundleChunks), "facets"(공통 지식 화면의 유형·지표 집계).
// 2026-10-10 개선 계획 P2-2: 올리기·지우기 경로가 크기 보호 전에는 새로 읽고(fresh) 저장 뒤에는 비움 — 예전에는 연달아 올리면 낡은 조각으로 크기를 쟀음.
// 2026-11-10(T3 리뷰 T4-R1): 공통 지식은 구성원(성과관리팀·관리자, 팀이 지정된 활성 사용자 — DB private.is_member())만 읽음. 구성원은 모두 같은 조각을 읽지만
// 비구성원(팀 없는 부서 담당자·사용 중지 직후 토큰)은 RLS로 0행을 오류 없이 받음 → 빈 배열은 넣지 않음(그 결과로 5분간 모든 사람의 집계가 비지 않게).
// 부르는 쪽도 구성원일 때만 읽고 채움(공통 지식 화면은 isKnowledgeMember로 가림, loadBundleChunks는 카드를 읽을 수 있는 경로·관리자 화면·서비스 키 스크립트만 부름).

export const CHUNK_TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; rows: unknown[] }>();

export function cachedChunks<T>(key: string, now = Date.now()): T[] | null {
  const hit = cache.get(key);
  return hit && now - hit.at < CHUNK_TTL_MS ? (hit.rows as T[]) : null;
}

/** 조각을 캐시에 둠 — 빈 배열은 두지 않음(비구성원의 RLS 빈 결과·아직 적재 전). 이미 있는 값도 빈 배열로 덮지 않음 */
export function storeChunks(key: string, rows: unknown[], now = Date.now()): void {
  if (!rows.length) return;
  cache.set(key, { at: now, rows });
}

export function clearChunkCache(): void {
  cache.clear();
}
