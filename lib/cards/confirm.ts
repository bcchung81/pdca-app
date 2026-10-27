import "server-only";

// 작성본 → 원장 반영(병합·쓰기·이력·과제 매칭 등록). 성과관리팀 확정(app/(app)/cards/actions.ts confirmDraft — 남은 제출 작성본)과
// 부서 확정(app/(app)/my/actions.ts confirmMyDraft — 2026-10-27 사용자 결정 「부서 담당자가 직접 확정」)이 같은 규칙으로 씀.
// - 작성본을 시작할 때의 원장(base)과 비교해 부서가 바꾼 구역만 지금 원장에 병합(mergeDraft) — 그사이 원장의 다른 구역 변경은 지킴
// - 고정 영역이 잠겼으면 그 영역은 원장 값 그대로(파생 칸 다시 셈 뒤에도 — DB 트리거 guard_card가 부서 쓰기의 고정 영역 변경을 거절하므로)
// - 원장 쓰기는 읽은 개정 번호(data_rev)가 그대로일 때만(그사이 다른 저장이 있으면 0행 → 거절). 권한은 로그인 사용자 RLS·트리거가 판정
// - 원본 양식 조각(original_html): 성과관리팀 쓰기는 같은 렌더러로 다시 그려 넣고, 부서 쓰기는 넣지 않음(트리거가 비움 — 화면은 data에서 그림, 저장형 XSS 차단)

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LooseJson } from "../loose-json.ts";
import { prepCardChanged } from "../prep/triggers.ts";
import { checkEditable, recomputeDerived } from "./edit.ts";
import { canonicalJson } from "./fixed.ts";
import { conflictLabels, mergeDraft } from "./merge.ts";
import { renderCard } from "./render.ts";
import { withFixedFrom } from "./versions.ts";

export type LedgerMergeResult = { ok: true; data: Record<string, unknown>; rev: number; conflicts: string[] } | { ok: false; message: string };

/**
 * 작성본(data·base)을 원장에 병합해 씀 + 수정 이력(summary) + 과제 정체성이 바뀌면 매칭 작업 등록.
 * staff = 성과관리팀·관리자 쓰기(원본 양식 조각을 다시 그려 넣음). conflicts = 원장도 따로 바뀌어 작성본 쪽으로 덮인 구역 이름(화면용)
 */
export async function mergeIntoLedger(supabase: SupabaseClient, me: { id: string; staff: boolean }, cardId: string, version: { data: LooseJson; base: LooseJson }, summary: string): Promise<LedgerMergeResult> {
  const { data: row } = await supabase.from("cards").select("id, data, data_rev, fixed_locked_at, status").eq("id", cardId).maybeSingle();
  if (!row) return { ok: false, message: "카드를 찾을 수 없습니다." };
  if (row.status !== "active") return { ok: false, message: "보관한(삭제한) 과제입니다. 보관함에서 되살린 뒤 고칠 수 있습니다." };
  // 고정 영역이 잠겼으면 작성본·base 모두 원장 값으로 맞춰 그 영역은 원장 그대로
  const draft = row.fixed_locked_at ? withFixedFrom(version.data, row.data) : version.data;
  const base = row.fixed_locked_at && version.base ? withFixedFrom(version.base, row.data) : version.base;
  const { merged, conflicts } = mergeDraft(row.data, base, draft);
  let after = recomputeDerived(merged);
  if (row.fixed_locked_at) after = withFixedFrom(after, row.data);
  const problem = checkEditable(row.data, after);
  if (problem) return { ok: false, message: problem };
  // 병합 결과가 지금 원장과 같으면(그사이 원장에 같은 변경이 이미 들어감) 쓰지 않음 — 내용 없이 개정 번호만 올리면
  // 다른 창의 원장 편집이 낡은 것으로 거절되고, 부서 쓰기는 DB 트리거가 거절해 확정이 막힘
  if (canonicalJson(after) === canonicalJson(row.data)) return { ok: true, data: after, rev: row.data_rev, conflicts: [] };
  let html = "";
  try {
    html = renderCard(after);
  } catch {
    html = "";
  }
  if (!html) return { ok: false, message: "원본 양식으로 그리지 못했습니다." };
  // 읽은 뒤 원장이 바뀌었으면(다른 창 저장) 쓰지 않음 — 다시 확정하면 최신 원장에 병합
  const { data: updated, error } = await supabase
    .from("cards")
    .update({ data: after, title: String(after.title).trim(), ...(me.staff ? { original_html: html } : {}), data_rev: row.data_rev + 1, updated_by: me.id })
    .eq("id", row.id)
    .eq("data_rev", row.data_rev)
    .select("id, data_rev");
  if (error || !updated?.length) {
    if (error) console.error("mergeIntoLedger update", error.message);
    return { ok: false, message: error ? "원장에 반영하지 못했습니다." : "그사이 원장이 바뀌었습니다. 다시 확정해 주세요." };
  }
  const { error: logError } = await supabase.from("card_edits").insert({ card_id: row.id, edited_by: me.id, before: row.data, after, summary });
  if (logError) console.error("mergeIntoLedger history", logError.message);
  await prepCardChanged(supabase, me.id, row.id, row.data, after);
  return { ok: true, data: after, rev: updated[0].data_rev as number, conflicts: conflictLabels(conflicts) };
}
