// 경영관리 지표 사전 — 자료마다 지표를 다른 이름·번호로 부르므로(관리계획 편람 「(1) 전략기획」, 체크리스트 소분류, 핵심공통항목 섹션, 중간보고서 절 제목)
// 이름을 지침 08·13의 지표 N(MG-N, lib/tracks/mgmt-units.ts)에 잇는 별칭 표. 주요사업의 `METRICS_2025`(dictionaries.ts)와 같은 역할.
// 지침 08이 「사전에 없는 지표명은 추측 매칭하지 않는다」고 하므로 못 푸는 이름은 null — 파서는 그 조각의 단위를 비워 두고 적재 검산(scope-check)이 알림.
// 카드가 없는 평가 항목(국민소통·재무예산성과·효율성 관리·총인건비 관리·지배구조 및 리더십)은 `known: true`이면서 단위 없음(경영관리 트랙 공통으로 둠).
// 순수 모듈(입출력 없음).

import { MGMT_INDICATORS } from "../tracks/mgmt-units.ts";
import { compactKey } from "./normalize.ts";

export interface MgmtResolve {
  /** 지표 단위 id(`MG-N`) — 카드가 없는 항목이거나 모르는 이름이면 null */
  unit: string | null;
  /** 사전이 아는 이름인가(단위 없는 항목 포함). false면 새 이름 — 사전에 더해야 함 */
  known: boolean;
  /** 맞은 별칭(디버그·검산용) */
  alias: string | null;
}

/** 지표 N → 이 자료들에서 쓰는 이름들(공백·문장부호는 비교 때 무시). 짧은 말이 다른 지표 이름에 끼지 않게 구체적으로만 */
const ALIASES: Record<number, string[]> = {
  1: ["리더십 및 전략기획", "전략기획"],
  2: ["윤리경영"],
  3: ["일자리 및 균등한 기회", "일자리 창출과 공정한 채용", "일자리 및 균등"],
  4: ["안전 및 재난관리", "안전 및 재난 관리", "안전·재난관리"],
  5: ["친환경 탄소중립", "친환경·탄소중립", "친환경‧탄소중립", "친환경탄소중립"],
  6: ["창업 및 경제활성화", "창업 및 경제 활성화"],
  7: ["상생협력 및 지역발전", "상생·협력 및 지역발전", "상생․협력 및 지역발전", "상생 협력 및 지역발전"],
  8: ["재무예산관리", "재무 예산 관리"],
  9: ["조직 및 인적자원관리", "인적자원관리", "일·가정 양립", "일가정 양립", "일․가정 양립"],
  10: ["노사관계"],
  11: ["보수 및 복리후생", "직무중심 보수", "직무 중심 보수", "직무중심 합리적 보수", "합리적 보수체계"],
  12: ["안전한 일터 조성", "안전한 일터"],
  13: ["AI 활용 혁신", "AI 활용을 통한", "AI 활용"],
  14: ["국정과제 핵심정책 이행", "국정과제 등 핵심정책", "국정과제"],
};

/** 카드는 없지만 평가 항목으로 나오는 이름 — 안다고만 알림(단위 없음) */
const NO_CARD = ["국민소통", "재무예산성과", "효율성 관리", "총인건비 관리", "지배구조 및 리더십", "지배구조", "주요사업 계량지표 구성의 적합성", "주요사업 성과관리의 적정성"];

const TABLE = [
  ...MGMT_INDICATORS.flatMap((m) => [...(ALIASES[m.no] ?? []), m.name].map((a) => ({ unit: m.id as string | null, alias: a, key: compactKey(a) }))),
  ...NO_CARD.map((a) => ({ unit: null as string | null, alias: a, key: compactKey(a) })),
].sort((a, b) => b.key.length - a.key.length);

/** 글 안에서 가장 긴 별칭이 맞는 지표(「(1) 전략기획」·「안전한 일터 조성을 위한 노력과 성과(혁신가점)」처럼 이름이 글에 끼어 있어도 찾음) */
export function resolveMgmtUnit(text: string | null | undefined): MgmtResolve {
  const key = compactKey(String(text ?? ""));
  if (!key) return { unit: null, known: false, alias: null };
  const hit = TABLE.find((t) => key.includes(t.key));
  return hit ? { unit: hit.unit, known: true, alias: hit.alias } : { unit: null, known: false, alias: null };
}

/** 경영관리 지표 N(숫자) → 단위 id */
export const mgmtUnitId = (no: number): string | null => MGMT_INDICATORS.find((m) => m.no === no)?.id ?? null;
