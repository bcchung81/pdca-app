// 공통 지식 선별 결과 만들기의 순수 부분(고르기·순위·rejected 빼기·행 만들기). 입출력 없음 — scripts/knowledge/select-build.ts가 부름.
// 유지형: p가 문턱 이상이면 모두 고름(상위 N 자르기 없음), 순위는 p 내림차순(같으면 chunk_key 순으로 재현 가능하게).
// 트랙에 따라 Jev에 맡기지 않고 늘 남기는 조각이 있으면(ALWAYS_KEEP) 그 조각을 고른 키 앞에 둠 — 런타임(select.ts applySelection)은 고른 키만 넣으므로 키에 늘 들어 있어야 함.

import type { LayerId } from "./bundle.ts";
import type { ChunkRole } from "./chunk-role.ts";
import type { TrackId } from "../tracks/index.ts";

/** 선별 문턱(지식공급 하이브리드 선별 결과 §3.3 — Jev strict p≥0.2) */
export const SELECT_THRESHOLD = 0.2;

export interface SelectScore {
  chunkKey: string;
  p: number;
}

export interface SelectedChunk {
  chunkKey: string;
  /** Jev p. 늘 남긴 조각(판정 안 함)은 null */
  p: number | null;
  rank: number;
}

/** 늘 남길 조각 규칙 한 줄: 이 층(layerOf, 경평 초안 용도)의 이 성격(chunkRole) 조각 */
export interface KeepRule {
  layer: LayerId;
  roles: readonly ChunkRole[];
}

/**
 * Jev 후보에서 빼고 늘 고른 키에 넣을 조각(트랙별). 주요사업은 없음 — 예전 동작 그대로.
 * 경영관리는 ③ 이 지표 층의 전년 보고서 장(prior — 같은 지표 2025 보고서)만. 근거(2026-10-29, 10-26 실험 산출물 + 정답지 3장 다시 채점):
 * - 10-26에 빠진 정답지 yes는 주로 ③ 실사 답변이었음(3-1 5건 — 카드 지적과 같은 사안의 실사 질문·요청 자료, 선별 초안 심사가 그 사안의 사실을 섞은 지어냄을 지적).
 *   원인은 Jev에 보낸 카드 요약에 경영관리 지적 칸이 빠진 것(scripts/lib/jev-card.ts 고침). 고친 요약으로 다시 채점하니 같은 문턱·비슷한 크기에서
 *   3장 놓친 yes 9 → 3건, 3-1의 ③ 실사 답변 yes는 모두 p ≥ 0.24 — 실사 답변·지적은 Jev에 맡겨도 됨.
 * - 같은 지표 2025 보고서 장은 이 지표의 본보기·숫자 근거(숫자 대조도 이 장 전부를 씀 — lib/reports/mg-queries.ts loadMgNumberEvidence)인데,
 *   Jev 질문은 「이 과제의 사안을 직접 다루는가」라 지표 단위 장(성과분석 및 환류 등)을 낮게 매김(4-2 정답지 yes가 고친 뒤에도 p 0.13).
 *   지표마다 장 수가 정해져 있고 작아서(10-26 카드당 1.4만~2.9만 자, 그중 Jev가 뺀 것 0.6만~1.2만 자) 늘 남겨도 크기 부담이 작음
 */
export const ALWAYS_KEEP: Record<TrackId, readonly KeepRule[]> = { 주요사업: [], 경영관리: [{ layer: "business", roles: ["prior"] }] };

/** 이 조각(층·성격)을 늘 남길지 — 층이 없으면(묶음 밖) 아님 */
export const keptBy = (rules: readonly KeepRule[], layer: LayerId | null, role: ChunkRole): boolean => layer !== null && rules.some((r) => r.layer === layer && r.roles.includes(role));

/** 판정기 표지: `jev-<모델 버전>:strict:p>=0.2` (모델은 응답이 알려 준 이름, 예 jev-1.14.0). 늘 남긴 규칙이 있으면 `+keep:<층>/<성격>`을 붙임 */
export function judgeLabel(model: string, variant = "strict", threshold = SELECT_THRESHOLD, keep: readonly KeepRule[] = []): string {
  return `${model}:${variant}:p>=${threshold}${keep.length ? `+keep:${keep.map((r) => `${r.layer}/${r.roles.join("|")}`).join(",")}` : ""}`;
}

/** 점수에서 rejected를 빼고 문턱 이상을 p 내림차순으로 고름. rank는 1부터 */
export function pickSelected(scores: SelectScore[], rejected: ReadonlySet<string>, threshold = SELECT_THRESHOLD): { selected: SelectedChunk[]; rejectedExcluded: number } {
  const live = scores.filter((s) => !rejected.has(s.chunkKey));
  const selected = live
    .filter((s) => s.p >= threshold)
    .sort((a, b) => b.p - a.p || a.chunkKey.localeCompare(b.chunkKey))
    .map((s, i) => ({ chunkKey: s.chunkKey, p: s.p, rank: i + 1 }));
  return { selected, rejectedExcluded: scores.length - live.length };
}

/**
 * 늘 남길 조각(kept, 이미 정한 순서 — 문서 → 적재 순)을 앞에, Jev가 고른 것(selected 순서 그대로)을 뒤에 두고 rank를 1부터 다시 매김.
 * kept에서도 rejected는 뺌(런타임 dbSelection도 뺌). kept가 비면 selected와 같은 결과
 */
export function withAlwaysKept(kept: string[], selected: SelectedChunk[], rejected: ReadonlySet<string>): { selected: SelectedChunk[]; rejectedExcluded: number } {
  const live = kept.filter((k) => !rejected.has(k));
  const keptSet = new Set(live);
  const rows = [...live.map((chunkKey) => ({ chunkKey, p: null })), ...selected.filter((s) => !keptSet.has(s.chunkKey))];
  return { selected: rows.map((s, i) => ({ chunkKey: s.chunkKey, p: s.p, rank: i + 1 })), rejectedExcluded: kept.length - live.length };
}

export interface SelectRow {
  card_id: string;
  chunk_key: string;
  rank: number;
  /** Jev p — 늘 남긴 조각은 null(표의 score는 비어도 됨) */
  score: number | null;
  judge: string;
}

/** card_knowledge_select 행(created_at은 DB 기본값). 같은 조각이 두 번 있으면 오류 */
export function selectRows(cardId: string, selected: SelectedChunk[], judge: string): SelectRow[] {
  const seen = new Set<string>();
  for (const s of selected) {
    if (seen.has(s.chunkKey)) throw new Error(`${cardId}: 같은 조각이 두 번 — ${s.chunkKey}`);
    seen.add(s.chunkKey);
  }
  return selected.map((s) => ({ card_id: cardId, chunk_key: s.chunkKey, rank: s.rank, score: s.p, judge }));
}
