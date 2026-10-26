// 공통 지식 선별 결과 만들기의 순수 부분(고르기·순위·rejected 빼기·행 만들기). 입출력 없음 — scripts/knowledge/select-build.ts가 부름.
// 유지형: p가 문턱 이상이면 모두 고름(상위 N 자르기 없음), 순위는 p 내림차순(같으면 chunk_key 순으로 재현 가능하게).

/** 선별 문턱(지식공급 하이브리드 선별 결과 §3.3 — Jev strict p≥0.2) */
export const SELECT_THRESHOLD = 0.2;

export interface SelectScore {
  chunkKey: string;
  p: number;
}

export interface SelectedChunk {
  chunkKey: string;
  p: number;
  rank: number;
}

/** 판정기 표지: `jev-<모델 버전>:strict:p>=0.2` (모델은 응답이 알려 준 이름, 예 jev-1.14.0) */
export function judgeLabel(model: string, variant = "strict", threshold = SELECT_THRESHOLD): string {
  return `${model}:${variant}:p>=${threshold}`;
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

export interface SelectRow {
  card_id: string;
  chunk_key: string;
  rank: number;
  score: number;
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
