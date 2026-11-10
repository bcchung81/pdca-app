// 캡처용 시험 데이터(순수 — DB·브라우저 없음): 매뉴얼 그림 7의 「보낸 점검표」. 실행기(shots.mjs)가 서비스 키로 넣고 끝에 지웁니다.
// 글은 모두 가상의 일반 문장(실명·실제 수치·기관 자료 인용 없음)이고, 양식·빈 점검표·집계는 lib/inspections/model.ts 함수로 만듭니다(손으로 숫자를 넣지 않음).
import { CASE_NO_SOURCE, MGMT_FORM_ID, cleanResult, emptyResult, inspectionSummary } from "../../lib/inspections/model.ts";

const SAMPLE_SOURCE = "점검 기준(예시)";
/** 미흡으로 둘 행(경영관리 양식 mgmt13): 표·번호 → 칸 글. 나머지 행은 모두 충족 */
const WEAK = [
  { table: "axes", no: 2, fix: "AI 도입 효과 지표의 산식·기준값 명시 필요", quote: "목표·실적·달성률과 그 원인을 한 묶음으로 적는다(예시)", card: "'정량 성과' — 목표 대비 달성률이 없음(예시)" },
  { table: "patterns", no: 5, question: "이용률이 오른 것이 대상 수가 줄어서는 아닌지 설명할 수 있습니까?(예시)", fix: "실적 수치 옆에 산식과 모수를 함께 적기", quote: "비율 실적은 분모와 산식을 함께 밝힌다(예시)", card: "'정량 성과' — 산식·모수가 없음(예시)" },
  { table: "coherence", no: 1, fix: "계량지표 칸의 전년 실적에 단위를 함께 적기", quote: "지표명(단위)·전년 실적·올해 목표를 단위와 함께 적는다(예시)", card: "'계량지표' — 전년 실적의 단위가 빠짐(예시)" },
];

/** 가상 점검표(경영관리 양식): 대부분 충족, 3행만 미흡 + 보완방안, 총평 3칸, 자가진단 체크리스트 2행. 저장 전 정리(cleanResult)를 거친 값 */
export function sampleInspectionResult() {
  const r = emptyResult(MGMT_FORM_ID);
  for (const t of ["axes", "patterns", "coherence"]) r[t] = r[t].map((row) => ({ ...row, judgment: "충족" }));
  for (const w of WEAK) {
    r[w.table][w.no - 1] = { ...r[w.table][w.no - 1], judgment: "미흡", question: w.question ?? "", fix: w.fix, evidence: [{ source: SAMPLE_SOURCE, quote: w.quote, key: null, verified: null }], card: w.card };
  }
  r.overview = {
    status: "(예시) 추진내용과 월별 실적은 대체로 정리돼 있으나, 일부 지표의 산식·기준값과 단위가 빠져 있습니다.",
    direction: "★ AI 도입 효과 지표의 산식·기준값 명시 필요\n★ 비율 실적에 모수·산식을 함께 적어 수치 해석의 오해 줄이기",
    case: CASE_NO_SOURCE,
  };
  r.checklist = {
    sub: "혁신노력(예시)",
    rows: [
      { label: "지적 1", point: "AI 활용 성과를 계량 지표로 보였는가(예시)", result: "부분", task: "13-4", note: "보완: 정량 성과 칸에 산식 추가(예시)" },
      { label: "①-1", point: "추진 체계와 역할이 분명한가(예시)", result: "예", task: "13-4", note: "추진내용 첫 줄(예시)" },
    ],
    others: 0,
  };
  return cleanResult(r, MGMT_FORM_ID);
}

/** inspections 행의 내용 열(카드·기간·상태·작성자는 실행기가 붙임): 결과 + 목록용 판정 요약(파생 값 — 서버 액션과 같은 모양) */
export function inspectionRow(result = sampleInspectionResult()) {
  return { result: { ...result, summary: inspectionSummary(result) }, model: "manual", knowledge_keys: [], card_version_id: null };
}
