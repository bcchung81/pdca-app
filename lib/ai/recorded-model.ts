// 화면이 보낸 모델 표기를 호출 기록과 맞춰 보기: AI 없이 고른 안만 저장하는 경로(경평 구성안 「여러 안 고르기」·초안 「다른 모양으로」 적용)가
// 화면 값으로 출처 표기(어느 모델이 썼나)를 지어내지 못하게, 이 사용자가 이 카드로 최근에 끝낸 그 기능의 호출 기록(ai_requests)과 맞을 때만 남기고 아니면 비움.
// 2026-11-17 여러 안 고르기(outline-actions.ts) → 2026-11-18 「다른 모양으로」 적용도(웹 점검 T3-N3 — 같은 규칙을 이 모듈 하나로)
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordedModelLabel } from "./run.ts";

/** 맞춰 볼 호출 기록 기간 — 여러 안 결과(ai_results)를 두는 7일과 같음 */
export const RECORDED_MODEL_MS = 7 * 86_400_000;

/** 순수: 화면 값이 호출 기록의 모델(recordedModelLabel — 화면 표시와 같은 글) 중 하나와 같으면 그 값(앞뒤 공백 뗌), 아니면 null */
export function matchRecordedModel(label: unknown, recorded: ReadonlyArray<{ model: string | null }>): string | null {
  const want = typeof label === "string" ? label.trim() : "";
  if (!want) return null;
  return recorded.some((r) => r.model && recordedModelLabel(r.model) === want) ? want : null;
}

/** 이 사용자가 이 카드로 최근 7일 안에 끝낸(ok) feature 호출 기록(최근 50건)과 맞춘 모델 표기 — 화면 값이 비면 기록을 읽지 않음 */
export async function recordedModel(db: SupabaseClient, o: { userId: string; cardId: string; feature: string }, label: unknown, now = Date.now()): Promise<string | null> {
  if (typeof label !== "string" || !label.trim()) return null;
  const { data } = await db
    .from("ai_requests")
    .select("model")
    .eq("user_id", o.userId)
    .eq("card_id", o.cardId)
    .eq("feature", o.feature)
    .eq("status", "ok")
    .gte("created_at", new Date(now - RECORDED_MODEL_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(50);
  return matchRecordedModel(label, data ?? []);
}
