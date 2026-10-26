// 경평 초안 「평가 기준·평가위원 관점」 근거 고르기(결정론, 순수).
// 평가위원이 소항목을 읽고 점수를 주는 기준과 지난해 평가위원이 이 사업·과제에 짚은 것을 공통 지식에서 골라 요청에 넣습니다.
// 조회는 lens-queries.ts(서버), 요청 문구는 resources/prompts/report-draft/request.md의 lens.* 절.

import { cardFindings, isNoFindingLine } from "./findings.ts";
import type { LooseJson } from "../loose-json.ts";

/** 근거 묶음: 평가 기준 · '25 평가위원 지적 · '25 실사 질의응답 · 유관기관 우수 사례(붙임2 B+·B0) */
export const LENS_GROUPS = ["criteria", "critiques", "survey", "peers"] as const;
export type LensGroup = (typeof LENS_GROUPS)[number];

export interface LensRef {
  group: LensGroup;
  key: string;
  title: string;
  /** 조각 머리말(문서·지표·등급 등) */
  where: string;
  text: string;
}

/**
 * 평가 기준 조각(순서 = 중요도, 관리계획 2026-07판 plan-2607):
 * 편람 ②(평가내용2의 질문) · '25 평가 주요 특징(B0/B+ 조건·비계량 평가방법 = 운영실적 × 전년대비 개선도) · '25 결과 총평 <주요사업> ·
 * '26 대응 추진방향(AI 본사업 확산·국민체감 BP) · 보고서 작성 착안사항(P-D-C-A 논리성·연계성, 읽기 쉬운 보고서).
 * 산업진흥1팀 총평(참고6)은 경영관리 위주라 뺌. 관리계획 새 판이 오면 키를 다시 확인합니다.
 */
export const LENS_CRITERIA_KEYS = [
  "plan-2607/handbook26/common/c2",
  "plan-2607/narr/I/3/s2",
  "plan-2607/narr/I/2/s3",
  "plan-2607/narr/II/2/s2",
  "plan-2607/narr/II/ref3/s1",
  "plan-2607/narr/II/ref3/s2",
] as const;

/**
 * 경영관리 평가 기준 조각(지표 편람 조각 plan-2607/handbook26/MG-N/k* 뒤에 붙임): '25 경영관리 결과 총평(관리계획 Ⅰ 2 <경영관리>) ·
 * 보고서 작성 착안사항(두 트랙 공통). 주요사업 편람 ②·'25 평가 특징·'26 대응방향(주요사업 트랙)은 뺌
 */
export const MG_LENS_CRITERIA_KEYS = ["plan-2607/narr/I/2/s1", "plan-2607/narr/I/2/s2", "plan-2607/narr/II/ref3/s1", "plan-2607/narr/II/ref3/s2"] as const;

/** 묶음마다 조각 수·글자 상한(조각 하나는 LENS_PER_CHUNK까지) */
export const LENS_LIMITS: Record<LensGroup, { items: number; chars: number }> = {
  criteria: { items: 6, chars: 9_000 },
  critiques: { items: 6, chars: 4_000 },
  survey: { items: 3, chars: 6_000 },
  peers: { items: 4, chars: 5_000 },
};
export const LENS_PER_CHUNK = 2_500;

/** 평가위원 지적 조각 종류('25 평가보고서 평가위원 의견·중간보고서 지적) */
export const CRITIQUE_TYPES = ["evaluator_comment", "finding_row"] as const;
/** 실사 질의응답 조각 종류(첨부3) */
export const SURVEY_TYPES = ["qa_pair", "qa_part"] as const;
/** 붙임2에서 짜임·표현을 참고할 등급(지침 09 모드 B와 같음) */
export const PEER_GRADES = ["B+", "B0"] as const;

export interface LensRow {
  chunk_key: string;
  title: string;
  unit_type: string;
  text: string | null;
  context_prefix?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface LensInput {
  /** LENS_CRITERIA_KEYS로 읽은 조각(순서 무관 — 키 순서로 맞춤) */
  criteria: LensRow[];
  /** 평가 기준 조각 순서(중요도) — 없으면 LENS_CRITERIA_KEYS(주요사업). 경영관리는 MG_LENS_CRITERIA_KEYS + 그 지표 편람 조각 */
  criteriaOrder?: readonly string[];
  /** 이 카드에 연결된 조각(자동·확정, 순위 순) — 지적·실사 중 먼저 넣음 */
  linked: LensRow[];
  /** 이 사업 '25 평가보고서 「집행」(평가내용2) 평가위원 의견 */
  execution: LensRow[];
  /** 과제명·계량지표·지적으로 찾은 이 사업의 지적·실사 조각(검색 순) */
  searched: LensRow[];
  /** 붙임2 사례 전체(적재돼 있을 때) */
  peers: LensRow[];
}

const toRef = (group: LensGroup, r: LensRow): LensRef => ({ group, key: r.chunk_key, title: r.title, where: String(r.context_prefix ?? ""), text: String(r.text ?? "").slice(0, LENS_PER_CHUNK) });

/** 묶음별로 앞(중요도 순)부터 조각 수·글자 상한 안에서 고름. 같은 조각은 한 번만 */
export function pickLens(input: LensInput): LensRef[] {
  const out: LensRef[] = [];
  const seen = new Set<string>();
  const take = (group: LensGroup, rows: LensRow[]) => {
    const { items, chars } = LENS_LIMITS[group];
    let n = 0;
    let total = 0;
    for (const r of rows) {
      if (seen.has(r.chunk_key)) continue;
      const ref = toRef(group, r);
      if (!ref.text.trim()) continue;
      if (n >= items || total + ref.text.length > chars) break;
      out.push(ref);
      seen.add(r.chunk_key);
      n += 1;
      total += ref.text.length;
    }
  };
  const byKey = new Map(input.criteria.map((r) => [r.chunk_key, r]));
  take("criteria", (input.criteriaOrder ?? LENS_CRITERIA_KEYS).map((k) => byKey.get(k)).filter((r): r is LensRow => Boolean(r)));
  const isCritique = (r: LensRow) => (CRITIQUE_TYPES as readonly string[]).includes(r.unit_type);
  const isSurvey = (r: LensRow) => (SURVEY_TYPES as readonly string[]).includes(r.unit_type);
  take("critiques", [...input.linked.filter(isCritique), ...input.execution, ...input.searched.filter(isCritique)]);
  take("survey", [...input.linked.filter(isSurvey), ...input.searched.filter(isSurvey)]);
  // 유관기관 사례: KCA 행 제외, B+ 먼저
  const grade = (r: LensRow) => String(r.meta?.grade ?? "");
  const peers = input.peers.filter((r) => !r.meta?.kca && (PEER_GRADES as readonly string[]).includes(grade(r)));
  take("peers", [...peers.filter((r) => grade(r) === "B+"), ...peers.filter((r) => grade(r) !== "B+")]);
  return out;
}

/** 검색에 쓸 카드 글: 과제명·실행과제·계량지표 이름·지적사항 */
export function lensTopic(card: Record<string, unknown> | null | undefined): string {
  const d = (card ?? {}) as Record<string, LooseJson>;
  const kpi: string[] = (d.kpi?.rows ?? []).map((r: { name?: unknown }) => String(r?.name ?? "")).filter(Boolean);
  // 지적: 주요사업은 act.findings(글줄), 경영관리는 findings.rows[].finding(글줄 — 문자열 또는 {text})
  const text = (x: unknown) => (typeof x === "string" ? x : String((x as { text?: unknown })?.text ?? ""));
  const mgFindings: string[] = (d.findings?.rows ?? []).flatMap((r: { finding?: unknown[] }) => (Array.isArray(r?.finding) ? r.finding.map(text) : []));
  const findings: string[] = [...cardFindings(d), ...mgFindings.filter((x) => x && !isNoFindingLine(x))];
  return [d.title, d.executionTask, ...kpi, ...findings].filter(Boolean).join(" ").slice(0, 400);
}

/** 화면·기록용 묶음 이름 */
export const LENS_LABEL: Record<LensGroup, string> = {
  criteria: "평가 기준",
  critiques: "'25 평가위원 지적",
  survey: "'25 실사 질의응답",
  peers: "유관기관 우수 사례",
};
