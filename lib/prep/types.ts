// 참고자료 3단계(과제 대응표·매칭 작업)의 공통 타입. 입출력 없음.

/** 작업 종류 — 처리기가 있는 것은 공통 지식 매칭뿐(3-5 재정의 뒤 정리 마이그레이션 `20260930110000_prep_cleanup.sql`로 DB 값 검사도 이것만 허용) */
export type PrepKind = "match_knowledge";
export type PrepJobStatus = "queued" | "running" | "done" | "failed";

/** prep_jobs 행(처리기가 읽는 모양) */
export interface PrepJob {
  id: number;
  kind: PrepKind;
  target: string;
  payload: Record<string, unknown>;
  status: PrepJobStatus;
  attempts: number;
  requested_by: string | null;
}

/** 등록할 새 작업 */
export interface NewJob {
  kind: PrepKind;
  target: string;
  payload?: Record<string, unknown>;
}

/** 과제 대응표 상태 — 표시·순서에는 auto·confirmed만 쓰고, candidate는 /links에서 확정을 기다림 */
export type ScopeStatus = "auto" | "candidate" | "confirmed" | "rejected";
/** 누가 제안했나(결정은 status) */
export type ScopeMethod = "rule" | "ai" | "human";

/** card_knowledge_scope 행 */
export interface ScopeRow {
  card_id: string;
  chunk_key: string;
  status: ScopeStatus;
  method: ScopeMethod;
  score: number | null;
  rank: number | null;
  basis: string | null;
  meta?: Record<string, unknown>;
}

/** 규칙·AI 매칭이 내놓은 「이 과제에 해당」 한 건 */
export interface ScopeHit {
  chunkKey: string;
  score?: number;
  rank?: number;
  basis: string;
  status?: "auto" | "candidate";
}
