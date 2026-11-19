// 조각 meta.usage 값(순수 — 화면(클라이언트)·서버·스크립트가 모두 import해도 됨).
// 경평 초안 작성 방법론 자료(특강·강의): 과제원장 AI(작성지원·질문·코멘트)·과제 매칭에는 안 넣고 경평 초안(구성안·집필·블록 고치기)에만 ① 기관 공통으로 넣음 — 판정은 bundle.ts layerOf.
export const REPORT_METHOD_USAGE = "report_method";

// 외부 컨설팅 의견 조각 유형(2026-11-19 A3, parsers/consult-mg.ts): 과제원장 AI(작성지원·질문·코멘트)와 경평 구성안에만 ③ 이 지표 공통으로 넣고,
// 경평 집필·블록 고치기·월간 점검·숫자·인용 대조에는 안 넣음 — 판정은 bundle.ts layerOf·relevantRefs·bundleRefs.
export const CONSULT_UNIT_TYPE = "consult_comment";
