// 과제원장 AI 작성지원의 요청 종류별 공통 지식 범위(지침 09 <지식파일>·지침 08 §6-3의 자료 규칙, 2026-11-21 후보 C). 순수 함수.
// 자료 갈래는 조각의 unit_type(카드별 덩이 consult도 같은 칸)으로만 정합니다 — doc_id·제목은 보지 않습니다(chunk-role.ts와 같은 원칙).
// 원칙: 「점검표가 대신하는 자료」(지침의 '사용하지 않는 자료' — 판정과 타기관 사례는 점검표에 이미 들어 있어 이중 점검 방지)는 요청에 최근 점검표를 줄 때만 뺍니다.
// 점검표가 없으면 점검표 대신 지금처럼 넣습니다(지침 08 「점검표가 없을 때」 예외와 같은 논리). 여기에 요청 종류마다 쓰지 않는 갈래를 더 뺍니다.
// 묶음은 선별 전 통째로 넣기 묶음(buildBundle)을 줄입니다(lib/ai/context.ts loadCardBundle opts.shape). 선별 방식이면 줄인 뒤 남은 사례류에서 고르고,
// 공통 규칙 문서(rules_digest)는 기준류 요약이라 갈래로 나눌 수 없어 그대로 들어갑니다 — 선별 방식에서는 원문 기준류만 이 범위를 따릅니다(한계).
// 선별 방식에서도 지표 기준류(RAW_INDICATOR_RULES)는 규칙 문서로 바꾸지 않고 원문으로 둡니다(2026-11-21 — 「지표 구분」 체크를 근거 문서 원문과 대조).
// 질문·리뷰어 코멘트·경평 초안·월간 점검은 이 범위를 쓰지 않습니다.

import type { WriterMode } from "../ai/writer.ts";
import type { TrackId, TrackSpec } from "../tracks/index.ts";
import type { KnowledgeBundle, LayerId } from "./bundle.ts";

/** 자료 갈래. 문자열 유니온(열거형 아님) */
export type SourceGroup = "replaced" | "survey" | "strategy" | "prior" | "corrective" | "core" | "consult" | "other";

/** 갈래 표(한 곳) — name·items는 진행 줄(lib/ai/progress.ts)이 그대로 씀. other는 표에 없는 종류(일반 문서 등) — 안전장치로 늘 넣음 */
export const SOURCE_GROUPS: Record<SourceGroup, { name: string; items: string; units: readonly string[] }> = {
  replaced: {
    name: "점검표가 대신하는 자료",
    items: "관리계획 서술·자가진단 체크리스트·편람·'25 평가위원 의견·중간보고서 지적·붙임2 사례",
    units: ["checklist_group", "evaluator_comment", "handbook_indicator", "plan_section", "peer_case", "finding_row"],
  },
  survey: { name: "실사", items: "'25 실사 질문·답변·요청자료·증빙", units: ["qa_pair", "qa_part", "request_evidence", "evidence_image"] },
  strategy: { name: "지표·전략", items: "성과지표 Pool·중장기 목표지표·기관장 성과지표·AX 검토 과제·과제 목록의 이 과제 행", units: ["pool_indicator", "goal_indicator", "ceo_indicator", "ax_task", "task_list_row"] },
  prior: { name: "전년 보고서", items: "2025 경영실적보고서 절", units: ["report_section", "report_chapter"] },
  corrective: { name: "시정조치 계획", items: "'25 지적 시정조치 계획", units: ["corrective_action"] },
  core: { name: "핵심공통항목", items: "핵심공통항목('25 실적)", units: ["core_item"] },
  consult: { name: "컨설팅 의견", items: "외부 컨설팅 의견(이 카드)", units: ["consult_comment"] },
  other: { name: "그 밖", items: "일반 문서 등 위 갈래에 없는 자료", units: [] },
};

export const SOURCE_GROUP_IDS = Object.keys(SOURCE_GROUPS) as SourceGroup[];

const GROUP_OF_UNIT = new Map<string, SourceGroup>(SOURCE_GROUP_IDS.flatMap((g) => SOURCE_GROUPS[g].units.map((u) => [u, g] as const)));

/** 조각 종류(unit_type) → 갈래. 표에 없으면 other */
export const groupOf = (unitType: string): SourceGroup => GROUP_OF_UNIT.get(unitType) ?? "other";

/** 한 요청 종류의 자료 범위 */
export interface WriterScope {
  /** 넣는 갈래 */
  groups: readonly SourceGroup[];
  /** 넣는 갈래 안에서도 빼는 조각 종류(개선 제안의 붙임2 사례 — 점검표가 없어도 뺌) */
  dropUnits: readonly string[];
  /** 갈래 밖이어도 넣을 조각 종류(실적 반영의 자가진단 체크리스트 — 점검표가 없을 때 점검 대비 귀띔 근거, 2026-11-22) */
  extraUnits: readonly string[];
  /** 선별 방식(KNOWLEDGE_SELECT)을 따를지 — 실적 반영은 지표·전략 원문만 넣어 선별하지 않음 */
  select: boolean;
  /** 요청 글에 최근 점검표 요약을 넣는지(보완 점검은 미흡 행 블록이 따로 있어 넣지 않음) */
  inspection: boolean;
}

/** 실적 반영에서 점검표가 없을 때 갈래 밖으로 더 넣는 조각 종류 */
export const REFLECT_NO_INSPECTION_EXTRA: readonly string[] = ["checklist_group"];

/** dropUnits의 진행 줄 이름 */
export const DROP_LABEL: Record<string, string> = { peer_case: "붙임2 유관기관 사례(개선 제안은 점검표가 없어도 뺌)" };

const without = (...xs: SourceGroup[]) => SOURCE_GROUP_IDS.filter((g) => !xs.includes(g));

/**
 * 실적 반영(모드 A)이 넣는 갈래·선별 — 트랙마다 지침이 달라 트랙 표 한 곳(TrackId 키 — 새 트랙은 타입이 자리를 요구함).
 * 주요사업: 지침 09는 모드 A에 공통 지식 자료 규정이 없어 지표·전략(+ 그 밖)만, 선별 안 씀.
 * 경영관리: 지침 08 §7 전년보고서 4·5(전년 대비 개선도·보고서 문장 틀 — 모드 A)와 §8 실사대비 1(작년 약속 이행 — 모드 A 귀띔)이 모드 A에서 전년 보고서·실사 답변을 씀 →
 * 실사·지표·전략·전년 보고서·그 밖, 선별을 따름(경영관리 선별은 기준류를 원문 그대로 두는 방식 — TrackSpec.selectRules raw — 이라 규칙 문서 문제가 없음). 2026-11-21 메인 결정
 */
export const REFLECT_SCOPE: Record<TrackId, { groups: readonly SourceGroup[]; select: boolean }> = {
  주요사업: { groups: ["strategy", "other"], select: false },
  경영관리: { groups: ["survey", "strategy", "prior", "other"], select: true },
};

/**
 * 요청 종류 × 최근 점검표(보낸·확인한 것 중 점검월이 가장 늦은 1건) 유무 → 자료 범위.
 * 개선 제안·실적 발굴: 점검표가 있으면 점검표가 대신하는 자료를 빼고 점검표를 줌(없으면 넣음), 개선 제안은 붙임2를 늘 뺌.
 * 실적 반영: 트랙 표(REFLECT_SCOPE)의 갈래·선별, 점검표가 있으면 점검표를 주고 없으면 자가진단 체크리스트(extraUnits)를 더함(점검 대비 귀띔의 기준). 보완 점검: 점검표가 대신하는 자료를 뺌(점검표 미흡 행은 따로). track = 카드 평가단위의 트랙(trackSpecOfUnit)
 */
export function writerScope(mode: WriterMode, hasInspection: boolean, track: Pick<TrackSpec, "id">): WriterScope {
  const base = hasInspection ? without("replaced") : SOURCE_GROUP_IDS;
  switch (mode) {
    case "improve":
      return { groups: base, dropUnits: ["peer_case"], extraUnits: [], select: true, inspection: hasInspection };
    case "discover":
      return { groups: base, dropUnits: [], extraUnits: [], select: true, inspection: hasInspection };
    case "reflect":
      return { ...REFLECT_SCOPE[track.id], dropUnits: [], extraUnits: hasInspection ? [] : REFLECT_NO_INSPECTION_EXTRA, inspection: hasInspection };
    case "followup":
      return { groups: without("replaced"), dropUnits: [], extraUnits: [], select: true, inspection: false };
  }
}

/** 이 범위에 드는 조각 종류인지 */
export const inScope = (scope: WriterScope, unitType: string): boolean => (scope.groups.includes(groupOf(unitType)) || scope.extraUnits.includes(unitType)) && !scope.dropUnits.includes(unitType);

/**
 * 통째로 넣기 묶음(선별 전)에서 범위 밖 조각을 뺌: 층의 refs, 과제 목록 행(taskRow), 컨설팅 의견(consult). 목록표 키(relevant·peers·prior·similar)는
 * 층에 남은 조각만 가리키게 거름(lib/knowledge/select.ts applySelection의 keep과 같은 방식 — 닮은 순은 다시 세지 않고 남은 것만). 모두 범위 안이면 입력과 같은 묶음
 */
export function scopeBundle(b: KnowledgeBundle, scope: WriterScope): KnowledgeBundle {
  const keep = (unitType: string) => inScope(scope, unitType);
  const layers = b.layers.map((l) => ({ id: l.id, refs: l.refs.filter((r) => keep(r.unitType)) }));
  const inLayers = new Set(layers.flatMap((l) => l.refs.map((r) => r.key)));
  const kept = (xs: string[]) => xs.filter((k) => inLayers.has(k));
  const consult = (b.consult ?? []).filter((r) => keep(r.unitType));
  return {
    unit: b.unit,
    layers,
    list: { relevant: kept(b.list.relevant), taskRow: b.list.taskRow && keep(b.list.taskRow.unitType) ? b.list.taskRow : null, peers: kept(b.list.peers), prior: kept(b.list.prior), similar: kept(b.list.similar) },
    ...(consult.length ? { consult } : {}),
  };
}

/**
 * 선별 방식(공통 규칙 문서를 쓰는 트랙 — 주요사업)에서도 규칙 문서로 바꾸지 않고 원래 층에 원문으로 두는 지표 기준류: 조각 종류 → 원문으로 두는 층(null = 층 상관없이).
 * 개선 제안·실적 발굴이 카드 계량지표의 「지표 구분」 체크(성과지표 Pool·중장기 목표지표·기관장 성과지표·'26 편람 대표 계량지표)를 근거 문서 원문과 대조하므로
 * (resources/prompts/card-assist/request.md task.improve ②) — 편람은 이 사업 층(③)만. 종류는 갈래 표(SOURCE_GROUPS)의 기준류만(mode-profile.test.ts)
 */
export const RAW_INDICATOR_RULES: Readonly<Record<string, LayerId | null>> = { pool_indicator: null, goal_indicator: null, ceo_indicator: null, handbook_indicator: "business" };

/** 선별 방식에서도 이 조각을 원문으로 둘지(loadCardBundle opts.keepRules → lib/knowledge/select.ts applySelection keepRaw) */
export const keepIndicatorRule = (ref: { unitType: string }, layer: LayerId): boolean =>
  Object.hasOwn(RAW_INDICATOR_RULES, ref.unitType) && (RAW_INDICATOR_RULES[ref.unitType] ?? layer) === layer;

/**
 * loadCardBundle(…, "card", "writer", opts)에 그대로 넘기는 꼴 — shape = 선별 전 묶음 줄이기, select = false면 선별 방식을 쓰지 않음,
 * keepRules = 선별 방식에서도 원문으로 두는 지표 기준류(shape가 먼저라 점검표가 대신해 뺀 편람은 다시 들어오지 않음)
 */
export function writerBundleOpts(scope: WriterScope): { shape: (b: KnowledgeBundle) => KnowledgeBundle; select: boolean; keepRules: typeof keepIndicatorRule } {
  return { shape: (b) => scopeBundle(b, scope), select: scope.select, keepRules: keepIndicatorRule };
}
