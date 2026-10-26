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
}

export const BIZ_TRACK = {
  id: "주요사업",
  knowledgeTracks: ["주요사업", "가점"],
  assistGuide: "09-assist-guide-biz.md",
  inspectionGuide: "14-inspection-guide-biz.md",
  inspectionForm: "biz14",
  sharedUnits: ["BZ-1", "BZ-2", "BZ-3"],
  unitParts: [],
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
