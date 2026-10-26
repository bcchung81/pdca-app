import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { InspectionStatus } from "./model.ts";


/** 붙임2(유관기관 평가보고서 정리) 사례 조각이 적재돼 있는가 — ★사례제안을 AI가 고를 수 있는지 */
export async function peerCasesReady(supabase: SupabaseClient): Promise<boolean> {
  const { count } = await supabase.from("knowledge_chunks").select("chunk_key", { count: "exact", head: true }).eq("unit_type", "peer_case");
  return (count ?? 0) > 0;
}

export interface InspectionRow {
  id: number;
  cardId: string;
  period: string;
  status: InspectionStatus;
  /** 저장된 점검표 jsonb 그대로 — 읽는 쪽이 `readResult`로 정리 */
  result: unknown;
  updatedAt: string;
}

/** 그 달 점검(card_id → 행) */
export async function inspectionsForPeriod(supabase: SupabaseClient, period: string): Promise<Map<string, InspectionRow>> {
  const { data } = await supabase.from("inspections").select("id, card_id, period, status, result, updated_at").eq("period", period);
  return new Map((data ?? []).map((r) => [r.card_id, { id: r.id, cardId: r.card_id, period: r.period, status: r.status, result: r.result, updatedAt: r.updated_at }]));
}

/** receivedInspections select 한 행(card 조인은 객체로도 배열로도 옴) */
interface ReceivedDbRow {
  id: number;
  card_id: string;
  period: string;
  status: InspectionStatus;
  result: unknown;
  updated_at: string;
  card: ReceivedCardJoin | ReceivedCardJoin[];
}
interface ReceivedCardJoin {
  uid: string;
  title: string;
  task_no: string;
  eval_unit_id: string;
  grp: string | null;
}

export interface ReceivedInspection extends InspectionRow {
  card: { uid: string; title: string; taskNo: string; evalUnitId: string; group: string };
}

/** 부서가 받은 점검(보낸 것·확인한 것). 담당자는 RLS로 보낸 것만 보이고, 부서 화면 보기에서도 같게 거릅니다 */
export async function receivedInspections(supabase: SupabaseClient, teamId: number): Promise<ReceivedInspection[]> {
  const { data } = await supabase
    .from("inspections")
    .select("id, card_id, period, status, result, updated_at, card:cards!inner(uid, title, task_no, team_id, eval_unit_id, grp:data->>group)")
    .eq("card.team_id", teamId)
    .neq("status", "draft")
    .order("period", { ascending: false })
    .order("updated_at", { ascending: false });
  return ((data ?? []) as ReceivedDbRow[]).map((r) => {
    const c = Array.isArray(r.card) ? r.card[0] : r.card;
    return {
      id: r.id,
      cardId: r.card_id,
      period: r.period,
      status: r.status,
      result: r.result,
      updatedAt: r.updated_at,
      card: { uid: c.uid, title: c.title, taskNo: c.task_no, evalUnitId: c.eval_unit_id, group: c.grp ?? "" },
    };
  });
}
