import type { CSSProperties } from "react";

/**
 * 오른쪽 패널(과제원장 옆 창·전체 페이지의 AI 작성지원·점검 결과·자료·수정 이력, 경평 초안 과제별 초안의 AI 초안·점검 결과·근거 자료)
 * 공통 폭 규칙 — 두 화면 모두 이 한 가지(반응형: 화면 폭의 34% 안팎, 400~600px). 예전에는 카드가 860px 고정, 경평 초안이 440px 고정으로 서로 달랐음.
 */
export const RIGHT_PANE = "w-[clamp(400px,34vw,600px)] shrink-0";

/** 구분선을 끌어 오른쪽 패널 폭을 바꿀 때의 한도(px) */
export const PANE_MIN = 360;
export const PANE_MAX = 900;
/** 오른쪽 패널이 넓어져도 왼쪽 문서에 남겨 둘 최소 폭(px) */
export const LEFT_MIN = 560;

/**
 * 이 브라우저에 기억한 폭(px)으로 오른쪽 패널 인라인 스타일을 만듭니다.
 * 기억한 폭이 없으면(w === null) undefined를 돌려주고 RIGHT_PANE 클래스가 기본 폭을 정합니다.
 * 창(작업 공간 행)이 좁아지면 calc(100% - LEFT_MIN)이 걸려 저절로 줄어듭니다.
 */
export function paneWidthStyle(w: number | null): CSSProperties | undefined {
  if (w === null) return undefined;
  return { width: `clamp(${PANE_MIN}px, min(${w}px, ${PANE_MAX}px), max(${PANE_MIN}px, calc(100% - ${LEFT_MIN}px)))` };
}

/** 기억한 폭이 있으면 shrink-0만(폭은 인라인 스타일이 정함), 없으면 기본 RIGHT_PANE */
export function paneClass(w: number | null): string {
  return w === null ? RIGHT_PANE : "shrink-0";
}
