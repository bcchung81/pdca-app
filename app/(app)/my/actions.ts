"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "../../../lib/auth/dal.ts";
import { PREVIEW_WRITE_MSG, previewWriteBlocked } from "../../../lib/auth/preview.ts";
import { mergeIntoLedger } from "../../../lib/cards/confirm.ts";
import { checkEditable, recomputeDerived } from "../../../lib/cards/edit.ts";
import { canonicalJson } from "../../../lib/cards/fixed.ts";
import { renderCard } from "../../../lib/cards/render.ts";
import { latestVersion, openVersion, withFixedFrom } from "../../../lib/cards/versions.ts";
import { currentPeriod } from "../../../lib/cards/view.ts";
import { createClient } from "../../../lib/supabase/server.ts";
import type { SaveState } from "../cards/actions";

/**
 * 작성본 저장(부서 담당자 자동 저장·지금 저장). 원장은 그대로 두고 열린 작성본(card_versions)에 씁니다.
 * 새로 시작할 때는 편집을 시작한 원장(base)을 함께 남겨, 확정 때 부서가 바꾼 구역만 원장에 반영하게 합니다.
 * 권한은 RLS(자기 부서 카드)와 트리거(제출 잠금·고정 영역)가 판정합니다.
 */
export async function saveDraft(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const me = await requireUser("/my");
  if (await previewWriteBlocked()) return { status: "error", message: PREVIEW_WRITE_MSG };
  const uid = String(formData.get("uid") ?? "");
  const raw = String(formData.get("payload") ?? "");
  if (!raw || raw.length > 1_600_000) return { status: "error", message: "보낼 내용이 없거나 너무 큽니다." };
  let payload: { data?: Record<string, unknown>; base?: Record<string, unknown>; versionId?: unknown; rev?: unknown };
  try {
    payload = JSON.parse(raw);
  } catch {
    return { status: "error", message: "내용을 읽지 못했습니다." };
  }
  if (!payload.data || typeof payload.data !== "object") return { status: "error", message: "카드 내용이 없습니다." };
  const supabase = await createClient();
  const { data: card } = await supabase.from("cards").select("id, data, team_id, fixed_locked_at").eq("uid", uid).maybeSingle();
  if (!card) return { status: "error", message: "카드를 찾을 수 없습니다." };
  if (me.role === "dept_user" && (me.team?.id ?? -1) !== card.team_id) return { status: "error", message: "자기 부서 과제만 작성할 수 있습니다." };
  // 고정 영역이 확정된 카드는 그 영역을 원장 값으로 맞춤(트리거도 같은 일을 함)
  let after = recomputeDerived(payload.data);
  if (card.fixed_locked_at) after = withFixedFrom(after, card.data);
  const problem = checkEditable(card.data, after);
  if (problem) return { status: "error", message: problem };
  try {
    renderCard(after);
  } catch {
    return { status: "error", message: "원본 양식으로 그리지 못했습니다. 입력을 확인해 주세요." };
  }

  const open = await openVersion(supabase, card.id);
  const now = new Date().toISOString();
  if (open?.status === "submitted") return { status: "error", message: "제출한 작성본입니다. 고치려면 먼저 「제출 취소」를 눌러 주세요." };
  // 편집기가 불러온 작성본과 지금 열린 작성본이 다르면(그사이 확정·교체) 오래된 내용으로 덮지 않게 거절
  const expected = typeof payload.versionId === "number" ? payload.versionId : null;
  if ((open?.id ?? null) !== expected) return { status: "error", message: "작성본이 다른 곳에서 바뀌었습니다(확정·제출 등). 화면을 새로 고친 뒤 다시 고쳐 주세요." };
  if (open) {
    // 같은 작성본을 다른 사람·다른 창이 먼저 저장했으면 거절(개정 번호)
    const rev = typeof payload.rev === "number" ? payload.rev : open.rev;
    if (rev !== open.rev) return { status: "error", message: "다른 사람(또는 다른 창)이 이 작성본을 먼저 고쳤습니다. 화면을 새로 고친 뒤 다시 고쳐 주세요." };
    if (canonicalJson(open.data) === canonicalJson(after)) return { status: "ok", message: "저장됨", at: now, versionId: open.id, rev: open.rev };
    const { data, error } = await supabase.from("card_versions").update({ data: after, rev: open.rev + 1 }).eq("id", open.id).eq("status", "draft").eq("rev", open.rev).select("id, rev");
    if (error || !data?.length) return { status: "error", message: "저장하지 못했습니다(다른 곳에서 먼저 고쳤거나 자기 부서 카드가 아닙니다)." };
    revalidatePath("/my");
    return { status: "ok", message: "저장됨", at: now, versionId: open.id, rev: data[0].rev as number };
  }
  if (canonicalJson(card.data) === canonicalJson(after)) return { status: "ok", message: "바뀐 내용 없음", at: now };
  // 작성본을 시작한 원장(base): 편집기가 불러온 원장. 잠긴 고정 영역은 원장 값으로
  let base = payload.base && typeof payload.base === "object" && !checkEditable(card.data, payload.base) ? payload.base : card.data;
  if (card.fixed_locked_at) base = withFixedFrom(base, card.data);
  const period = currentPeriod();
  const latest = await latestVersion(supabase, card.id, period);
  const { data: inserted, error } = await supabase
    .from("card_versions")
    .insert({ card_id: card.id, period, version: (latest?.version ?? 0) + 1, status: "draft", data: after, base, created_by: me.id })
    .select("id")
    .single();
  if (error || !inserted) {
    console.error("saveDraft insert", error?.message);
    return { status: "error", message: "저장하지 못했습니다(자기 부서 카드만 작성할 수 있습니다)." };
  }
  revalidatePath("/my");
  return { status: "ok", message: "저장됨", at: now, versionId: inserted.id, rev: 0 };
}

/**
 * 작성본 확정(원장 반영) — 부서 담당자(2026-10-27 사용자 결정: 성과관리팀 제출·확정 단계 없이 부서가 바로 반영, 성과관리팀은 원장 이력에서 보고 필요하면 원장을 고침).
 * 병합은 성과관리팀 확정과 같은 규칙(lib/cards/confirm.ts — 부서가 바꾼 구역만, 잠긴 고정 영역은 원장 값, 개정 번호 조건 쓰기, 이력, 매칭 작업).
 * 순서는 원장 먼저 → 작성본 「확정」: 부서는 확정한 작성본을 되돌릴 권한이 없어(RLS) 「작성본 선점 → 실패하면 되돌림」을 못 씀.
 * 원장을 쓴 뒤 작성본 확정이 실패해도(그사이 다른 창이 작성본을 고침) 원장은 그대로이고, 다시 확정하면 같은 구역을 다시 반영할 뿐(병합은 같은 결과).
 */
export async function confirmMyDraft(uid: string): Promise<{ ok: boolean; message?: string }> {
  const me = await requireUser("/my");
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  if (me.role !== "dept_user") return { ok: false, message: "부서 담당자의 작성본 확정입니다 — 성과관리팀·관리자는 과제 원장에서 바로 고칩니다." };
  const supabase = await createClient();
  const { data: card } = await supabase.from("cards").select("id").eq("uid", uid).maybeSingle();
  if (!card) return { ok: false, message: "카드를 찾을 수 없습니다." };
  const open = await openVersion(supabase, card.id);
  if (open?.status === "submitted") return { ok: false, message: "제출한 작성본입니다 — 「제출 취소」를 누른 뒤 확정해 주세요." };
  if (!open) return { ok: false, message: "확정할 작성본이 없습니다. 카드에서 실적을 먼저 고쳐 주세요." };
  const month = `${Number(open.period.slice(5))}월`;
  const res = await mergeIntoLedger(supabase, { id: me.id, staff: false }, card.id, { data: open.data, base: open.base }, `${month} 작성본 확정(부서)`);
  if (!res.ok) return { ok: false, message: res.message };
  // 작성본을 확정으로(확정자 = 본인 — DB 트리거 guard_card_version이 작성 중·본인만 허용). 병합한 내용 그대로일 때만(개정 번호)
  const { data: done, error } = await supabase
    .from("card_versions")
    .update({ status: "confirmed", confirmed_by: me.id, confirmed_at: new Date().toISOString() })
    .eq("id", open.id)
    .eq("status", "draft")
    .eq("rev", open.rev)
    .select("id");
  revalidatePath("/my");
  revalidatePath("/cards");
  revalidatePath("/inspections");
  if (error || !done?.length) {
    console.error("confirmMyDraft version", error?.message ?? "0 rows");
    return { ok: false, message: "원장에는 반영했지만 작성본을 확정으로 바꾸지 못했습니다(그사이 작성본이 바뀜). 화면을 새로 고친 뒤 다시 확정해 주세요." };
  }
  const overlap = res.conflicts.length ? ` 원장에서도 따로 바뀐 구역(${res.conflicts.join("·")})은 작성본 내용으로 바뀌었습니다.` : "";
  return { ok: true, message: `${month} 작성본을 확정해 원장에 반영했습니다.${overlap} 성과관리팀은 수정 이력에서 봅니다.` };
}

/** 남은 제출 작성본의 제출 취소(2026-10-27부터 부서는 제출하지 않고 확정 — confirmMyDraft. 예전 「제출」은 받지 않음) */
export async function setDraftStatus(uid: string, op: "withdraw"): Promise<{ ok: boolean; message?: string }> {
  await requireUser("/my");
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  if (op !== "withdraw") return { ok: false, message: "제출 단계는 없어졌습니다 — 「확정(원장 반영)」을 눌러 주세요." };
  const supabase = await createClient();
  const { data: card } = await supabase.from("cards").select("id").eq("uid", uid).maybeSingle();
  if (!card) return { ok: false, message: "카드를 찾을 수 없습니다." };
  const open = await openVersion(supabase, card.id);
  if (!open || open.status !== "submitted") return { ok: false, message: "제출한 작성본이 없습니다." };
  const { data, error } = await supabase.from("card_versions").update({ status: "draft", submitted_at: null }).eq("id", open.id).eq("status", "submitted").select("id");
  if (error || !data?.length) return { ok: false, message: "제출을 취소하지 못했습니다." };
  revalidatePath("/my");
  revalidatePath("/cards");
  return { ok: true };
}

/** 받은 월간 점검 결과 확인(부서 담당자) */
export async function acknowledgeInspection(id: number): Promise<{ ok: boolean; message?: string }> {
  await requireUser("/my/inspections");
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const supabase = await createClient();
  const { data, error } = await supabase.from("inspections").update({ status: "acknowledged" }).eq("id", id).eq("status", "sent").select("id");
  if (error || !data?.length) return { ok: false, message: "확인 처리하지 못했습니다(자기 부서 과제의 보낸 점검만 확인할 수 있습니다)." };
  revalidatePath("/my/inspections");
  return { ok: true };
}
