"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "../../../lib/auth/dal.ts";
import { createClient } from "../../../lib/supabase/server.ts";
import { prepCardAdded } from "../../../lib/prep/triggers.ts";
import { ARCHIVE_REASON_MAX } from "../../../lib/cards/limits.ts";

// 과제 삭제 = 보관(되살릴 수 있음). 보관한 과제는 목록·부서 화면·AI·점검·보고서에서 빠지고, 부서는 읽지도 쓰지도 못합니다(RLS).
// 영구 삭제는 관리자만, 보관함에서 과제번호를 한 번 더 적어 확인한 뒤 — 작성본·점검·이력·자료 파일까지 함께 지워집니다.

type Result = { ok: boolean; message: string };

export async function archiveCard(uid: string, reason: string): Promise<Result> {
  const me = await requireRole(["pmo", "admin"], "/cards");
  if (!me) return { ok: false, message: "성과관리팀·관리자만 과제를 삭제(보관)할 수 있습니다." };
  const why = String(reason ?? "").trim().slice(0, ARCHIVE_REASON_MAX);
  if (!why) return { ok: false, message: "삭제(보관)하는 까닭을 적어 주세요." };
  const supabase = await createClient();
  const { data: card } = await supabase.from("cards").select("id, data, status").eq("uid", uid).maybeSingle();
  if (!card) return { ok: false, message: "카드를 찾을 수 없습니다." };
  if (card.status !== "active") return { ok: false, message: "이미 보관한 과제입니다." };
  const { data, error } = await supabase
    .from("cards")
    .update({ status: "retired", retired_at: new Date().toISOString(), retired_by: me.id, retired_reason: why, updated_by: me.id })
    .eq("id", card.id)
    .eq("status", "active")
    .select("id");
  if (error || !data?.length) return { ok: false, message: "삭제(보관)하지 못했습니다." };
  await supabase.from("card_edits").insert({ card_id: card.id, edited_by: me.id, before: card.data, after: card.data, summary: `과제 삭제(보관): ${why}` });
  revalidatePath("/cards");
  revalidatePath("/cards/archive");
  revalidatePath("/my");
  return { ok: true, message: "보관함으로 옮겼습니다. 보관함에서 되살릴 수 있습니다." };
}

export async function restoreCard(uid: string): Promise<Result> {
  const me = await requireRole(["pmo", "admin"], "/cards/archive");
  if (!me) return { ok: false, message: "성과관리팀·관리자만 되살릴 수 있습니다." };
  const supabase = await createClient();
  const { data: card } = await supabase.from("cards").select("id, data, status").eq("uid", uid).maybeSingle();
  if (!card || card.status !== "retired") return { ok: false, message: "보관한 과제가 아닙니다." };
  const { data, error } = await supabase
    .from("cards")
    .update({ status: "active", retired_at: null, retired_by: null, retired_reason: null, updated_by: me.id })
    .eq("id", card.id)
    .eq("status", "retired")
    .select("id");
  if (error || !data?.length) return { ok: false, message: "되살리지 못했습니다." };
  await supabase.from("card_edits").insert({ card_id: card.id, edited_by: me.id, before: card.data, after: card.data, summary: "보관함에서 되살림" });
  await prepCardAdded(supabase, me.id, card.id);
  revalidatePath("/cards");
  revalidatePath("/cards/archive");
  revalidatePath("/my");
  return { ok: true, message: "되살렸습니다. 과제 원장에 다시 보입니다." };
}

async function removeFolder(supabase: Awaited<ReturnType<typeof createClient>>, bucket: string, folder: string) {
  for (let round = 0; round < 20; round++) {
    const { data } = await supabase.storage.from(bucket).list(folder, { limit: 100 });
    const names = (data ?? []).filter((o) => o.id).map((o) => `${folder}/${o.name}`);
    if (!names.length) return;
    const { error } = await supabase.storage.from(bucket).remove(names);
    if (error) return;
  }
}

export async function purgeCard(uid: string, confirmTaskNo: string): Promise<Result> {
  const me = await requireRole(["admin"], "/cards/archive");
  if (!me) return { ok: false, message: "영구 삭제는 관리자만 합니다." };
  const supabase = await createClient();
  const { data: card } = await supabase.from("cards").select("id, uid, task_no, status").eq("uid", uid).maybeSingle();
  if (!card) return { ok: false, message: "카드를 찾을 수 없습니다." };
  if (card.status !== "retired") return { ok: false, message: "보관한 과제만 영구 삭제할 수 있습니다." };
  if (String(confirmTaskNo ?? "").trim() !== card.task_no) return { ok: false, message: `확인을 위해 과제번호(${card.task_no})를 그대로 적어 주세요.` };
  const { data, error } = await supabase.from("cards").delete().eq("id", card.id).eq("status", "retired").select("id");
  if (error || !data?.length) {
    console.error("purgeCard", error?.message);
    return { ok: false, message: "영구 삭제하지 못했습니다(연결된 기록을 확인해 주세요)." };
  }
  await removeFolder(supabase, "card-originals", card.uid);
  await removeFolder(supabase, "card-materials", card.uid);
  revalidatePath("/cards/archive");
  return { ok: true, message: `${card.id}를 영구 삭제했습니다.` };
}
