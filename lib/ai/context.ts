import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { BUNDLE_COLS, type BundleChunk, type BundlePurpose, type KnowledgeBundle, buildBundle } from "../knowledge/bundle.ts";
import { cachedChunks, storeChunks } from "../knowledge/chunk-cache.ts";
import { MGMT_COMMON_NARRATIVE_KEYS } from "../knowledge/common-narrative.ts";
import { whereWithNote } from "../knowledge/revision-note.ts";
import { type BizLedgerCard, bizTaskId } from "../inspections/biz-links.ts";
import { mgCardAsOf } from "../reports/mg-draft.ts";
import { DEFAULT_TRACK, type TrackId, type TrackSpec, trackSpecOfUnit } from "../tracks/index.ts";
import { loadScopeKeys } from "../prep/scope-queries.ts";
import type { KnowledgeRef } from "./writer.ts";
import type { LooseJson } from "../loose-json.ts";


/** 출처 이름 = 「문서 이름 + 조각 제목」 — 조각 제목이 이미 문서 이름으로 시작하면(관리계획 서술 조각) 겹쳐 쓰지 않음 */
const withDocName = (doc: string, title: string) => (!doc || title.startsWith(doc) ? title : `${doc} ${title}`);

/** 월간 점검 근거 조각 하나의 글 상한(점검 자료 범위는 참고자료 설계에서도 그대로 — 지침 14) */
const PER_CHUNK = 2_500;

/**
 * 이 트랙 요청의 공통 지식 조각 전부(트랙을 안 정하면 주요사업). "all"은 모든 트랙 — 올릴 때 크기 보호처럼 트랙별로 따로 재야 하는 곳이 씀(AI 요청에는 안 씀:
 * 요청에 붙는 조각은 평가단위의 트랙으로 걸러짐, layerOf). 캐시 5분(lib/knowledge/chunk-cache.ts — 모든 로그인 사용자가 같은 것을 읽음),
 * opts.fresh는 캐시를 건너뜀: 올리기 크기 보호는 다른 서버 인스턴스가 방금 올린 문서까지 재야 함(개선 계획 P2-2)
 */
export async function loadBundleChunks(supabase: SupabaseClient, track: TrackSpec | "all" = DEFAULT_TRACK, opts: { fresh?: boolean } = {}): Promise<BundleChunk[]> {
  const key: TrackId | "all" = track === "all" ? "all" : track.id;
  const hit = opts.fresh ? null : cachedChunks<BundleChunk>(key);
  if (hit) return hit;
  const rows: BundleChunk[] = [];
  for (let from = 0; ; from += 1000) {
    const base = supabase.from("knowledge_chunks").select(BUNDLE_COLS);
    const { data, error } = await (track === "all" ? base : base.in("track", [...track.knowledgeTracks])).order("chunk_key").range(from, from + 999);
    if (error) throw new Error(`공통 지식을 읽지 못했습니다(${error.message})`);
    rows.push(...((data ?? []) as BundleChunk[]));
    if ((data ?? []).length < 1000) break;
  }
  storeChunks(key, rows);
  return rows;
}

/**
 * 과제원장 AI·경평 초안이 함께 쓰는 과제별 공통 지식 묶음(참고자료 설계 2단계 — 검색 상위 N건 대신 규칙 범위 전부, 거르지 않음).
 * 과제 대응표(자동·확정, card_knowledge_scope)와 관리계획 과제 목록의 이 과제 행은 목록표로만 알림. 대응표·과제 대응은 로그인 사용자 권한(RLS — 카드를 읽을 수 있는 사람)으로 읽음
 */
export async function loadCardBundle(supabase: SupabaseClient, card: { id: string; evalUnitId: string; knowledgeUnit?: string; data: LooseJson }, purpose: BundlePurpose = "card"): Promise<KnowledgeBundle> {
  const [chunks, linked, { data: task }] = await Promise.all([
    loadBundleChunks(supabase, trackSpecOfUnit(card.evalUnitId)),
    loadScopeKeys(supabase, card.id),
    supabase.from("task_map").select("plan_task_key").eq("card_id", card.id).maybeSingle(),
  ]);
  return buildBundle(chunks, card, linked, task?.plan_task_key ?? null, purpose);
}

/**
 * 월간 점검 근거(지침 14의 붙임1 = 관리계획 발췌)만 모읍니다 — 카드 전용 자료·검색 결과는 넣지 않습니다(설계 §자료 범위).
 *  1) '26 자가진단 체크리스트(주요사업 공통)  2) '25 평가보고서 지적(이 사업 + 공통지표 중 이 사업 계량지표·총평)
 *  3) '26 편람(주요사업 범주: 공통·이 사업·공통지표)  4) 서술 Ⅰ·Ⅱ(plan_section, 주요사업 트랙)  5) 붙임2 유관기관 사례(적재돼 있을 때 — unit_type peer_case)
 * 출처 이름은 「관리계획 + 조각 제목」(지침의 '지식파일명+위치'), 사례는 「붙임2 · 기관명 — 사업명(등급)」.
 */
export async function gatherInspectionKnowledge(supabase: SupabaseClient, evalUnitId: string): Promise<KnowledgeRef[]> {
  const track = trackSpecOfUnit(evalUnitId);
  if (track.id === "경영관리") return gatherMgmtInspectionKnowledge(supabase, evalUnitId);
  const cols = "chunk_key, doc_id, title, unit_type, text, context_prefix, seq, meta";
  const [checklist, comments, handbook, narrative, peers, docs] = await Promise.all([
    supabase.from("knowledge_chunks").select(cols).eq("unit_type", "checklist_group").eq("track", track.id).order("seq"),
    supabase.from("knowledge_chunks").select(cols).eq("unit_type", "evaluator_comment").or(`business.eq.${evalUnitId},chunk_key.like.%/BZ-4/${evalUnitId}/%,chunk_key.like.%/BZ-4/total/%`).order("seq"),
    supabase.from("knowledge_chunks").select(cols).eq("unit_type", "handbook_indicator").or(`business.eq.${evalUnitId},business.eq.BZ-4,chunk_key.like.%/handbook26/common%`).order("seq"),
    // 관리계획 서술 Ⅰ('25 결과·총평·설명회·시사점)·Ⅱ('26 변화·대응방향·착안사항) — 주요사업 트랙만(지침 3순위 근거)
    supabase.from("knowledge_chunks").select(cols).eq("unit_type", "plan_section").eq("track", track.id).order("seq"),
    // 붙임2(유관기관 평가보고서 정리) 사례 — 적재돼 있을 때만(★사례제안의 유일한 원천)
    supabase.from("knowledge_chunks").select(cols).eq("unit_type", "peer_case").order("seq"),
    supabase.from("knowledge_documents").select("doc_id, title"),
  ]);
  const docName = new Map((docs.data ?? []).map((d) => [d.doc_id as string, String(d.title).replace(/^\d{4}년도\s*경영평가\s*/, "").replace(/\(.*\)$/, "").trim()]));
  const out: KnowledgeRef[] = [];
  for (const r of [...(checklist.data ?? []), ...(comments.data ?? []), ...(handbook.data ?? []), ...(narrative.data ?? [])]) {
    if (out.some((x) => x.key === r.chunk_key)) continue;
    const doc = docName.get(r.doc_id) ?? "";
    out.push({ key: r.chunk_key, title: withDocName(doc, r.title), unitType: r.unit_type, text: String(r.text ?? "").slice(0, PER_CHUNK), where: whereWithNote({ chunk_key: r.chunk_key, unit_type: r.unit_type, meta: r.meta as Record<string, unknown> | null, context_prefix: r.context_prefix }) ?? "" });
  }
  // 사례 조각은 제목이 이미 「붙임2 · 기관명 — 사업명(등급)」
  for (const r of peers.data ?? []) out.push({ key: r.chunk_key, title: r.title, unitType: r.unit_type, text: String(r.text ?? "").slice(0, PER_CHUNK), where: String(r.context_prefix ?? ""), meta: (r.meta as Record<string, unknown>) ?? {} });
  return out;
}

/** 핵심공통항목(붙임3) 조각은 지표별 실적 표라 자르면 대조가 틀어지므로 월간 점검 근거 상한(PER_CHUNK)보다 넉넉히 */
const PER_CORE_CHUNK = 8_000;

/**
 * 경영관리 월간 점검 근거(지침 13) — 이 지표(평가단위 MG-N)의 조각과 두 트랙 공통 서술만 모읍니다. 카드 전용 자료·검색 결과는 넣지 않습니다.
 *  1) 붙임1: 관리계획 7월판의 이 지표 자가진단 체크리스트(지적사항 조치계획·고도화 착안사항)·'25 평가보고서 평가위원 의견·'26 편람(이 지표·공통)·서술 Ⅰ·Ⅱ(경영관리 트랙)
 *  2) 붙임3: 핵심공통항목 KCA 작성본의 이 지표 조각(카드 '25 실적 대조용 — 판정 기준이 아님)
 * 붙임2(경영관리판)는 이 앱에 없고, 주요사업 붙임2(peer_case)는 경영관리 사례가 아니라 넣지 않습니다. 붙임4(주요사업 과제관리카드)는 원장 주요사업 카드로 대체(loadBizLedger).
 * 체크리스트 조각은 항목 추출(lib/inspections/checklist.ts)을 위해 meta를 그대로 둡니다.
 */
async function gatherMgmtInspectionKnowledge(supabase: SupabaseClient, unit: string): Promise<KnowledgeRef[]> {
  const cols = "chunk_key, doc_id, title, unit_type, text, context_prefix, seq, meta";
  const [checklist, comments, handbook, narrative, core, docs] = await Promise.all([
    supabase.from("knowledge_chunks").select(cols).eq("unit_type", "checklist_group").eq("track", "경영관리").eq("business", unit).order("seq"),
    supabase.from("knowledge_chunks").select(cols).eq("unit_type", "evaluator_comment").eq("track", "경영관리").eq("business", unit).order("seq"),
    supabase.from("knowledge_chunks").select(cols).eq("unit_type", "handbook_indicator").eq("track", "경영관리").or(`business.eq.${unit},business.is.null`).order("seq"),
    // 서술 Ⅰ·Ⅱ: 경영관리 표시 조각 + 두 트랙에 다 해당하는 공통 서술(주요사업 트랙으로 적재됨 — common-narrative.ts)
    supabase.from("knowledge_chunks").select(cols).eq("unit_type", "plan_section").or(`track.eq.경영관리,chunk_key.in.(${MGMT_COMMON_NARRATIVE_KEYS.map((k) => `"${k}"`).join(",")})`).order("seq"),
    supabase.from("knowledge_chunks").select(cols).eq("unit_type", "core_item").eq("track", "경영관리").eq("business", unit).order("seq"),
    supabase.from("knowledge_documents").select("doc_id, title"),
  ]);
  const docName = new Map((docs.data ?? []).map((d) => [d.doc_id as string, String(d.title).replace(/^\d{4}년도\s*경영평가\s*/, "").replace(/\(.*\)$/, "").trim()]));
  const out: KnowledgeRef[] = [];
  for (const r of [...(checklist.data ?? []), ...(comments.data ?? []), ...(handbook.data ?? []), ...(narrative.data ?? []), ...(core.data ?? [])]) {
    if (out.some((x) => x.key === r.chunk_key)) continue;
    const isCore = r.unit_type === "core_item";
    const doc = isCore ? "" : (docName.get(r.doc_id) ?? "");
    out.push({
      key: r.chunk_key,
      title: withDocName(doc, r.title),
      unitType: r.unit_type,
      text: String(r.text ?? "").slice(0, isCore ? PER_CORE_CHUNK : PER_CHUNK),
      where: whereWithNote({ chunk_key: r.chunk_key, unit_type: r.unit_type, meta: r.meta as Record<string, unknown> | null, context_prefix: r.context_prefix }) ?? "",
      meta: (r.meta as Record<string, unknown>) ?? {},
    });
  }
  return out;
}

/** loadBizLedger select 한 행(data = 카드 JSON — 칸이 많아 넓은 모양 그대로) */
interface BizLedgerDbRow {
  data: LooseJson;
  edition: string | null;
  data_rev: number | null;
  updated_at: string | null;
}

/**
 * 경영관리 월간 점검의 붙임4 자리(2026-10-12 사용자 결정): 원장의 주요사업 카드(보관 제외)의 원장 JSON만 — 카드 전용 자료·부서 작성본·검색 결과는 읽지 않음(금기 4).
 * 서버 액션은 로그인 사용자(성과관리팀) 권한으로 읽음(RLS). 원장 시점은 경평 초안의 카드 시점과 같은 글(mgCardAsOf)
 */
export async function loadBizLedger(supabase: SupabaseClient): Promise<BizLedgerCard[]> {
  const { data, error } = await supabase.from("cards").select("data, edition, data_rev, updated_at, unit:eval_units!inner(track)").eq("unit.track", "주요사업").neq("status", "retired").order("id");
  if (error) throw new Error(`주요사업 원장 카드를 읽지 못했습니다(${error.message})`);
  return ((data ?? []) as BizLedgerDbRow[]).flatMap((r) => {
    const id = bizTaskId(r.data);
    return id ? [{ id, title: String(r.data?.title ?? ""), dept: String(r.data?.deptText || r.data?.department || ""), asOf: mgCardAsOf(r), data: r.data }] : [];
  });
}
