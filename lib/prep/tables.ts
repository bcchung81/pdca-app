// 백그라운드 처리기가 비밀 키(RLS 우회)로 만질 수 있는 표의 한정 목록(docs/reference-materials.md §8, 결정 D13).
// 처리기는 로그인 사용자 없이 돌기 때문에 쓸 수 있는 표를 매칭·준비물 표로 좁히고, 그 밖의 표는 읽기만 한다. 입출력 없음.

/** 처리기가 쓸 수 있는 표 — 3-5 재정의(2026-09-30)로 report_material_cards(자료의 과제는 사람이 고름)는 뺌, card_context_manifest 표는 정리 마이그레이션으로 삭제 */
export const PREP_WRITE_TABLES = ["prep_jobs", "card_knowledge_scope", "ai_requests"] as const;

/** 처리기가 읽기만 하는 표(매칭·목록표의 입력) */
export const PREP_READ_ONLY_TABLES = ["cards", "card_materials", "report_materials", "reports", "knowledge_documents", "knowledge_chunks", "task_map"] as const;

export type PrepMode = "read" | "write";

/** 한정 목록 밖의 표, 또는 읽기 전용 표에 대한 쓰기 요청이면 던진다 */
export function assertPrepTable(name: string, mode: PrepMode): void {
  const writable = (PREP_WRITE_TABLES as readonly string[]).includes(name);
  const readable = writable || (PREP_READ_ONLY_TABLES as readonly string[]).includes(name);
  if (!readable) throw new Error(`처리기가 쓸 수 없는 표입니다: ${name}`);
  if (mode === "write" && !writable) throw new Error(`처리기는 이 표를 읽기만 합니다: ${name}`);
}
