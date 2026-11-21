// 과제원장 AI 작성지원 한 요청의 근거 모으기 — 서버 액션(app/(app)/cards/actions.ts runCardAssist)과 평가 실행기(scripts/eval/writer-run.ts)가 같은 함수를 씀.
// 최근 점검표 읽기 + 요청 종류별 자료 범위(lib/knowledge/mode-profile.ts) + 공통 지식 묶음(lib/ai/context.ts loadCardBundle) + 요청 글의 점검표 요약(writer-inspection.ts)

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCardBundle } from "./context.ts";
import { assistInspectionBrief } from "./writer-inspection.ts";
import type { WriterMode } from "./writer.ts";
import { type InspectionResult, readResult } from "../inspections/model.ts";
import type { KnowledgeBundle } from "../knowledge/bundle.ts";
import { writerBundleOpts, writerScope } from "../knowledge/mode-profile.ts";
import { trackSpecOfUnit } from "../tracks/index.ts";
import type { LooseJson } from "../loose-json.ts";

export interface LatestInspection {
  period: string;
  status: string;
  result: InspectionResult;
}

/** 이 과제의 최종 점검표 — 보낸·확인한 것 중 점검월이 가장 늦은 1건(초안 제외, 질문·보완 점검과 같은 규칙). 부르는 쪽 권한(RLS — 부서 담당자는 받은 것만) */
export async function latestInspection(supabase: SupabaseClient, cardId: string): Promise<LatestInspection | null> {
  const { data: ins } = await supabase.from("inspections").select("period, status, result").eq("card_id", cardId).neq("status", "draft").order("period", { ascending: false }).limit(1).maybeSingle();
  return ins ? { period: ins.period, status: ins.status, result: readResult(ins.result) } : null;
}

/**
 * 작성지원 한 요청의 공통 지식 묶음(요청 종류 × 점검표 유무의 자료 범위 — 선별 방식이면 범위를 줄인 뒤 고름, 실적 반영은 선별 안 씀)과
 * 요청 글에 넣는 최근 점검표 요약(개선 제안·실적 발굴·실적 반영이고 점검표가 있을 때만, 아니면 null). ins = latestInspection 결과
 */
export async function loadWriterKnowledge(
  supabase: SupabaseClient,
  card: { id: string; evalUnitId: string; data: LooseJson },
  mode: WriterMode,
  ins: LatestInspection | null,
): Promise<{ kb: KnowledgeBundle; inspection: string | null }> {
  const scope = writerScope(mode, ins !== null, trackSpecOfUnit(card.evalUnitId));
  const kb = await loadCardBundle(supabase, card, "card", "writer", writerBundleOpts(scope));
  return { kb, inspection: scope.inspection && ins ? assistInspectionBrief(ins) : null };
}
