import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { BUNDLE_COLS, type BundleChunk, type BundlePurpose, type KnowledgeBundle, type LayerId, RULES_DIGEST_UNIT, buildBundle } from "../knowledge/bundle.ts";
import { cachedChunks, storeChunks } from "../knowledge/chunk-cache.ts";
import { MGMT_COMMON_NARRATIVE_KEYS } from "../knowledge/common-narrative.ts";
import { digestChunks, digestTarget } from "../knowledge/rules-digest.ts";
import { CONSULT_UNIT_TYPE } from "../knowledge/usage.ts";
import { whereWithNote } from "../knowledge/revision-note.ts";
import { type CardSelection, SELECT_FEATURES, SELECT_MIN_KEYS, type SelectFeature, applySelection, digestCovers, digestFresh, digestScopeFresh, rolesOf, selectOn, selectTrackOn } from "../knowledge/select.ts";
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
 * 요청에 붙는 조각은 평가단위의 트랙으로 걸러짐, layerOf). 캐시 5분(lib/knowledge/chunk-cache.ts — 공통 지식은 구성원(성과관리팀·관리자, 팀이 지정된 활성 사용자 — DB private.is_member())만 읽고
 * 구성원은 모두 같은 것을 읽음. 이 함수를 부르는 곳은 카드를 읽을 수 있는 AI·경평 경로·관리자 화면·서비스 키 스크립트뿐이라 구성원이고, 빈 결과는 캐시에 안 들어감),
 * opts.fresh는 캐시를 건너뜀: 올리기 크기 보호는 다른 서버 인스턴스가 방금 올린 문서까지 재야 함(개선 계획 P2-2).
 * 외부 컨설팅 의견(consult_comment)은 읽지 않음 — DB가 카드 단위로 읽게 해(20261120090000) 사람마다 결과가 달라 공유 캐시에 두면 안 되고, 공유 층에도 안 들어감.
 * 카드 요청은 loadCardConsult로 그 카드 것만 따로 읽음
 */
export async function loadBundleChunks(supabase: SupabaseClient, track: TrackSpec | "all" = DEFAULT_TRACK, opts: { fresh?: boolean } = {}): Promise<BundleChunk[]> {
  const key: TrackId | "all" = track === "all" ? "all" : track.id;
  const hit = opts.fresh ? null : cachedChunks<BundleChunk>(key);
  if (hit) return hit;
  const rows: BundleChunk[] = [];
  for (let from = 0; ; from += 1000) {
    const base = supabase.from("knowledge_chunks").select(BUNDLE_COLS).neq("unit_type", CONSULT_UNIT_TYPE);
    const { data, error } = await (track === "all" ? base : base.in("track", [...track.knowledgeTracks])).order("chunk_key").range(from, from + 999);
    if (error) throw new Error(`공통 지식을 읽지 못했습니다(${error.message})`);
    rows.push(...((data ?? []) as BundleChunk[]));
    if ((data ?? []).length < 1000) break;
  }
  storeChunks(key, rows);
  return rows;
}

/**
 * 이 카드에 대한 외부 컨설팅 의견 조각(meta.card_ids에 이 카드 id) — 부르는 쪽 권한으로 매번 읽고 캐시하지 않음(로그인 사용자면 RLS가 성과관리팀 이상 또는 이 카드를
 * 읽을 수 있는 사람만 돌려줌 — private.can_read_consult). 묶음은 buildBundle이 card_ids로 한 번 더 거름. 의견은 경영관리 카드에만 있음(주요사업 카드는 0행)
 */
export async function loadCardConsult(supabase: SupabaseClient, cardId: string): Promise<BundleChunk[]> {
  const { data, error } = await supabase.from("knowledge_chunks").select(BUNDLE_COLS).eq("unit_type", CONSULT_UNIT_TYPE).contains("meta", { card_ids: [cardId] }).order("chunk_key");
  if (error) throw new Error(`외부 컨설팅 의견을 읽지 못했습니다(${error.message})`);
  return (data ?? []) as BundleChunk[];
}

/**
 * 과제원장 AI·경평 초안이 함께 쓰는 과제별 공통 지식 묶음(참고자료 설계 2단계 — 검색 상위 N건 대신 규칙 범위 전부, 거르지 않음).
 * 과제 대응표(자동·확정, card_knowledge_scope)와 관리계획 과제 목록의 이 과제 행은 목록표로만 알림. 대응표·과제 대응은 로그인 사용자 권한(RLS — 카드를 읽을 수 있는 사람)으로 읽음.
 * feature = card 용도 안의 기능(작성지원·질문·코멘트) — 선별 방식을 기능 단위로 켤 때(KNOWLEDGE_SELECT=chat 등). 안 넘기면 용도로만 판정.
 * opts.shape = 선별 전 통째로 넣기 묶음을 요청 종류에 맞게 줄이는 함수(작성지원 요청 종류별 자료 범위), opts.select = false면 선별 방식을 쓰지 않음,
 * opts.keepRules = 선별 방식에서도 규칙 문서로 바꾸지 않고 원문으로 둘 기준류(applySelection keepRaw — 작성지원의 지표 기준류). 안 넘기면 예전과 같음
 */
export async function loadCardBundle(
  supabase: SupabaseClient,
  card: { id: string; evalUnitId: string; knowledgeUnit?: string; data: LooseJson },
  purpose: BundlePurpose = "card",
  feature?: SelectFeature,
  opts: { shape?: (b: KnowledgeBundle) => KnowledgeBundle; select?: boolean; keepRules?: (ref: { unitType: string }, layer: LayerId) => boolean } = {},
): Promise<KnowledgeBundle> {
  const [chunks, consult, linked, { data: task }] = await Promise.all([
    loadBundleChunks(supabase, trackSpecOfUnit(card.evalUnitId)),
    loadCardConsult(supabase, card.id),
    loadScopeKeys(supabase, card.id),
    supabase.from("task_map").select("plan_task_key").eq("card_id", card.id).maybeSingle(),
  ]);
  // 이 카드에 대한 외부 컨설팅 의견은 공유 조각(캐시)과 따로 읽어 더함 — buildBundle이 카드별 덩이(consult)로 둠
  const built = buildBundle([...chunks, ...consult], card, linked, task?.plan_task_key ?? null, purpose);
  const b = opts.shape ? opts.shape(built) : built;
  if (opts.select === false) return b;
  const sel = await loadCardSelection(supabase, card, purpose, { chunks }, feature);
  return sel ? applySelection(b, sel, rolesOf(chunks), opts.keepRules) : b;
}

/**
 * 카드 AI 진행 줄용: card 용도 기능 중 이 카드에 선별 방식이 실제로 적용되는 것 → 고른 원문 수(select.picked). 적용되지 않는 기능은 키가 없음(통째로 넣기).
 * 요청 때와 같은 loadCardBundle로 셈(꺼져 있으면 아무것도 읽지 않음). 카드 글은 선별 여부·고른 수에 영향이 없어 원장 카드로 셈.
 * 트랙 설정(KNOWLEDGE_SELECT_TRACKS — 예: 경영관리:chat)이 기능마다 다를 수 있어 트랙 설정 판정이 같은 기능끼리 한 번씩 셈(판정이 같으면 묶음도 같음)
 */
export async function cardSelectPreview(supabase: SupabaseClient, card: { id: string; evalUnitId: string; data: LooseJson }): Promise<Partial<Record<SelectFeature, number>>> {
  const on = SELECT_FEATURES.filter((f) => selectOn(process.env.KNOWLEDGE_SELECT, "card", f));
  const track = trackSpecOfUnit(card.evalUnitId).id;
  const counted = new Map<boolean, number | undefined>();
  const out: Partial<Record<SelectFeature, number>> = {};
  for (const f of on) {
    const gate = selectTrackOn(process.env.KNOWLEDGE_SELECT_TRACKS, track, "card", f);
    if (!counted.has(gate)) counted.set(gate, (await loadCardBundle(supabase, card, "card", f)).select?.picked.length);
    const n = counted.get(gate);
    if (n !== undefined) out[f] = n;
  }
  return out;
}

/**
 * 경평 초안 진행 줄용(구성안·집필·바로 만들기·다른 모양으로 — 모두 loadCardBundle(…, "report")): 이 카드에 선별 방식이 실제로 적용되면 고른 원문 수, 아니면 null(통째로 넣기).
 * 요청 때와 같은 loadCardBundle로 셈(꺼져 있으면 아무것도 읽지 않음)
 */
export async function reportSelectPreview(supabase: SupabaseClient, card: { id: string; evalUnitId: string; data: LooseJson }): Promise<number | null> {
  if (!selectOn(process.env.KNOWLEDGE_SELECT, "report")) return null;
  return (await loadCardBundle(supabase, card, "report")).select?.picked.length ?? null;
}

// ---------------------------------------------------------------------------
// 선별 방식(실험, 기본 꺼짐 — lib/knowledge/select.ts, 환경변수 KNOWLEDGE_SELECT)

/**
 * 카드 하나의 선별 결과를 주는 출처 — unit = 공통 지식 ③을 읽는 평가단위(경영관리는 지표 MG-n), req = 이 요청의 용도·card 용도의 기능(출처가 트랙 설정을 따를 때 씀).
 * null = 이 카드는 통째로 넣기, undefined = 이 출처가 모르는 카드라 기본 DB 출처(dbSelection — 트랙 설정·최소 개수·규칙 문서 검사 그대로)로 넘김
 */
export type SelectionSource = (card: { id: string; evalUnitId: string; unit: string }, req: { purpose: BundlePurpose; feature?: SelectFeature }) => Promise<CardSelection | null | undefined>;

let selectionSource: SelectionSource | null = null;

/**
 * 선별 출처를 꽂음(null이면 기본 DB 출처로 돌아감). 앱 코드는 부르지 않습니다 — 실험 스크립트만(금기 1: 앱 실행 경로에서 로컬 파일을 읽지 않으므로
 * 파일에서 읽는 출처는 앱 코드에 두지 않음)
 */
export function setSelectionSource(src: SelectionSource | null): void {
  selectionSource = src;
}

/**
 * 이 카드의 선별 결과 행(card_knowledge_select, 순위 순)에서 과제 대응표 rejected 조각을 뺀 키. 로그인 사용자 권한(RLS — 카드를 읽을 수 있는 사람).
 * 읽기 오류는 행 없음과 같게(loadScopeKeys와 같은 결 — 통째로 넣기로 돌아감)
 */
async function loadSelectKeys(supabase: SupabaseClient, cardId: string): Promise<string[]> {
  const [{ data: rows }, { data: rejected }] = await Promise.all([
    supabase.from("card_knowledge_select").select("chunk_key, rank").eq("card_id", cardId).order("rank"),
    supabase.from("card_knowledge_scope").select("chunk_key").eq("card_id", cardId).eq("status", "rejected"),
  ]);
  const off = new Set(((rejected ?? []) as Array<{ chunk_key: string }>).map((r) => r.chunk_key));
  return ((rows ?? []) as Array<{ chunk_key: string; rank: number }>)
    .toSorted((a, b) => a.rank - b.rank || a.chunk_key.localeCompare(b.chunk_key))
    .map((r) => r.chunk_key)
    .filter((k) => !off.has(k));
}

/**
 * 기본 출처(DB): 고른 키 = 선별 결과 표(card_knowledge_select, 순위 순 — 대응표 rejected는 뺌), 규칙 문서 = 같은 트랙의 rules_digest 조각(트랙 공통은 사업 없음, 평가단위는 사업 = unit).
 * 대응표 auto·confirmed는 applySelection이 늘 넣음. 다음이면 null(통째로 넣기): 이 트랙의 이 용도·기능이 KNOWLEDGE_SELECT_TRACKS에 없음(selectTrackOn) ·
 * 규칙 문서가 없거나 낡음(freshDigest) · 고른 키가 SELECT_MIN_KEYS개 미만. 기준류를 원문 그대로 두는 트랙(TrackSpec.selectRules = raw — 경영관리)은 규칙 문서를 보지 않고 고른 키만 봄
 */
async function dbSelection(
  supabase: SupabaseClient,
  chunks: BundleChunk[],
  card: { id: string; evalUnitId: string },
  unit: string,
  purpose: BundlePurpose,
  feature?: SelectFeature,
): Promise<CardSelection | null> {
  const spec = trackSpecOfUnit(card.evalUnitId);
  if (!selectTrackOn(process.env.KNOWLEDGE_SELECT_TRACKS, spec.id, purpose, feature)) return null;
  const digest = spec.selectRules === "raw" ? { track: "", unit: "" } : freshDigest(chunks, spec.id, unit);
  if (!digest) return null;
  const keys = await loadSelectKeys(supabase, card.id);
  return keys.length >= SELECT_MIN_KEYS ? { keys, digest } : null;
}

/**
 * 같은 트랙의 공통 규칙 문서 글(트랙 공통·평가단위) — 하나도 없거나 낡으면 null: meta.sources가 지금 원문과 다르거나 원문 조각이 사라짐(digestFresh) ·
 * 범위에 새 기준류 조각이 들어왔거나 빠짐(digestScopeFresh)
 */
function freshDigest(chunks: BundleChunk[], track: TrackId, unit: string): CardSelection["digest"] | null {
  const digestsOf = (business: string | null) =>
    chunks.filter((c) => c.unit_type === RULES_DIGEST_UNIT && c.track === track && c.business === business).sort((a, b) => a.seq - b.seq || a.chunk_key.localeCompare(b.chunk_key));
  const own = { track: digestsOf(null), unit: digestsOf(unit) };
  const text = (xs: BundleChunk[]) => xs.map((c) => String(c.text ?? "")).join("\n\n");
  const digest = { track: text(own.track), unit: text(own.unit) };
  if (!digest.track.trim() && !digest.unit.trim()) return null;
  if (!digestFresh([...own.track, ...own.unit], chunks)) return null;
  // 범위에 새 기준류 조각이 들어왔거나 빠졌는지도 봄 — 계산이 안 되는 범위(모르는 평가단위·층 불일치)는 낡음으로
  try {
    if (!digestScopeFresh(own.track, digestChunks(chunks, digestTarget(track === "경영관리" ? "track-mg" : "track-biz")))) return null;
    if (!digestScopeFresh(own.unit, own.unit.length ? digestChunks(chunks, digestTarget(unit)) : [])) return null;
  } catch {
    return null;
  }
  return digest;
}

/**
 * 이 요청을 선별 방식으로 할 때의 선별 결과(아니면 null — 통째로 넣기). 용도(또는 card 용도의 그 기능)가 KNOWLEDGE_SELECT에 들고, 출처(꽂힌 것 우선 — 그 출처가 모르는 카드(undefined)면 DB)가
 * 결과를 주고, 규칙 문서가 이 평가단위의 기준류 자리를 모두 대신할 때만(digestCovers — 반쪽 선별 안 함). pre = 이미 읽은 조각(다시 읽지 않게)
 */
export async function loadCardSelection(
  supabase: SupabaseClient,
  card: { id: string; evalUnitId: string; knowledgeUnit?: string },
  purpose: BundlePurpose,
  pre: { chunks?: BundleChunk[] } = {},
  feature?: SelectFeature,
): Promise<CardSelection | null> {
  if (!selectOn(process.env.KNOWLEDGE_SELECT, purpose, feature)) return null;
  const unit = card.knowledgeUnit ?? card.evalUnitId;
  const chunks = pre.chunks ?? (await loadBundleChunks(supabase, trackSpecOfUnit(card.evalUnitId)));
  const plugged = selectionSource ? await selectionSource({ id: card.id, evalUnitId: card.evalUnitId, unit }, { purpose, feature }) : undefined;
  const sel = plugged !== undefined ? plugged : await dbSelection(supabase, chunks, card, unit, purpose, feature);
  return sel && digestCovers(chunks, unit, purpose, sel) ? sel : null;
}

/**
 * 월간 점검 근거(지침 14의 붙임1 = 관리계획 발췌)만 모읍니다 — 카드 전용 자료·검색 결과는 넣지 않습니다(설계 §자료 범위).
 *  1) '26 자가진단 체크리스트(주요사업 공통)  2) '25 평가보고서 지적(이 사업 + 공통지표 중 이 사업 계량지표·총평)
 *  3) '26 편람(주요사업 범주: 공통·이 사업·공통지표 — 편람 수정본 hb26r-2611 조각도 같은 유형·사업이라 같이 옴)  4) 서술 Ⅰ·Ⅱ(plan_section, 주요사업 트랙)  5) 붙임2 유관기관 사례(적재돼 있을 때 — unit_type peer_case)
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
 *  1) 붙임1: 관리계획 7월판의 이 지표 자가진단 체크리스트(지적사항 조치계획·고도화 착안사항)·'25 평가보고서 평가위원 의견·'26 편람(이 지표·공통, 편람 수정본 조각 포함)·서술 Ⅰ·Ⅱ(경영관리 트랙)
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
