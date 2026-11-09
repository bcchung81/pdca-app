/**
 * 부서 담당자의 「내 과제 자료」 고르기 — 입출력 없는 순수 로직.
 * 연결(`card_knowledge_scope`)은 AI 자동 추천이라 빠진 자료가 있을 수 있어, 기본 보기일 뿐 자료를 막지 않음(「전체 자료」로 열림).
 */

/** 연결 한 행(status가 rejected면 제외) */
export interface ScopeLink {
  chunk_key: string;
  status: string;
}

/** 거를 때 쓰는 조각 한 줄(목록·집계 공용 열) */
export interface ScopeChunk {
  chunk_key: string;
  doc_id: string;
  unit_type: string;
  business: string | null;
  seq: number;
}

/** 연결 행에서 조각 열쇠 모음 — 제외(rejected)·중복 정리 */
export function linkedChunkKeys(rows: readonly ScopeLink[]): Set<string> {
  const keys = new Set<string>();
  for (const r of rows) if (r.status !== "rejected") keys.add(r.chunk_key);
  return keys;
}

/** 내 조각 안에서 문서·유형·사업 조건으로 거르고 문서·순번 순으로 정렬(DB 목록 순서와 같음) */
export function filterMine<T extends ScopeChunk>(chunks: readonly T[], keys: ReadonlySet<string>, cond: { doc?: string; type?: string; biz?: string }): T[] {
  return chunks
    .filter((c) => keys.has(c.chunk_key) && (!cond.doc || c.doc_id === cond.doc) && (!cond.type || c.unit_type === cond.type) && (!cond.biz || c.business === cond.biz))
    .sort((a, b) => (a.doc_id < b.doc_id ? -1 : a.doc_id > b.doc_id ? 1 : a.seq - b.seq));
}
