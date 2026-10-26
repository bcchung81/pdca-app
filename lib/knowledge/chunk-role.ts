// 공통 지식 조각의 성격(역할) 분류(지식공급 하이브리드 선별 계획 1단계 — docs/plan/지식공급-하이브리드선별-계획.md). 순수 함수.
// unit_type(+ generic_section의 meta.usage)으로만 판정하고 doc_id는 보지 않습니다(같은 unit_type이 여러 문서에 있음).
// 규칙 문서(rule)는 기준 자체라 요약본이 대신하고, 사례류(critique·survey·prior·case)만 선별 대상이 됩니다.
// 「other」는 일부러 둡니다: 선별 방식이 모르는 종류를 빼거나 요약하지 않고 그대로 넣게 하려는 안전장치입니다(요구사항 R1 「빠짐없이」).
// 최신본 규칙은 이미 적재에서 처리돼 있어 여기서 doc_id로 거르지 않습니다 — lib/knowledge/revision-note.ts, resources/prompts/_shared/knowledge.md#rules 참고.

import { REPORT_METHOD_USAGE } from "./usage.ts";

/** 조각의 성격. 문자열 유니온(열거형 아님) */
export type ChunkRole = "rule" | "critique" | "survey" | "prior" | "case" | "method" | "evidence" | "other";

/** 규칙 문서가 대신하는 기준류 */
export const DIGEST_ROLES: readonly ChunkRole[] = ["rule"];
/** 선별 대상 사례류 */
export const SELECTABLE_ROLES: readonly ChunkRole[] = ["critique", "survey", "prior", "case"];

/** 화면·보고용 한국어 이름 */
export const ROLE_LABEL: Record<ChunkRole, string> = {
  rule: "조항·기준",
  critique: "평가위원 지적",
  survey: "실사 질문",
  prior: "전년 보고서",
  case: "유관기관 사례",
  method: "작성 방법론",
  evidence: "실적 근거",
  other: "기타",
};

/** unit_type → 성격(generic_section은 usage로 따로 봄) */
const ROLE_OF_UNIT: Record<string, ChunkRole> = {
  plan_section: "rule",
  handbook_indicator: "rule",
  checklist_group: "rule",
  task_list_row: "rule",
  pool_indicator: "rule",
  goal_indicator: "rule",
  ceo_indicator: "rule",
  ax_task: "rule",
  evaluator_comment: "critique",
  finding_row: "critique",
  corrective_action: "critique",
  qa_pair: "survey",
  qa_part: "survey",
  request_evidence: "survey",
  evidence_image: "survey",
  report_section: "prior",
  report_chapter: "prior",
  peer_case: "case",
  core_item: "evidence",
};

/** 조각의 성격. 모르는 unit_type과 usage 없는 generic_section은 other */
export function chunkRole(c: { doc_id: string; unit_type: string; meta?: Record<string, unknown> | null }): ChunkRole {
  if (c.unit_type === "generic_section") return c.meta?.usage === REPORT_METHOD_USAGE ? "method" : "other";
  return Object.hasOwn(ROLE_OF_UNIT, c.unit_type) ? ROLE_OF_UNIT[c.unit_type] : "other";
}

/** 최신·대표 조각인지. 더 최신·대표 조각이 따로 있으면(duplicate_of) 아니고, 검색 전용(search_only)도 아님 */
export function isLatest(c: { doc_id: string; meta?: Record<string, unknown> | null }): boolean {
  if (c.meta?.duplicate_of != null) return false;
  if (c.meta?.search_only === true) return false;
  return true;
}
