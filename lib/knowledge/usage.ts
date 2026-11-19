// 조각 meta.usage 값(순수 — 화면(클라이언트)·서버·스크립트가 모두 import해도 됨).
// 경평 초안 작성 방법론 자료(특강·강의): 과제원장 AI(작성지원·질문·코멘트)·과제 매칭에는 안 넣고 경평 초안(구성안·집필·블록 고치기)에만 ① 기관 공통으로 넣음 — 판정은 bundle.ts layerOf.
export const REPORT_METHOD_USAGE = "report_method";

// 외부 컨설팅 의견 조각 유형(2026-11-19 A3, parsers/consult-mg.ts): 2026-11-20 사용자 결정으로 **그 카드(meta.card_ids)의 요청에만** — 작성지원·질문·코멘트·
// 경영관리 경평 구성안·집필·블록 고치기에 공유 층이 아니라 카드별 덩이(bundle.ts buildBundle consult)로 넣고, 월간 점검·숫자·인용 대조에는 안 넣음.
// DB 읽기도 카드 단위(20261120090000 private.can_read_consult — 성과관리팀 이상 또는 그 카드를 읽을 수 있는 사람).
export const CONSULT_UNIT_TYPE = "consult_comment";
