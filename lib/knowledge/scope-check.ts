// 적재 「규칙 범위 검산」(참고자료 설계 2단계 — docs/reference-materials.md §4.1).
// AI에 주는 규칙 범위(lib/knowledge/bundle.ts의 layerOf·buildBundle)가 실제로 채워지는지, 적재 결과만으로 미리 확인합니다.
// 이번 적재에 어떤 문서가 아예 없으면(일부 문서만 적재) 그 문서를 쓰는 검산 항목은 건너뜁니다(거짓 실패 방지).

import { LENS_CRITERIA_KEYS } from "../reports/lens.ts";
import type { BusinessId, Check, KnowledgeChunk } from "./types.ts";

/** 주요사업 3개(공통지표 BZ-4는 검산 대상 아님 — 규칙 범위상 사업 구분이 없음) */
const BUSINESSES: BusinessId[] = ["BZ-1", "BZ-2", "BZ-3"];

/** 사업마다 최소 1개씩 있어야 하는 (문서, 단위 유형) — 규칙 범위 층 ③(이 사업 공통)의 근거 종류 */
const REQUIRED_BUSINESS_UNITS: Array<{ doc: string; unitType: KnowledgeChunk["unit_type"] }> = [
  { doc: "plan-2607", unitType: "evaluator_comment" },
  { doc: "mid25-biz", unitType: "finding_row" },
  { doc: "att3-2604", unitType: "qa_pair" },
  { doc: "rpt25-biz", unitType: "report_section" },
  { doc: "pool25-biz", unitType: "pool_indicator" },
  { doc: "plan-2607", unitType: "handbook_indicator" },
  { doc: "plan-2607", unitType: "task_list_row" },
];

/**
 * 적재된 조각(chunks, 문서 무관)에서 규칙 범위 검산 항목을 만듭니다.
 * chunks에 특정 문서(doc_id)가 하나도 없으면 그 문서를 쓰는 항목은 건너뜁니다(부분 적재 지원).
 */
export function ruleScopeChecks(chunks: KnowledgeChunk[]): Check[] {
  const checks: Check[] = [];
  const docsPresent = new Set(chunks.map((c) => c.doc_id));
  const byDoc = (doc: string) => chunks.filter((c) => c.doc_id === doc);

  // 1) 평가 기준 고정 키(lib/reports/lens.ts LENS_CRITERIA_KEYS) 전부 있어야 함
  if (docsPresent.has("plan-2607")) {
    const keys = new Set(byDoc("plan-2607").map((c) => c.chunk_key));
    const missing = LENS_CRITERIA_KEYS.filter((k) => !keys.has(k));
    checks.push({
      name: "[scope] 평가 기준 고정 키(LENS_CRITERIA_KEYS) 전부 있음",
      level: "error",
      ok: missing.length === 0,
      expected: `${LENS_CRITERIA_KEYS.length}개 모두`,
      actual: missing.length ? `빠짐: ${missing.join(", ")}` : "모두 있음",
    });
  }

  // 2) 주요사업 BZ-1~3마다 단위 유형 최소 1개(규칙 범위 층 ③의 근거 종류가 실제로 채워지는지)
  for (const { doc, unitType } of REQUIRED_BUSINESS_UNITS) {
    if (!docsPresent.has(doc)) continue;
    const rows = byDoc(doc).filter((c) => c.unit_type === unitType);
    for (const biz of BUSINESSES) {
      const count = rows.filter((c) => c.business === biz).length;
      checks.push({
        name: `[scope] ${biz} ${unitType}(${doc}) 최소 1개`,
        level: "error",
        ok: count >= 1,
        expected: "1개 이상",
        actual: count,
      });
    }
  }

  // 3) 관리계획 서술 plan_section(track 주요사업) 1개 이상
  if (docsPresent.has("plan-2607")) {
    const count = byDoc("plan-2607").filter((c) => c.unit_type === "plan_section" && c.track === "주요사업").length;
    checks.push({
      name: "[scope] 관리계획 서술(plan_section, 주요사업) 1개 이상",
      level: "error",
      ok: count >= 1,
      expected: "1개 이상",
      actual: count,
    });
  }

  // 3) 실사(att3-2604) 사업 미지정(business null) 1개 이상 — 규칙 범위 층 ②(공통지표·사업 미지정)의 근거
  if (docsPresent.has("att3-2604")) {
    const count = byDoc("att3-2604").filter((c) => c.business == null).length;
    checks.push({
      name: "[scope] 실사(att3-2604) 사업 미지정 1개 이상",
      level: "error",
      ok: count >= 1,
      expected: "1개 이상",
      actual: count,
    });
  }

  // 4) 공통지표(BZ-4)의 실사 질의응답·요청 자료·지적 행·증빙 그림·평가위원 의견(총평 제외)·시정조치 계획은 소속 사업(meta.related_business)이 있어야 함 —
  // 새 지표 이름이 지표 사전(dictionaries.ts METRICS_2025)에 없으면 파서가 조용히 null로 두는데, 그러면 요청 때 모든 과제에 들어가거나 다른 사업 지표와 구분되지 않음
  const owned = chunks.filter((c) => c.business === "BZ-4" && ["qa_pair", "qa_part", "request_evidence", "finding_row", "evidence_image", "evaluator_comment", "corrective_action"].includes(c.unit_type) && !c.chunk_key.includes("/BZ-4/total/"));
  if (owned.length) {
    const missing = owned.filter((c) => !BUSINESSES.includes(String(c.meta?.related_business ?? "") as BusinessId)).map((c) => c.chunk_key);
    checks.push({
      name: "[scope] 공통지표(BZ-4) 실사·지적·증빙·평가위원 의견·시정조치 계획 조각은 소속 사업(related_business)이 있음",
      level: "error",
      ok: missing.length === 0,
      expected: "모두 있음(없으면 지표 사전 METRICS_2025에 새 지표를 더할 것)",
      actual: missing.length ? missing : "모두 있음",
    });
  }

  return checks;
}
