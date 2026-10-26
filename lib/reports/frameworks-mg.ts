// 경영관리 경평 초안 「이야기 틀」(순수): 2025 경영관리 보고서 육안 64쪽·프레임워크 12종에서 뽑은 8종 + 14개 지표 전수 육안(223단위)에서 8종으로 안 잡히던
// 반복 짜임 3종(⑨~⑪, 2026-10-10) + 타기관 2025 보고서 짜임 분석의 ⑫ AX 전환형(2026-10-13) + 옛 섞음(2026-10-12부터 절마다 주 틀 + 보조 틀 — 분석 docs/analysis/2025-경영관리-경영실적보고서-분석.md §8.5·§8.7·§8.8). 블록 어휘는 주요사업과 같은 lib/reports/blocks.ts의 BLOCK_KINDS를 그대로 씀 —
// 달라지는 것은 이야기 틀 목록과 구성안 구조(평가내용 → 대주제 → 절)뿐. 틀의 블록 순서는 resources/prompts/report-draft-mg/stories.md 줄과 같은 순서여야 합니다(시험이 대조).
// 틀 이름·개수는 후보(빈도 미집계)이고 사용자가 확정합니다. 주요사업의 FRAMEWORKS(frameworks.ts)는 건드리지 않습니다.

import type { BlockKind } from "./blocks.ts";

/** 주 틀 12종 — 구성안 AI는 절마다 이 중에서 주 틀과(필요하면) 보조 틀을 고름(2026-10-12 — 주요사업 MAIN_STORIES처럼 섞음 대신 주 + 보조) */
export const MG_MAIN_STORIES = ["전략수립형", "배경·내용·성과형", "문제·해결형", "기존·개선형", "PDCA 체계형", "단계·연도 로드맵형", "구분표 중심형", "계량 모니터링형", "소과제 묶음형", "생애주기형", "준수 점검형", "AX 전환형"] as const;
export type MgMainStory = (typeof MG_MAIN_STORIES)[number];
/** 이야기 틀(12종 + 섞음) — 섞음은 2026-10-12 전에 저장된 구성안·초안을 읽을 때만(AI 답·새로 고르기에는 없음) */
export const MG_STORIES = [...MG_MAIN_STORIES, "섞음"] as const;
export type MgStory = (typeof MG_STORIES)[number];

export interface MgFrameworkBlock {
  kind: BlockKind;
  variant?: string;
  /** 사다리 행 라벨(보고서의 왼쪽 어두운 라벨 칸) — 없으면 전폭 */
  label?: string;
}

/** 틀이 놓이는 단계: 대주제 전체(전략수립형) / 절 하나(나머지) */
export type MgFrameworkLevel = "theme" | "section";

export interface MgFramework {
  story: MgStory;
  no: string;
  level: MgFrameworkLevel;
  /** 어울리는 절 한 줄 */
  fit: string;
  /** 블록 순서 예시(stories.md와 같은 순서) — 섞음은 빈 목록(AI가 정함) */
  blocks: MgFrameworkBlock[];
  /**
   * 2025 보고서 예시 위치 「지표 평가내용-대주제(-절)」 — ①~⑧은 14개 지표 223단위 육안 판정(분석 §8.8)에서 그 틀이 주 틀인 곳, ⑨~⑪은 같은 판정에서
   * 그 짜임이 「새 모양」(□ 소주제·생애주기 순환·띠 표·준수 칸)으로 기록된 곳. stories.md 그 틀 줄에도 같은 글(시험이 대조). ⑫는 KCA 2025 예시가 없어 빈 목록
   */
  examples: string[];
}

const RESULT: MgFrameworkBlock = { kind: "stats", label: "추진성과" };

export const MG_FRAMEWORKS: MgFramework[] = [
  {
    story: "전략수립형",
    no: "①",
    level: "theme",
    fit: "평가내용의 첫 대주제 — 환경 변화를 보고 목표·전략·과제·지표를 세운 과제",
    blocks: [{ kind: "cards", variant: "plain", label: "환경분석" }, { kind: "banner", label: "시사점" }, { kind: "quotes" }, { kind: "strategy", label: "전략체계" }, { kind: "chart", label: "핵심성과" }],
    examples: ["윤리경영 1-1", "창업 1-1", "상생·협력 1-1", "재무예산 1-1", "노사관계 1-1", "안전한 일터 1-1"],
  },
  {
    story: "배경·내용·성과형",
    no: "②",
    level: "section",
    fit: "배경을 짧게 짚고 추진내용을 박스·흐름으로 보인 뒤 성과로 닫는 기본형",
    blocks: [{ kind: "bullets", label: "추진배경" }, { kind: "cards", variant: "plain", label: "추진내용" }, { kind: "steps", variant: "row", label: "추진내용" }, RESULT, { kind: "chart", label: "추진성과" }],
    examples: ["상생·협력 1-2", "윤리경영 1-2", "안전·재난 1-3", "안전한 일터 1-4"],
  },
  {
    story: "문제·해결형",
    no: "③",
    level: "section",
    fit: "갈등·문제를 먼저 보이고 극복·혁신 방안과 실적으로 푼 과제",
    blocks: [{ kind: "cards", variant: "vs", label: "문제인식" }, { kind: "steps", variant: "row", label: "혁신포인트" }, { kind: "compare", variant: "table", label: "추진내용" }, RESULT],
    examples: ["노사관계 1-2", "전략기획 2-3"],
  },
  {
    story: "기존·개선형",
    no: "④",
    level: "section",
    fit: "기존 방식을 개선해 바꾼 과제 — As-Is → To-Be",
    blocks: [{ kind: "bullets", label: "추진배경" }, { kind: "compare", variant: "panels", label: "기존→개선" }, { kind: "compare", variant: "table", label: "추진내용" }, RESULT],
    examples: ["노사관계 1-3-가", "조직·인적자원 1-2", "재무예산 1-2-가"],
  },
  {
    story: "PDCA 체계형",
    no: "⑤",
    level: "section",
    fit: "제도·체계를 계획 → 운영 → 점검 → 환류 단계로 설명하는 과제",
    blocks: [{ kind: "banner", label: "개선방향" }, { kind: "pdca", label: "운영체계" }, { kind: "table", label: "추진내용" }, RESULT],
    examples: ["조직·인적자원 2-1", "안전·재난 2-3-다", "상생·협력 1-4-다"],
  },
  {
    story: "단계·연도 로드맵형",
    no: "⑥",
    level: "section",
    fit: "해마다 단계를 쌓아 온 과제 — 추진경과 → 추진실적",
    blocks: [{ kind: "timeline", variant: "chevron", label: "추진경과" }, { kind: "compare", variant: "table", label: "추진실적" }, RESULT],
    examples: ["노사관계 1-3-나", "안전·재난 2-2-라", "창업 2-3-나", "안전한 일터 1-5-가"],
  },
  {
    story: "구분표 중심형",
    no: "⑦",
    level: "section",
    fit: "「구분 | 주요활동 | 추진실적」 표가 본문 거의 전부인 과제",
    blocks: [{ kind: "bullets", label: "추진배경" }, { kind: "table", label: "구분·주요활동·추진실적" }, RESULT],
    examples: ["노사관계 2-1", "재무예산 3-2", "상생·협력 1-3-다"],
  },
  {
    story: "계량 모니터링형",
    no: "⑧",
    level: "section",
    fit: "수치 격자·증감 막대·월별 매트릭스로 관리 수준을 보이는 과제",
    blocks: [{ kind: "table", label: "현황분석" }, { kind: "chart", label: "증감" }, { kind: "table", label: "관리방안" }, RESULT],
    examples: ["재무예산 1-2", "재무예산 1-3"],
  },
  // ⑨~⑪(2026-10-10): 14개 지표 전수 육안에서 8종으로 안 잡혀 섞음·⑤·⑦로 억지로 셌던 짜임 — 소과제 묶음 23단위(11%)·생애주기 5·준수 점검 2(분석 §8.7·§8.8)
  {
    story: "소과제 묶음형",
    no: "⑨",
    level: "section",
    fit: "절 하나에 독립 소과제 2~4개가 있고 소과제마다 내용·실적이 따로인 과제",
    blocks: [{ kind: "bullets", label: "추진배경" }, { kind: "subhead" }, { kind: "cards", variant: "plain", label: "추진내용" }, { kind: "subhead" }, { kind: "table", label: "추진내용" }, RESULT],
    examples: ["일자리 1-2-가", "일자리 2-1-가", "친환경 1-3-가", "상생·협력 2-4-나"],
  },
  {
    story: "생애주기형",
    no: "⑩",
    level: "section",
    fit: "대상자의 생애 단계(임신·출산 → 육아 → 복직, 채용 → 승진 → 퇴직)마다 지원을 이어 붙인 과제",
    blocks: [{ kind: "bullets", label: "추진배경" }, { kind: "steps", variant: "row", label: "생애주기" }, { kind: "table", label: "단계별 지원" }, RESULT],
    examples: ["일자리 4-2", "보수·복리후생 2-3-나", "조직·인적자원 4-2", "조직·인적자원 5-2", "노사관계 3-2"],
  },
  {
    story: "준수 점검형",
    no: "⑪",
    level: "section",
    fit: "정부 지침·권고 항목마다 기관 이행과 준수 여부를 보이고 미준수는 협의 계획으로 잇는 과제",
    blocks: [{ kind: "bullets", label: "정부지침" }, { kind: "table", label: "준수 점검" }, { kind: "steps", variant: "row", label: "미준수 개선" }, RESULT],
    examples: ["보수·복리후생 1-3", "조직·인적자원 4-1"],
  },
  // ⑫(2026-10-13): 타기관 2025 보고서 짜임 분석(docs/analysis/2025-산업진흥군-타기관-짜임-분석.md 가3)에서 뽑음 — KCA 2025 경영관리 보고서에서 확인한 위치가 없어 예시는 빈 목록
  {
    story: "AX 전환형",
    no: "⑫",
    level: "section",
    fit: "AI·자동화로 업무 절차를 바꾼 과제 — 기존 절차 → 전환 → 사람·AI 역할 분담 → 단축 성과",
    blocks: [{ kind: "cards", variant: "arrow", label: "전환 배경" }, { kind: "compare", variant: "panels", label: "기존→AI 전환" }, { kind: "table", label: "역할 분담" }, { kind: "steps", variant: "row", label: "확산" }, RESULT],
    examples: [],
  },
  // 옛 구성안·초안 읽기용(2026-10-12부터 AI 답·고르기에 없음 — 두 틀이 필요하면 주 틀 + 보조 틀)
  { story: "섞음", no: "", level: "section", fit: "옛 구성안 — 둘 이상이 섞인 절(지금은 주 틀 + 보조 틀로 고름)", blocks: [], examples: [] },
];

/**
 * 프레임워크(241203판)와 전년 보고서(260304판)의 차이 — 분석 §4 대조표. 구성안의 틀 선택지에서 「구판」 표시를 달 근거(결정 2026-10-08:
 * 지표·평가내용 구성과 가중치는 2025 보고서·관리계획 7월판이 우선이고 프레임워크는 도식 틀의 모양만).
 * evalCountDiffers: 보고서 본문으로 확인한 곳 true, 확인 못 한 곳 null.
 */
export interface MgFrameworkRevision {
  unit: string | null;
  /** 프레임워크 표지 가중치(점) */
  frameworkWeight: number;
  /** 전년 보고서 표지 가중치(점) — 전년 보고서 없는 지표는 null */
  reportWeight: number | null;
  evalCountDiffers: boolean | null;
  note: string;
}

export const MG_FRAMEWORK_REVISION: Record<string, MgFrameworkRevision> = {
  "1-(1)": { unit: "MG-1", frameworkWeight: 0.5, reportWeight: 2, evalCountDiffers: true, note: "세부평가내용 5→2(경영계약·이사회·디지털플랫폼정부 빠짐 — 보고서 본문으로 확인)" },
  "1-(2)": { unit: "MG-2", frameworkWeight: 1.5, reportWeight: 1.5, evalCountDiffers: false, note: "같음" },
  "1-(3)": { unit: null, frameworkWeight: 0.5, reportWeight: null, evalCountDiffers: null, note: "전년 보고서·카드 없음 — 선택지에서 제외 후보" },
  "2-(1)": { unit: "MG-3", frameworkWeight: 1, reportWeight: 1, evalCountDiffers: false, note: "같음" },
  "2-(2)": { unit: "MG-4", frameworkWeight: 1, reportWeight: 1.5, evalCountDiffers: null, note: "가중치 다름" },
  "2-(3)": { unit: "MG-5", frameworkWeight: 0.5, reportWeight: 2, evalCountDiffers: null, note: "가중치 다름" },
  "2-(4)": { unit: "MG-6", frameworkWeight: 1.5, reportWeight: 1.5, evalCountDiffers: false, note: "같음" },
  "2-(5)": { unit: "MG-7", frameworkWeight: 1, reportWeight: 1.5, evalCountDiffers: null, note: "가중치 다름" },
  "3-(1)": { unit: "MG-8", frameworkWeight: 3, reportWeight: 3, evalCountDiffers: false, note: "같음" },
  "4-(1)": { unit: "MG-9", frameworkWeight: 2.5, reportWeight: 2, evalCountDiffers: null, note: "가중치 다름" },
  "4-(2)": { unit: "MG-10", frameworkWeight: 2, reportWeight: 2.5, evalCountDiffers: null, note: "가중치 다름" },
  "4-(3)": { unit: "MG-11", frameworkWeight: 3.5, reportWeight: 1, evalCountDiffers: null, note: "가중치 다름, 평가내용 수는 보고서 쪽이 3으로 집계(어림, 확인 필요)" },
};

/** 구판 표시를 달아야 하는 틀인지 — 가중치가 다르거나 평가내용 수가 다름. 보고서가 없으면(국민소통) 판단 불가라 true(선택지 제외 후보) */
export const isStaleFramework = (file: string): boolean => {
  const r = MG_FRAMEWORK_REVISION[file];
  return !r || r.reportWeight === null || r.frameworkWeight !== r.reportWeight || r.evalCountDiffers === true;
};
