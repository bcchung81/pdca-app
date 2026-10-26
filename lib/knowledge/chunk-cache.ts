// 공통 지식 조각 캐시(서버 인스턴스마다). 모든 로그인 사용자가 같은 조각을 읽고 적재할 때만 바뀌므로 5분.
// 열쇠: 트랙 id·"all"(lib/ai/context.ts loadBundleChunks), "facets"(공통 지식 화면의 유형·지표 집계).
// 2026-10-10 개선 계획 P2-2: 올리기·지우기 경로가 크기 보호 전에는 새로 읽고(fresh) 저장 뒤에는 비움 — 예전에는 연달아 올리면 낡은 조각으로 크기를 쟀음.

export const CHUNK_TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; rows: unknown[] }>();

export function cachedChunks<T>(key: string, now = Date.now()): T[] | null {
  const hit = cache.get(key);
  return hit && now - hit.at < CHUNK_TTL_MS ? (hit.rows as T[]) : null;
}

export function storeChunks(key: string, rows: unknown[], now = Date.now()): void {
  cache.set(key, { at: now, rows });
}

export function clearChunkCache(): void {
  cache.clear();
}
