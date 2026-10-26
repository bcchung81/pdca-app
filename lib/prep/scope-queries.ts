import "server-only";

// 과제 대응표(card_knowledge_scope) 읽기 — 로그인 사용자 권한(RLS: 카드를 읽을 수 있는 사람). 고르는 규칙은 scope.ts(순수)
import type { SupabaseClient } from "@supabase/supabase-js";
import { displayKeys } from "./scope.ts";
import type { ScopeRow } from "./types.ts";

/**
 * 이 과제에 「해당」으로 표시할 조각 키(auto·confirmed, 순위 순). 거르는 데 쓰지 않음.
 * unitTypes를 주면 그 유형의 조각만(경평 평가 근거처럼 특정 유형만 쓰는 곳)
 */
export async function loadScopeKeys(supabase: SupabaseClient, cardId: string, unitTypes?: readonly string[]): Promise<string[]> {
  const query = unitTypes
    ? supabase
        .from("card_knowledge_scope")
        .select("card_id, chunk_key, status, method, score, rank, basis, chunk:knowledge_chunks!inner(unit_type)")
        .in("chunk.unit_type", [...unitTypes])
    : supabase.from("card_knowledge_scope").select("card_id, chunk_key, status, method, score, rank, basis");
  const { data } = await query.eq("card_id", cardId).in("status", ["auto", "confirmed"]);
  return displayKeys((data ?? []) as unknown as ScopeRow[]);
}
