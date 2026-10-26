import "server-only";

// 경평 초안 「평가 기준·평가위원 관점」 근거 읽기 — 로그인 사용자 권한(공통 지식은 모두 읽음). 고르기 규칙은 lens.ts(순수)
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadBundleChunks, loadCardSelection } from "../ai/context.ts";
import { layerOf } from "../knowledge/bundle.ts";
import { buildSearchQuery } from "../knowledge/search-query.ts";
import { selectPurposes } from "../knowledge/select.ts";
import { trackSpecOfUnit } from "../tracks/index.ts";
import { loadScopeKeys } from "../prep/scope-queries.ts";
import { CRITIQUE_TYPES, LENS_CRITERIA_KEYS, type LensRef, type LensRow, MG_LENS_CRITERIA_KEYS, SURVEY_TYPES, lensTopic, pickLens } from "./lens.ts";

const COLS = "chunk_key, title, unit_type, text, context_prefix, meta";

/**
 * 공통 지식 선별 방식(실험, KNOWLEDGE_SELECT에 report)이 이 카드에 선별을 냈으면 고른 조각 중 지적·실사 조각(고른 순서) — 검색 순(searched)을 대신함.
 * 꺼져 있거나 선별이 없으면 null(검색 순 그대로)
 */
async function selectedLensRows(supabase: SupabaseClient, card: { id: string; evalUnitId: string }): Promise<LensRow[] | null> {
  if (!selectPurposes(process.env.KNOWLEDGE_SELECT).has("report")) return null;
  const chunks = await loadBundleChunks(supabase, trackSpecOfUnit(card.evalUnitId));
  const sel = await loadCardSelection(supabase, card, "report", { chunks });
  if (!sel) return null;
  const types: readonly string[] = [...CRITIQUE_TYPES, ...SURVEY_TYPES];
  const byKey = new Map(chunks.filter((c) => types.includes(c.unit_type) && layerOf(c, card.evalUnitId, "report")).map((c) => [c.chunk_key, c]));
  return sel.keys.flatMap((k) => byKey.get(k) ?? []);
}

/**
 * 카드 1장의 평가 근거: 평가 기준(고정 조각) · 이 카드에 연결된 지적·실사(자동·확정) · 이 사업 '25 평가보고서 「집행」 의견 ·
 * 과제명·계량지표·지적으로 찾은 이 사업의 지적·실사 · 붙임2 사례(적재돼 있을 때)
 */
export async function loadLens(supabase: SupabaseClient, card: { id: string; evalUnitId: string; data: unknown }): Promise<LensRef[]> {
  if (card.evalUnitId.startsWith("MG-")) return loadLensMg(supabase, card);
  const topic = lensTopic(card.data as Record<string, unknown>);
  const q = buildSearchQuery(topic, "any");
  const [criteria, linkedByScope, execution, peers, found, selected] = await Promise.all([
    supabase.from("knowledge_chunks").select(COLS).in("chunk_key", [...LENS_CRITERIA_KEYS]),
    loadScopeKeys(supabase, card.id, [...CRITIQUE_TYPES, ...SURVEY_TYPES]),
    // 평가내용2 = '25 평가보고서의 「집행」 의견(eval25/<사업>/e2)
    supabase.from("knowledge_chunks").select(COLS).eq("unit_type", "evaluator_comment").like("chunk_key", `%/eval25/${card.evalUnitId}/e2/%`).order("seq"),
    supabase.from("knowledge_chunks").select(COLS).eq("unit_type", "peer_case").order("seq"),
    q ? supabase.rpc("search_knowledge", { query: q, businesses: [card.evalUnitId], unit_types: [...CRITIQUE_TYPES, ...SURVEY_TYPES], max_rows: 12 }) : Promise.resolve({ data: [] }),
    selectedLensRows(supabase, card),
  ]);
  const linkedKeys = linkedByScope;
  const foundKeys = ((found.data as Array<{ chunk_key: string }> | null) ?? []).map((r) => r.chunk_key);
  const extra = [...new Set([...linkedKeys, ...foundKeys])];
  const rows: LensRow[] = extra.length ? (((await supabase.from("knowledge_chunks").select(COLS).in("chunk_key", extra)).data ?? []) as LensRow[]) : [];
  const byKey = (keys: string[]) => keys.flatMap((k) => rows.filter((r) => r.chunk_key === k).slice(0, 1));
  return pickLens({
    criteria: (criteria.data ?? []) as LensRow[],
    linked: byKey(linkedKeys),
    execution: (execution.data ?? []) as LensRow[],
    searched: selected ?? byKey(foundKeys),
    peers: (peers.data ?? []) as LensRow[],
  });
}

/**
 * 경영관리 카드의 평가 근거(설계 §4.3): 평가 기준 = 그 지표 '26 편람 조각(handbook26/MG-N/k*) + '25 경영관리 총평 + 보고서 작성 착안사항 ·
 * 지적 = 이 카드에 연결된 것 → 그 지표 '25 평가보고서 평가위원 의견(eval25/MG-N) → 중간보고서 지적(mid25-mg/MG-N) → 검색 · 실사 = 연결 → 검색.
 * 붙임2 경영관리판이 없어 유관기관 사례는 넣지 않음
 */
async function loadLensMg(supabase: SupabaseClient, card: { id: string; evalUnitId: string; data: unknown }): Promise<LensRef[]> {
  const unit = card.evalUnitId;
  const q = buildSearchQuery(lensTopic(card.data as Record<string, unknown>), "any");
  const [handbook, common, linkedKeys, evaluator, mid, found, selected] = await Promise.all([
    supabase.from("knowledge_chunks").select(COLS).like("chunk_key", `plan-2607/handbook26/${unit}/%`).order("seq"),
    supabase.from("knowledge_chunks").select(COLS).in("chunk_key", [...MG_LENS_CRITERIA_KEYS]),
    loadScopeKeys(supabase, card.id, [...CRITIQUE_TYPES, ...SURVEY_TYPES]),
    supabase.from("knowledge_chunks").select(COLS).eq("unit_type", "evaluator_comment").like("chunk_key", `plan-2607/eval25/${unit}/%`).order("seq"),
    supabase.from("knowledge_chunks").select(COLS).eq("unit_type", "finding_row").like("chunk_key", `mid25-mg/${unit}/%`).order("seq"),
    q ? supabase.rpc("search_knowledge", { query: q, businesses: [unit], unit_types: [...CRITIQUE_TYPES, ...SURVEY_TYPES], max_rows: 12 }) : Promise.resolve({ data: [] }),
    selectedLensRows(supabase, card),
  ]);
  const foundKeys = ((found.data as Array<{ chunk_key: string }> | null) ?? []).map((r) => r.chunk_key);
  const extra = [...new Set([...linkedKeys, ...foundKeys])];
  const rows: LensRow[] = extra.length ? (((await supabase.from("knowledge_chunks").select(COLS).in("chunk_key", extra)).data ?? []) as LensRow[]) : [];
  const byKey = (keys: string[]) => keys.flatMap((k) => rows.filter((r) => r.chunk_key === k).slice(0, 1));
  const hb = (handbook.data ?? []) as LensRow[];
  return pickLens({
    criteria: [...hb, ...((common.data ?? []) as LensRow[])],
    criteriaOrder: [...hb.map((r) => r.chunk_key), ...MG_LENS_CRITERIA_KEYS],
    linked: byKey(linkedKeys),
    execution: [...((evaluator.data ?? []) as LensRow[]), ...((mid.data ?? []) as LensRow[])],
    searched: selected ?? byKey(foundKeys),
    peers: [],
  });
}
