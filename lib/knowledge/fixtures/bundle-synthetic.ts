// 공통 지식 묶음 시험용 합성 조각(기관 실명·원문 아님)과 합성 프롬프트 묶음.
// bundle-baseline.json은 선별 방식(lib/knowledge/select.ts)을 더하기 전 코드로 만든 출력이고, select.test.ts가 「선별 없는 묶음은 바이트까지 그대로」를 이것으로 확인합니다.
// 프롬프트 파일 문구가 바뀌어도 이 기대값이 흔들리지 않게 kb.* 절은 합성 글로 둡니다.

import type { PromptSet } from "../../prompts/template.ts";
import type { BundleChunk } from "../bundle.ts";

const c = (over: Partial<BundleChunk> & { chunk_key: string }): BundleChunk => ({
  doc_id: "plan-2607",
  seq: 0,
  unit_type: "plan_section",
  track: "주요사업",
  business: null,
  title: `제목 ${over.chunk_key}`,
  text: `글 ${over.chunk_key}`,
  context_prefix: null,
  meta: null,
  ...over,
});

/** 같은 위치 앞부분이 4번 이상 되풀이돼 약칭표가 생기게(compact.ts) */
const WHERE = "합성 평가보고서 사업 의견 첫째 묶음";
const LONG_COMMENT = "평가위원은 성과지표의 목표 설정 근거가 부족하고 전년 대비 개선 정도를 객관적으로 보이기 어렵다고 지적하였으며 산출 지표 중심에서 결과 지표 중심으로 바꾸라고 권고하였다 이에 따라 보완이 필요하다 또한 성과 확산 계획과 지속성 확보 방안이 구체적이지 않아 다음 연도 계획에 반영할 것을 요청하였다 아울러 수혜자 만족도 조사 결과를 성과 해석에 연결하고 외부 전문가 검증 절차를 거치도록 권고하였다";

export const SYN_CHUNKS: BundleChunk[] = [
  // 기준류(rule)
  c({ chunk_key: "plan-2607/narr/I/1", seq: 1, text: "관리계획 서술 하나" }),
  c({ chunk_key: "plan-2607/narr/II/1", seq: 2, text: "관리계획 서술 둘" }),
  c({ chunk_key: "plan-2607/handbook26/BZ-1/k1", seq: 3, unit_type: "handbook_indicator", business: "BZ-1", context_prefix: "'26 편람 · 주요사업1", text: "편람 지표 정의와 배점" }),
  c({ chunk_key: "plan-2607/handbook26/BZ-2/k1", seq: 4, unit_type: "handbook_indicator", business: "BZ-2", text: "다른 사업 편람" }),
  c({ chunk_key: "plan-2607/handbook26/BZ-4", seq: 5, unit_type: "handbook_indicator", business: "BZ-4", text: "공통지표 편람" }),
  c({ chunk_key: "goal30-2605/1", doc_id: "goal30-2605", unit_type: "goal_indicator", text: "중장기 목표지표 하나" }),
  c({ chunk_key: "pool25-biz/BZ-1/1", doc_id: "pool25-biz", unit_type: "pool_indicator", business: "BZ-1", text: "성과지표 Pool 하나" }),
  c({ chunk_key: "plan/task/1-1", unit_type: "task_list_row", business: "BZ-1", seq: 9, text: "과제 목록 행 1-1" }),
  // 사례류(critique·survey·prior·case)
  c({ chunk_key: "plan-2607/eval25/BZ-1/e1/p01", seq: 20, unit_type: "evaluator_comment", business: "BZ-1", context_prefix: `${WHERE} · 1`, text: LONG_COMMENT }),
  c({ chunk_key: "plan-2607/eval25/BZ-1/e1/p02", seq: 21, unit_type: "evaluator_comment", business: "BZ-1", context_prefix: `${WHERE} · 2`, text: "안테나 판독 확산 실적을 정량으로 제시할 것" }),
  c({ chunk_key: "plan-2607/eval25/BZ-1/e2/p01", seq: 22, unit_type: "evaluator_comment", business: "BZ-1", context_prefix: `${WHERE} · 3`, text: "선박 안전 관리 체계 보완" }),
  c({ chunk_key: "plan-2607/eval25/BZ-1/e2/p02", seq: 23, unit_type: "evaluator_comment", business: "BZ-1", context_prefix: `${WHERE} · 4`, text: "도서 통신품질 측정 범위 확대" }),
  c({ chunk_key: "mid25-biz/BZ-1/r1", doc_id: "mid25-biz", seq: 1, unit_type: "finding_row", business: "BZ-1", text: LONG_COMMENT }),
  c({ chunk_key: "att3-2604/qa/BZ-1/1", doc_id: "att3-2604", seq: 5, unit_type: "qa_pair", business: "BZ-1", text: "안테나 자동판독 질의와 답" }),
  c({ chunk_key: "att3-2604/qa/BZ-1/2", doc_id: "att3-2604", seq: 6, unit_type: "qa_pair", business: "BZ-1", text: "통신품질 측정 질의와 답" }),
  c({ chunk_key: "att3-2604/qa/BZ-2/1", doc_id: "att3-2604", seq: 7, unit_type: "qa_pair", business: "BZ-2", text: "다른 사업 질의" }),
  c({ chunk_key: "att3-2604/qa/bonus/1", doc_id: "att3-2604", seq: 8, unit_type: "qa_pair", business: null, track: "가점", text: "가점 질의" }),
  c({ chunk_key: "att3-2604/BZ-4/Q1", doc_id: "att3-2604", seq: 10, unit_type: "qa_pair", business: "BZ-4", meta: { metric_2025: "전파품질 조기 안정화 기여도" }, text: "공통지표 질의" }),
  c({ chunk_key: "rpt25-biz/BZ-1/a", doc_id: "rpt25-biz", seq: 1, unit_type: "report_section", business: "BZ-1", title: "2025 보고서 1-1 가. 안테나 판독", text: "AI 안테나 자동판독 전국 확산 120건" }),
  c({ chunk_key: "rpt25-biz/BZ-1/b", doc_id: "rpt25-biz", seq: 2, unit_type: "report_section", business: "BZ-1", title: "2025 보고서 1-2 나. 도서 통신품질", text: "도서 지역 통신품질 측정 35곳" }),
  c({ chunk_key: "peer25-biz/b0-radio", doc_id: "peer25-biz", seq: 1, unit_type: "peer_case", title: "붙임2 · 기관가 — 전파 안테나 판독(B0)", text: "안테나 판독 자동화", meta: { grade: "B0" } }),
  c({ chunk_key: "peer25-biz/bplus-ship", doc_id: "peer25-biz", seq: 0, unit_type: "peer_case", title: "붙임2 · 기관나 — 선박 안전(B+)", text: "선박 탑승 예측", meta: { grade: "B+" } }),
  c({ chunk_key: "peer25-biz/c", doc_id: "peer25-biz", seq: 2, unit_type: "peer_case", meta: { grade: "C" } }),
  // 그 밖(method·evidence·other)
  c({ chunk_key: "up-m/1", doc_id: "up-m", unit_type: "generic_section", meta: { generic: true, usage: "report_method" }, text: "작성 방법론 한 쪽" }),
  c({ chunk_key: "up-x/1", doc_id: "up-x", unit_type: "generic_section", meta: { generic: true }, text: "일반 문서 한 쪽" }),
  c({ chunk_key: "up-x/2", doc_id: "up-x", unit_type: "generic_section", meta: { search_only: true }, text: "검색 전용" }),
  // 경영관리
  c({ chunk_key: "mg/plan/inst", doc_id: "plan-2607", seq: 30, track: "경영관리", text: "경영관리 공통 서술" }),
  c({ chunk_key: "mg/handbook/MG-3", doc_id: "plan-2607", seq: 31, unit_type: "handbook_indicator", track: "경영관리", business: "MG-3", text: "지표3 편람" }),
  c({ chunk_key: "mg/eval/MG-3/1", doc_id: "plan-2607", seq: 32, unit_type: "evaluator_comment", track: "경영관리", business: "MG-3", text: "지표3 평가위원 의견" }),
  c({ chunk_key: "mg/core/MG-3", doc_id: "core-mg", seq: 1, unit_type: "core_item", track: "경영관리", business: "MG-3", text: "지표3 핵심공통항목 실적 표" }),
  c({ chunk_key: "rpt25-mg-03/1", doc_id: "rpt25-mg-03", seq: 1, unit_type: "report_chapter", track: "경영관리", business: "MG-3", text: "지표3 전년 보고서 장" }),
  c({ chunk_key: "mg/eval/MG-4/1", doc_id: "plan-2607", seq: 33, unit_type: "evaluator_comment", track: "경영관리", business: "MG-4", text: "지표4 평가위원 의견" }),
];

export const SYN_BIZ_CARD = { evalUnitId: "BZ-1", data: { title: "AI 안테나 자동판독 확산", executionTask: "" } };
export const SYN_BIZ_LINKED = ["att3-2604/qa/BZ-1/1", "plan-2607/eval25/BZ-1/e1/p02", "att3-2604/qa/BZ-2/1"];
export const SYN_MG_CARD = { evalUnitId: "MG-G1", knowledgeUnit: "MG-3", data: { title: "경영관리 과제", executionTask: "" } };
export const SYN_MG_LINKED = ["mg/eval/MG-3/1"];

/** 합성 kb.* 절(지금 절 이름과 자리표시 그대로) */
export const SYN_PROMPTS: PromptSet = {
  feature: "synthetic",
  version: "synthetic@00000000",
  system: {},
  schema: {},
  request: {
    "kb.institution": "[① {{count}}건]",
    "kb.common": "[② {{count}}건]",
    "kb.business": "[③ {{business}} {{count}}건]",
    "kb.list": "[목록] 해당: {{relevant}} / 사례: {{peers}} / 전년: {{prior}} / 닮은 {{similarMax}}: {{similar}}",
    "kb.taskRow": "[과제 행]",
    "kb.none": "없음",
  },
};
