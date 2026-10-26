// 과제 대응표(card_knowledge_scope)의 순수 로직: 대상 조각 유형, 표시할 키, 다시 매칭할 때의 쓰기 계획, 옛 연결 → 대응표 변환.
// 대응표는 거르는 장치가 아니라 「이 과제 해당」 표시·닮은 순·숫자 근거 범위에만 쓴다(docs/reference-materials.md §4.2.1).

import type { ScopeHit, ScopeMethod, ScopeRow, ScopeStatus } from "./types.ts";

/** 대응표 대상 조각 유형(§4.2.1) */
export const SCOPE_UNIT_TYPES: readonly string[] = [
  "finding_row",
  "evaluator_comment",
  "qa_pair",
  "qa_part",
  "request_evidence",
  "report_section",
  "pool_indicator",
  "ax_task",
  "generic_section", // 범용 조각기(5단계)가 나눈 일반 문서 구간
  "corrective_action", // 2025 경영실적평가 지적사항 시정조치 계획(지적 + 조치계획 쌍)
];

/** /links 화면의 유형별 탭 묶음 */
export const SCOPE_GROUPS: readonly { id: string; label: string; unitTypes: readonly string[] }[] = [
  { id: "finding", label: "지적", unitTypes: ["finding_row", "evaluator_comment", "corrective_action"] },
  { id: "survey", label: "실사", unitTypes: ["qa_pair", "qa_part", "request_evidence"] },
  { id: "prior", label: "전년 절", unitTypes: ["report_section"] },
  { id: "pool", label: "Pool·AX", unitTypes: ["pool_indicator", "ax_task"] },
  { id: "generic", label: "일반 문서", unitTypes: ["generic_section"] },
];

/** 사람이 정한 상태(확정·뺌) — 다시 매칭해도 손대지 않음 */
export function isDecided(status: ScopeStatus): boolean {
  return status === "confirmed" || status === "rejected";
}

/** 표시에 쓰는 조각 키: auto·confirmed만, 순위 오름차순(없으면 뒤) → 조각 키 순, 중복 없음 */
export function displayKeys(rows: ScopeRow[]): string[] {
  const shown = rows.filter((r) => r.status === "auto" || r.status === "confirmed");
  shown.sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) || a.chunk_key.localeCompare(b.chunk_key));
  return [...new Set(shown.map((r) => r.chunk_key))];
}

export interface ScopeWrites {
  insert: ScopeRow[];
  update: ScopeRow[];
  /** 지울 조각 키 */
  remove: string[];
}

/**
 * 다시 매칭한 결과를 대응표에 쓰는 계획. 자동 초안(auto·candidate)만 바꾸고 확정·뺌은 그대로 둔다.
 * - 확정·뺌 행: 이번에 맞든 안 맞든 손대지 않음
 * - 다른 method의 자동 행: 손대지 않음(규칙이 AI보다 앞)
 * - 같은 method의 자동 행이 이번 평가 범위(evaluated)인데 안 맞으면 지움 — 범위 밖 행은 지우지 않음
 */
export function planScopeWrites(
  cardId: string,
  existing: ScopeRow[],
  evaluated: ReadonlySet<string>,
  hits: ScopeHit[],
  method: "rule" | "ai",
): ScopeWrites {
  const current = new Map(existing.map((r) => [r.chunk_key, r]));
  // 같은 조각이 여러 번 맞으면 점수가 높은 쪽
  const best = new Map<string, ScopeHit>();
  for (const h of hits) {
    const prev = best.get(h.chunkKey);
    if (!prev || (h.score ?? 0) > (prev.score ?? 0)) best.set(h.chunkKey, h);
  }

  const insert: ScopeRow[] = [];
  const update: ScopeRow[] = [];
  for (const h of best.values()) {
    const cur = current.get(h.chunkKey);
    const row: ScopeRow = {
      card_id: cardId,
      chunk_key: h.chunkKey,
      status: h.status ?? "auto",
      method,
      score: h.score ?? null,
      rank: h.rank ?? null,
      basis: h.basis || null,
    };
    if (!cur) insert.push(row);
    else if (isDecided(cur.status) || cur.method !== method) continue;
    else update.push(row);
  }

  const remove: string[] = [];
  for (const cur of existing) {
    if (isDecided(cur.status) || cur.method !== method) continue;
    if (!evaluated.has(cur.chunk_key) || best.has(cur.chunk_key)) continue;
    remove.push(cur.chunk_key);
  }
  return { insert, update, remove };
}

/** 옛 knowledge_card_links(지적 단위) 한 행 — 시드 입력 모양 */
export interface LinkRow {
  card_id: string;
  finding_index: number;
  chunk_key: string;
  finding_no: number;
  card_finding: string | null;
  method: string;
  score: number | null;
  basis: string | null;
  rank: number | null;
  status: ScopeStatus;
}

const STATUS_ORDER: Record<ScopeStatus, number> = { confirmed: 0, rejected: 1, auto: 2, candidate: 3 };

/**
 * 지적 단위 연결을 (과제, 조각) 단위로 합친다. 마이그레이션 20260930090000_prep_tables.sql의 이관과 같은 우선순위:
 * 사람이 정한 것이 먼저(confirmed > rejected > auto > candidate), 그다음 순위·점수·지적 번호.
 */
export function scopeRowsFromLinks(links: LinkRow[]): ScopeRow[] {
  const cmp = (a: LinkRow, b: LinkRow) =>
    STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
    (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) ||
    (b.score ?? -Infinity) - (a.score ?? -Infinity) ||
    a.finding_index - b.finding_index ||
    a.finding_no - b.finding_no;
  const winners = new Map<string, LinkRow>();
  for (const l of links) {
    const key = `${l.card_id}\u0000${l.chunk_key}`;
    const cur = winners.get(key);
    if (!cur || cmp(l, cur) < 0) winners.set(key, l);
  }
  return [...winners.values()].map((l) => ({
    card_id: l.card_id,
    chunk_key: l.chunk_key,
    status: l.status,
    method: "rule" as ScopeMethod,
    score: l.score,
    rank: l.rank,
    basis: l.basis,
    meta: { finding_index: l.finding_index, finding_no: l.finding_no, card_finding: l.card_finding, link_method: l.method },
  }));
}
