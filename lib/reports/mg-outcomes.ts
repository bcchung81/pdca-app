// 경영관리 절 성과 재료 잇기(순수 잎 모듈 — import 없음, 2026-10-29). mg-close.ts(추진성과 보강)와 mg-outline.ts(구성안 점검·요청)가 함께 씀.
// mg-outline → mg-close → business-layout → mg-page-plan → mg-outline 고리가 생겨 개발 서버(Turbopack)에서 초기화 전 상수 읽기 오류가 났음 — 여기에는 다른 모듈을 import하지 않음(mg-outcomes.test.ts가 지킴).

/** 닫는 성과 행의 라벨 */
export const CLOSE_LABEL = "추진성과";

/** 글자·숫자만 남긴 글(재료 ↔ 원장 줄 잇기 — 띄어쓰기·괄호·따옴표 차이를 무시) */
const squash = (s: string) => s.replace(/[^0-9A-Za-z가-힣]/g, "");
/** 원장 줄 안에 든 재료 조각으로 잇는 최소 글자 수(짧은 조각 「31건」이 여러 줄에 걸리는 것을 막음) */
const LINK_MIN = 8;

/**
 * 구성안 재료 → 그 재료가 가리키는 원장 성과 줄 번호(lines 순번). 재료 글이나 원문 구절(quote)이 원장 줄을 통째로 담거나, 8자 이상인 재료 글·구절이 원장 줄 안에 들면 이음
 * (구성안 요청이 「절 성과 재료」 줄을 원문 구절로 그대로 옮기게 함 — report-outline-mg/request.md outcomes.head). 자료 필요 재료는 잇지 않음
 */
export function outcomeRefs(materials: ReadonlyArray<{ id: string; kind: string; text: string; quote: string }>, lines: readonly string[]): Map<string, number[]> {
  const keys = lines.map(squash);
  const out = new Map<string, number[]>();
  for (const m of materials) {
    if (m.kind === "need") continue;
    const own = [m.text, m.quote].map(squash).filter(Boolean);
    const hit = keys.flatMap((k, i) => (k && own.some((s) => s.includes(k) || (s.length >= LINK_MIN && k.includes(s))) ? [i] : []));
    if (hit.length) out.set(m.id, hit);
  }
  return out;
}
