// 경영관리 경평 초안의 골격 타입(순수, 타입만) — 구성안(composition.ts)·초안 spec(section.ts)·경영관리 모듈(mg-outline.ts·mg-draft.ts)이 함께 씀.
// 경영관리 보고서는 「평가내용 → 대주제 → 절(가·나·다)」 3단이고(분석 docs/analysis/2025-경영관리-경영실적보고서-분석.md §8.3), 카드 1장이 대주제 묶음을 낳음(설계 §7-1).
// 블록 목록은 주요사업처럼 한 줄로 두고 블록마다 절 열쇠(at)를 달아(설계 결정 2026-10-09 「기존 구조 확장」) 블록 고치기·수정 이력·직접 고치기를 그대로 씀.

import type { MgMainStory, MgStory } from "./frameworks-mg.ts";
import type { OutlineFrame } from "./framework-pick.ts";

/** 절 하나(대주제 본문이면 mark가 빈 글 — 절이 없는 대주제·평가내용 첫 「전략수립」 대주제) */
export interface MgPart {
  /** 절 열쇠 `평가내용.대주제.표지`(표지가 없으면 0) — mgPartKey */
  key: string;
  /** 평가내용 번호(2025 보고서 연번 — 설계 결정 2026-10-09) */
  evalNo: number;
  evalTitle: string;
  themeNo: number;
  themeTitle: string;
  /** 절 표지(가·나·다) — 빈 글이면 대주제 본문 */
  mark: string;
  /** 절 제목(대주제 본문이면 빈 글) */
  title: string;
  /** 주 틀(뼈대) — 2026-10-12 전에 저장된 구성안·초안은 「섞음」일 수 있음 */
  story: MgStory | "";
  /** 보조 틀(한 행·한 블록만 빌려 오는 틀 — 2026-10-12 섞음 대신, 주 틀과 다름). 없으면 주 틀 하나 */
  subStory?: MgMainStory;
  /** 이 절을 둔 이유·전년 절과의 대응 한 줄(구성안 — 초안에서는 빈 글) */
  why: string;
  /** 절 다시 짜기에서 담당자가 고른 짜임(이야기 틀·구성 패턴·2025 예시 절·요청 글 — lib/reports/framework-pick.ts, 2026-10-12). 없으면 처음 구성안 그대로 */
  frame?: OutlineFrame;
  /** 갈래 칩(절 제목 앞 「[값] 」 — 카드의 갈래 축(MgOutlineMeta.axis) 값, lib/reports/split-axes.ts). 절 표지가 있는 절만. 없으면 칩 없음 */
  chip?: string;
}

/** 구성안의 경영관리 골격 */
export interface MgOutlineMeta {
  /** 지표 이름(전략기획 등) */
  indicator: string;
  parts: MgPart[];
  /** 이 지표 2025 보고서 절이 모두 「추진성과」 행으로 닫혔음(엄격 닫기 — mg-outline.ts mgCloseRule, 2026-10-12 사용자 결정 D2). 없으면 기본 규칙 */
  strictClose?: boolean;
  /** 갈래 축(lib/reports/split-axes.ts 사전 이름 — 절을 나누는 축, 2026-10-13). 없으면 축 없음(칩도 없음) */
  axis?: string;
  /** 구성안을 만들 때 카드 원장에서 뽑은 절 성과 재료(mg-close.ts ledgerOutcomeItems, 2026-10-29) — 구성안 점검 「성과 배정」이 씀. 없으면(이 필드 전 구성안) 점검 안 함 */
  outcomes?: MgOutcome[];
  /** 값 충돌(구성안이 근거에서 찾은 같은 항목의 다른 값 — mg-outline.ts cleanMgComposition이 근거 수치로 거른 것, 2026-10-30). 집필이 초안 spec.mg.conflicts로 옮김. 없으면 충돌 없음 */
  conflicts?: MgConflict[];
}

/**
 * 값 충돌 한 건(2026-10-30): 카드 원장(구판)과 첨부(신판)처럼 근거끼리 같은 항목 값이 다를 때 쓰지 않을 값과 쓸 값. 모두 근거 원문 구절 그대로(앱이 근거 수치로 확인)
 * — 집필 요청에 목록으로 주고(mg-draft.ts mgPlanPrompt), 초안 점검·분량 보강이 버린 값이 남은 줄을 찾음(mg-consistency.ts)
 */
export interface MgConflict {
  /** 항목 이름(같은 대상 — 「신고 유형 수」처럼) */
  item: string;
  /** 쓰지 않을 값(원문 구절 그대로) */
  drop: string;
  /** 쓸 값(원문 구절 그대로) */
  keep: string;
  /** 출처·시점 한 줄 */
  why: string;
}

/** 원장 성과 재료 한 줄(mg-close.ts ledgerOutcomeItems): 어느 칸에서 왔는지와 수치(단위 붙은 숫자) 유무 */
export interface MgOutcome {
  text: string;
  /** 정량 성과 칸 · 월별 실적의 수치 줄 · 정성 성과 칸 */
  from: "quantitative" | "monthly" | "qualitative";
  figure: boolean;
}

/** 초안 spec의 경영관리 골격 — at[i] = spec.blocks[i]가 놓인 절 열쇠 */
export interface MgDraftMeta {
  indicator: string;
  parts: MgPart[];
  at: string[];
  /** 분량 목표 = 목차·쪽 배정의 이 카드 쪽수(지표 총량은 작성분량(규정), 카드 몫은 2025 쪽 비율로 앱이 어림한 배정 — 2026-10-12 D1). 없으면 분량을 견주지 않음(이 필드 전 초안 포함) */
  pages?: number;
  /** 엄격 닫기(MgOutlineMeta.strictClose와 같음) — 다시 점검·블록 고치기가 씀 */
  strictClose?: boolean;
  /**
   * 지적개선 표지를 붙일 절 열쇠(2026-10-15 — 카드 지적 행과 글이 가장 많이 겹치는 절, mg-draft.ts mgFindingParts). 렌더러는 그 절의 대주제 띠에 붙임(대주제마다 한 번).
   * 없으면 예전처럼 첫 대주제 띠(이 필드 전 초안·겹침이 문턱 아래)
   */
  finding?: string[];
  /** 값 충돌(구성안 MgOutlineMeta.conflicts를 집필이 옮김 — 다시 점검이 구성안 없이 같은 「값 충돌」 경고를 냄, 2026-10-30). 렌더러·높이 어림은 읽지 않음. 없으면 충돌 없음 */
  conflicts?: MgConflict[];
}

export const mgPartKey = (evalNo: number, themeNo: number, mark: string) => `${evalNo}.${themeNo}.${mark || "0"}`;
