"use server";

import { revalidatePath } from "next/cache";
import { requireAtLeast } from "../../../lib/auth/dal.ts";
import { PREVIEW_WRITE_MSG, previewWriteBlocked } from "../../../lib/auth/preview.ts";
import { logAccess } from "../../../lib/ops/access-log.ts";
import { createClient } from "../../../lib/supabase/server.ts";

export type AiSwitchResult = { ok: true; on: boolean; message: string } | { ok: false; message: string };

const REASON_MAX = 200;

/**
 * AI 일시 중지 켜기·끄기(관리자만 — AI보안 자체점검표 보완계획 1순위, 마이그레이션 20261118140000). 켜면 새 AI 요청이 「관리자가 AI 기능을 잠시 멈췄습니다」로 거절되고
 * (start_ai_request), 과제 매칭 처리기도 작업을 잡지 않음(lib/prep/run.ts). 이미 돌고 있는 호출은 끝까지 감.
 * 최종 판정은 rpc set_ai_paused(표지 + private.is_admin()). 성공하면 접속 기록에 ai_switch 한 줄
 */
export async function setAiPaused(on: boolean, reason: string): Promise<AiSwitchResult> {
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const me = await requireAtLeast("admin", "/admin/usage");
  if (!me) return { ok: false, message: "관리자만 바꿀 수 있습니다." };
  if (typeof on !== "boolean") return { ok: false, message: "입력값을 확인해 주세요." };
  const why = typeof reason === "string" ? reason.trim().slice(0, REASON_MAX) : "";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_ai_paused", { p_on: on, p_reason: on ? why || null : null });
  if (error || !data) {
    console.error("setAiPaused", error?.message ?? "빈 답");
    return { ok: false, message: "바꾸지 못했습니다." };
  }
  await logAccess(supabase, { action: "ai_switch", target: "ai_paused", detail: on ? { on, ...(why ? { reason: why } : {}) } : { on } });
  revalidatePath("/admin/usage");
  return { ok: true, on, message: on ? "AI 기능을 멈췄습니다. 새 AI 요청은 다시 켤 때까지 거절됩니다." : "AI 기능을 다시 켰습니다." };
}
