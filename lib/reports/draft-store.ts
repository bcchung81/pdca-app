// 과제별 초안 행(card_report_drafts) 저장 — 버전 확인(낙관적 잠금, 2026-10-10 개선 계획 P0-2).
// AI 집필·구성안은 몇 분씩 걸려, 예전처럼 upsert로 덮으면 그 사이 사람이 「직접 고치기」·구성안 편집으로 고친 것을 지웠음.
// 시작할 때 읽은 updated_at(행이 없었으면 null)이 그대로일 때만 저장하고, 바뀌었으면 덮지 않고 conflict — 블록 고치기·직접 고치기와 같은 규칙.
// 클라이언트를 인자로 받는 얇은 함수(서버 액션·연기 시험 공용, 시험은 가짜 클라이언트). 지표 단위 부분(eval_unit_report_parts, R5b)도 같은 규칙(saveUnitPartRow).

import type { SupabaseClient } from "@supabase/supabase-js";

export const DRAFT_CONFLICT_MSG = "AI가 쓰는 동안 이 과제의 초안(구성안)이 바뀌었습니다 — 새 결과는 저장하지 않았습니다. 화면을 새로 고친 뒤 다시 만들어 주세요.";

export type DraftSaveResult = { ok: true; version: string } | { ok: false; conflict: true; message: string } | { ok: false; conflict: false; message: string };

/**
 * key 행에 row를 씀. base = 시작할 때 읽은 updated_at(없던 행이면 null). base가 있으면 updated_at 조건 update(0행이면 conflict),
 * null이면 insert(유일 위반 23505면 그 사이 누가 먼저 만든 것 — conflict). 성공하면 새 updated_at(다음 저장의 base)
 */
export function saveDraftRow(db: SupabaseClient, key: { cardId: string; year: number }, row: Record<string, unknown>, base: string | null): Promise<DraftSaveResult> {
  return saveVersionedRow(db, "card_report_drafts", { card_id: key.cardId, year: key.year }, row, base, DRAFT_CONFLICT_MSG);
}

export const UNIT_PART_CONFLICT_MSG = "그사이 이 부분이 다른 곳(다른 창·다른 사람)에서 바뀌었습니다 — 저장하지 않았습니다. 화면을 새로 고친 뒤 다시 해 주세요.";

/** 지표 단위 부분 행(eval_unit_report_parts — R5b, 설계 §3.3) 저장: saveDraftRow와 같은 버전 조건(키 = 평가단위·연도·부분) */
export function saveUnitPartRow(db: SupabaseClient, key: { evalUnitId: string; year: number; part: string }, row: Record<string, unknown>, base: string | null): Promise<DraftSaveResult> {
  return saveVersionedRow(db, "eval_unit_report_parts", { eval_unit_id: key.evalUnitId, year: key.year, part: key.part }, row, base, UNIT_PART_CONFLICT_MSG);
}

/** 버전 조건 저장(표·키 열을 받음): 키 열 + updated_at 조건 update, 처음이면 키를 넣어 insert */
async function saveVersionedRow(db: SupabaseClient, table: string, key: Record<string, string | number>, row: Record<string, unknown>, base: string | null, conflictMsg: string): Promise<DraftSaveResult> {
  if (base) {
    let q = db.from(table).update(row);
    for (const [k, v] of Object.entries(key)) q = q.eq(k, v);
    const { data, error } = await q.eq("updated_at", base).select("updated_at");
    if (error) return { ok: false, conflict: false, message: error.message };
    if (!data?.length) return { ok: false, conflict: true, message: conflictMsg };
    return { ok: true, version: String(data[0].updated_at) };
  }
  const { data, error } = await db.from(table).insert({ ...row, ...key }).select("updated_at");
  if (error?.code === "23505") return { ok: false, conflict: true, message: conflictMsg };
  if (error || !data?.length) return { ok: false, conflict: false, message: error?.message ?? "저장 결과가 없습니다" };
  return { ok: true, version: String(data[0].updated_at) };
}
