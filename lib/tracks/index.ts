// 트랙(주요사업 / 경영관리)별로 달라지는 것을 한 곳에 모은 순수 모듈 — 코드가 「주요사업만」을 문자열로 못박지 않고 이 스펙을 받게 하려는 토대(경영관리 확장 설계 `docs/plan/경영관리-트랙확장-설계.md` §5 「틀 일반화」).
// 지금은 읽는 쪽(공통 지식 조회·층 판정·지침 사본·점검 양식 id)만 담고, 카드 양식·평가단위 사전·경평 초안 같은 것은 해당 작업 묶음에서 이 스펙에 더합니다.
// 주요사업의 값은 예전에 코드에 흩어져 있던 리터럴 그대로라 동작이 바뀌지 않습니다(`tracks.test.ts`가 값을 못박음).

/** 앱의 두 트랙(메가프로세스). 공통 지식 조각의 `track`에는 가점이 따로 있음(`Track`) */
export type TrackId = "주요사업" | "경영관리";

/**
 * 평가단위(지표·사업) × 연도 보고서에서 과제별 초안 밖에 놓이는 부분의 고정 키(경영관리 R5 설계 docs/plan/경영관리-R5-지표단위-설계.md §3.1 — 두 트랙 공용 틀, Q10).
 * 경영관리: 표지·지적사항 조치실적·전년 대비 주요 추진실적·성과분석 및 환류(지표관리 방향은 Q1 결정으로 넣지 않음). 주요사업 부분은 별도 설계 뒤에 더함
 */
export type UnitPartKey = "cover" | "findings" | "prior" | "outcome";

export interface TrackSpec {
  id: TrackId;
  /** 이 트랙 요청의 공통 지식으로 읽는 `knowledge_chunks.track` 값(주요사업·경영관리·가점 — 가점은 두 트랙 모두에 걸치는 공통 조각) */
  knowledgeTracks: readonly string[];
  /** 작성지원·질문·코멘트 시스템 프롬프트에 끼우는 작성지원 지침 사본(`resources/harness/pdca/`) */
  assistGuide: string;
  /** 월간 점검 시스템 프롬프트에 끼우는 종합점검 지침 사본 */
  inspectionGuide: string;
  /** 점검표 양식 식별자(`inspections.result.form`) */
  inspectionForm: string;
  /** 요청 앞 공통 지식 크기(40만 자 한도, `lib/knowledge/guard.ts`)를 따로 재는 공통 지식 단위 — 주요사업은 사업 BZ-1~3, 경영관리는 지표 MG-1~14(③ 이 평가단위 공통이 단위마다 다름) */
  sharedUnits: readonly string[];
  /** 이 트랙 평가단위 보고서의 카드 밖 부분(장 순서) — 주요사업은 아직 없음(빈 목록) */
  unitParts: readonly UnitPartKey[];
  /**
   * 경평 초안 칸 불릿 하나의 기준 글자 수(2026-10-29) — 2025 그 트랙 보고서의 「∙•」 불릿 평균 글자 수 중앙값을 반올림.
   * 집필 요청 글 한도 「불릿 하나 약 T자(한 줄 P자 × L줄)」의 L = max(1, round(이 값 ÷ P))(lib/reports/fit.ts bulletLines). 「한 줄 약 P자」만 주면 좁은 칸에 한 줄 조각 불릿이 나옴
   */
  reportBulletChars: number;
  /** 경평 초안 PDCA 대응표(단계 ↔ 카드 칸 — lib/reports/mg-pdca.ts). 카드 양식에 Plan·Check 칸이 없는 트랙만 둠 — 주요사업은 없음 */
  pdca?: PdcaSpec;
}

/** PDCA 단계(구성안 블록 stage 값도 이 넷뿐) */
export const PDCA_STAGES = ["P", "D", "C", "A"] as const;
export type PdcaStage = (typeof PDCA_STAGES)[number];

/** 라벨 하나 — 카드 머리 칸 경로(path)의 글(연도가 든 원본 머리), 경로가 없거나 비었으면 fallback */
export interface PdcaLabel {
  path?: string;
  fallback: string;
}

/**
 * 단계 하나의 재료가 되는 카드 칸 하나(경로·모양·라벨 출처). 모양: pairs = rows[]의 왼쪽 → 오른쪽 짝(한 줄로 이음), kpi = 계량지표 행(이름·단위·전년 실적·목표),
 * lines = 줄 목록(표 줄은 칸을 이어 한 줄), monthly = 월별 실적({period, items} — 줄마다 기간을 붙임)
 */
export interface PdcaSource {
  stage: PdcaStage;
  /** 카드 JSON 칸 경로(점 구분) */
  path: string;
  shape: "pairs" | "kpi" | "lines" | "monthly";
  /** pairs: 짝의 왼쪽·오른쪽 칸 이름(rows[] 안) */
  pair?: readonly [string, string];
  /** 라벨: pairs는 [왼쪽, 오른쪽], kpi는 [줄 라벨, 전년 실적, 목표], lines·monthly는 [칸 이름] */
  labels: readonly PdcaLabel[];
  /** pairs: 왼쪽 줄 중 「지적 없음」 표시 줄은 빼고(lib/reports/findings.ts isNoFindingLine), 다 빠진 행은 버림 */
  realFindings?: boolean;
  /** 이 칸 줄 중 Check 낱말(PdcaSpec.checkWords)이 든 줄은 이 단계에서 빼고 C로 옮김 */
  checkSplit?: boolean;
}

export interface PdcaSpec {
  sources: readonly PdcaSource[];
  /** Check 줄 가르기 낱말 — checkSplit 칸의 줄에 하나라도 있으면 그 줄은 C */
  checkWords: readonly string[];
}

export const BIZ_TRACK = {
  id: "주요사업",
  knowledgeTracks: ["주요사업", "가점"],
  assistGuide: "09-assist-guide-biz.md",
  inspectionGuide: "14-inspection-guide-biz.md",
  inspectionForm: "biz14",
  sharedUnits: ["BZ-1", "BZ-2", "BZ-3"],
  unitParts: [],
  // 2025 주요사업 보고서 평가내용2 과제 소항목 62개의 불릿 평균 중앙값 27.89자(소항목별 15.3~45.3자, scripts/eval/biz-bullet-baseline.ts 2026-10-29 측정)
  reportBulletChars: 28,
} as const satisfies TrackSpec;

/** 경영관리 평가지표 14개(지침 08 지표 번호 1~14, 12~14는 혁신가점) — 공통 지식(`knowledge_chunks.business`)의 단위 id */
const MGMT_INDICATOR_UNITS = Array.from({ length: 14 }, (_, i) => `MG-${i + 1}`);

/** 경영관리 — 지침 08·13 사본은 반입돼 있으나 앱이 아직 읽지 않음(작업 묶음 G에서 연결). 점검표 양식 `mgmt13`도 아직 없음 */
export const MGMT_TRACK = {
  id: "경영관리",
  knowledgeTracks: ["경영관리", "가점"],
  assistGuide: "08-assist-guide-mg.md",
  inspectionGuide: "13-inspection-guide-mg.md",
  inspectionForm: "mgmt13",
  sharedUnits: MGMT_INDICATOR_UNITS,
  unitParts: ["cover", "findings", "prior", "outcome"],
  // 2025 경영관리 보고서 14건(지표마다)의 불릿 평균 중앙값 23.05자(지표별 19.2~30.2자, scripts/eval/mg-fill-baseline.ts 2026-10-29 측정)
  reportBulletChars: 23,
  // PDCA 대응표(2026-10-30) — 근거: 지침 08(경영관리 작성지원) 「경영관리 양식에는 Plan·Check 칸이 없다 … Plan → '지적 및 개선방안'·'전년도 환류'의 '26년 개선방안 /
  // Do → 추진내용 / Check(리스크) → 추진내용 하위 불릿 '- (리스크 대응) …'」, 지침 13(경영관리 종합점검) 「환류↔개선방안 인과 → 착안사항 Act」·총평 「경영관리도 P-D-C-A 관점에서
  // 보고서가 작성(특히, 환류)」, 관리계획 참고3 「P-D-C-A의 논리성·연계성 강화」(Plan: 계획 논리·성과지표·목표 / Check: 성과·산출근거).
  // P = 전년도 환류(자체평가 → 개선방안)·실제 지적(→ 개선방안)·계량지표 목표, D = 추진내용·월별 실적, C = 추진성과 + 추진내용·월별 줄 중 Check 낱말 줄,
  // A = 카드에 칸 없음(올해 점검 결과로 바꾼 것은 근거에 있을 때만 — 차년도 환류 계획은 지표 단위 「성과분석 및 환류」가 맡음)
  pdca: {
    sources: [
      { stage: "P", path: "feedback.rows", shape: "pairs", pair: ["self", "plan"], labels: [{ path: "feedback.headers.self", fallback: "전년도 자체평가" }, { path: "feedback.headers.plan", fallback: "개선방안" }] },
      { stage: "P", path: "findings.rows", shape: "pairs", pair: ["finding", "plan"], labels: [{ path: "findings.headers.finding", fallback: "지적" }, { path: "findings.headers.plan", fallback: "개선방안" }], realFindings: true },
      { stage: "P", path: "kpi.rows", shape: "kpi", labels: [{ fallback: "계량 성과지표" }, { path: "kpi.headers.prev", fallback: "전년 실적" }, { path: "kpi.headers.target", fallback: "목표" }] },
      { stage: "D", path: "do.lines", shape: "lines", labels: [{ fallback: "추진내용" }], checkSplit: true },
      { stage: "D", path: "do.monthly", shape: "monthly", labels: [{ fallback: "월별 실적" }], checkSplit: true },
      { stage: "C", path: "outcome.quantitative", shape: "lines", labels: [{ path: "outcome.headers.quantitative", fallback: "정량 성과" }] },
      { stage: "C", path: "outcome.qualitative", shape: "lines", labels: [{ path: "outcome.headers.qualitative", fallback: "정성 성과" }] },
    ],
    // 지침 08 Check(리스크)의 「리스크 대응」, 참고3 Check(성과 점검)의 점검·모니터링·검증
    checkWords: ["리스크", "점검", "모니터링", "검증"],
  },
} as const satisfies TrackSpec;

export const TRACK_SPECS: Record<TrackId, TrackSpec> = { 주요사업: BIZ_TRACK, 경영관리: MGMT_TRACK };

/** 트랙을 따로 안 정한 곳의 기본값 — 지금 앱의 모든 화면·기능은 주요사업 하나(트랙 전환 화면이 생기면 이 자리를 사용자의 트랙으로 바꿈) */
export const DEFAULT_TRACK: TrackSpec = BIZ_TRACK;

/** 평가단위 id(`eval_units.id`)가 속한 트랙 — 경영관리는 `MG-…`(카드 묶음 `MG-G…`·지표 `MG-n`), 그 밖(BZ-1~4 등)은 주요사업 */
export function trackOfUnit(unitId: string | null | undefined): TrackId {
  return /^MG-/.test(String(unitId ?? "")) ? "경영관리" : "주요사업";
}

export function trackSpecOfUnit(unitId: string | null | undefined): TrackSpec {
  return TRACK_SPECS[trackOfUnit(unitId)];
}

/** 머리띠 트랙 전환의 쿠키 이름 — 사용자가 고른 트랙을 브라우저에 기억(화면마다 서버가 읽음, 권한이 아니라 보기 선택) */
export const TRACK_COOKIE = "pdca_track";

/** 쿠키·입력 글 → 트랙. 모르는 값·없으면 기본(주요사업) */
export function parseTrack(value: string | null | undefined): TrackId {
  return value === "경영관리" ? "경영관리" : DEFAULT_TRACK.id;
}
