"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "../../../lib/auth/dal.ts";
import { PREVIEW_WRITE_MSG, previewWriteBlocked } from "../../../lib/auth/preview.ts";
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

/** 열린 작성본 제출 / 제출 취소 */
export async function setDraftStatus(uid: string, op: "submit" | "withdraw"): Promise<{ ok: boolean; message?: string }> {
  const me = await requireUser("/my");
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const supabase = await createClient();
  const { data: card } = await supabase.from("cards").select("id").eq("uid", uid).maybeSingle();
  if (!card) return { ok: false, message: "카드를 찾을 수 없습니다." };
  const open = await openVersion(supabase, card.id);
  if (op === "submit") {
    if (!open || open.status !== "draft") return { ok: false, message: "제출할 작성본이 없습니다. 카드에서 실적을 먼저 고쳐 주세요." };
    const { data, error } = await supabase
      .from("card_versions")
      .update({ status: "submitted", submitted_at: new Date().toISOString(), submitted_by: me.id, note: null })
      .eq("id", open.id)
      .eq("status", "draft")
      .select("id");
    if (error || !data?.length) return { ok: false, message: "제출하지 못했습니다." };
  } else {
    if (!open || open.status !== "submitted") return { ok: false, message: "제출한 작성본이 없습니다." };
    const { data, error } = await supabase.from("card_versions").update({ status: "draft", submitted_at: null }).eq("id", open.id).eq("status", "submitted").select("id");
    if (error || !data?.length) return { ok: false, message: "제출을 취소하지 못했습니다." };
  }
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
