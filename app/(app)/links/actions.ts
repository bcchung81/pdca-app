"use server";

import { revalidatePath } from "next/cache";
import { requireAtLeast } from "../../../lib/auth/dal.ts";
import { createClient } from "../../../lib/supabase/server.ts";

/** 과제 대응표(card_knowledge_scope)의 한 행 — (과제, 조각) */
export interface LinkKey {
  cardId: string;
  chunkKey: string;
}

/** 과제 대응표 행 확정·제외·되돌리기 — 성과관리팀·관리자. 확정·제외는 다시 매칭해도 덮이지 않음 */
export async function setLinkStatus(key: LinkKey, status: "confirmed" | "rejected" | "candidate"): Promise<{ ok: boolean; message?: string }> {
  const me = await requireAtLeast("pmo", "/links");
  if (!me) return { ok: false, message: "성과관리팀·관리자만 확정합니다." };
  const supabase = await createClient();
  const done = status !== "candidate";
  const { data, error } = await supabase
    .from("card_knowledge_scope")
    .update({ status, confirmed_by: done ? me.id : null, confirmed_at: done ? new Date().toISOString() : null })
    .eq("card_id", key.cardId)
    .eq("chunk_key", key.chunkKey)
    .select("card_id");
  if (error || !data?.length) return { ok: false, message: "바꾸지 못했습니다." };
  revalidatePath("/links");
  return { ok: true };
}

/** 과제 대응(9월 카드 ↔ 7월 과제 목록 ↔ 2025 실행과제) 확정·되돌리기 + 메모 */
export async function setTaskMapStatus(cardId: string, status: "confirmed" | "draft", note: string): Promise<{ ok: boolean; message?: string }> {
  const me = await requireAtLeast("pmo", "/links");
  if (!me) return { ok: false, message: "성과관리팀·관리자만 확정합니다." };
  const supabase = await createClient();
  const done = status === "confirmed";
  const { data, error } = await supabase
    .from("task_map")
    .update({ status, note: note.trim().slice(0, 1000) || null, confirmed_by: done ? me.id : null, confirmed_at: done ? new Date().toISOString() : null })
    .eq("card_id", cardId)
    .select("card_id");
  if (error || !data?.length) return { ok: false, message: "바꾸지 못했습니다." };
  revalidatePath("/links");
  return { ok: true };
}

/** 확신도 높은 초안 일괄 확정: 지적 연결은 점수 기준 이상(자동·후보), 과제 대응은 초안 판정 「같음」 */
export async function bulkConfirm(kind: "findings" | "tasks", minScore = 0.9): Promise<{ ok: boolean; message: string }> {
  const me = await requireAtLeast("pmo", "/links");
  if (!me) return { ok: false, message: "성과관리팀·관리자만 확정합니다." };
  const supabase = await createClient();
  const now = new Date().toISOString();
  if (kind === "findings") {
    const min = Math.min(1, Math.max(0.5, Number(minScore) || 0.9));
    // 지금은 규칙(3-gram)이 만든 지적 연결만 점수가 있음 — 유형별 탭 확장(3-5) 전까지 그 범위
    const { data, error } = await supabase
      .from("card_knowledge_scope")
      .update({ status: "confirmed", confirmed_by: me.id, confirmed_at: now })
      .eq("method", "rule")
      .in("status", ["auto", "candidate"])
      .gte("score", min)
      .select("card_id");
    if (error) return { ok: false, message: "확정하지 못했습니다." };
    revalidatePath("/links");
    return { ok: true, message: `점수 ${min} 이상 지적 연결 ${data?.length ?? 0}건을 확정했습니다.` };
  }
  const { data, error } = await supabase.from("task_map").update({ status: "confirmed", confirmed_by: me.id, confirmed_at: now }).eq("status", "draft").eq("draft_status", "같음").select("card_id");
  if (error) return { ok: false, message: "확정하지 못했습니다." };
  revalidatePath("/links");
  return { ok: true, message: `초안 판정 「같음」 과제 대응 ${data?.length ?? 0}건을 확정했습니다.` };
}
