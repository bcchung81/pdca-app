// 과제별 공통 지식 근거 묶음(참고자료 설계 2단계 — docs/reference-materials.md §4.2·§4.3, 결정 D1·D17). 순수 함수.
// 검색 상위 N건 대신 규칙 범위 전부를 넣습니다: 기관 공통 + 공통지표(BZ-4)·사업 미지정 + 이 사업 공통 + 과제 고유(관리계획 과제 목록의 이 과제 행).
// 과제 대응표(card_knowledge_scope)·닮은 정도는 거르는 데 쓰지 않고 카드별 목록표(「이 과제 해당」·「닮은 순」)로만 알립니다.
// 공유 층(①②는 모든 과제, ③은 같은 사업)은 카드와 상관없는 고정 순서라 같은 사업 카드끼리 앞부분이 바이트까지 같아 캐시를 나눠 씁니다.

import { type KnowledgeRef, knowledgeBlock } from "../ai/writer.ts";
import { type PromptSet, fillFrom } from "../prompts/template.ts";
import { SCOPE_UNIT_TYPES } from "../prep/scope.ts";
import { rankSimilar } from "../reports/prior.ts";
import { sharedBlock } from "./compact.ts";
import { commonKpiOwner } from "./common-kpi-owner.ts";
import { BUSINESSES } from "./dictionaries.ts";
import { whereWithNote } from "./revision-note.ts";
import { trackSpecOfUnit } from "../tracks/index.ts";
import { MGMT_INDICATORS } from "../tracks/mgmt-units.ts";
import { REPORT_METHOD_USAGE } from "./usage.ts";
import type { LooseJson } from "../loose-json.ts";


/** 묶음에 쓰는 조각 칸(knowledge_chunks) */
export interface BundleChunk {
  chunk_key: string;
  doc_id: string;
  seq: number;
  unit_type: string;
  track: string;
  business: string | null;
  title: string;
  text: string | null;
  context_prefix: string | null;
  meta: Record<string, unknown> | null;
}

export const BUNDLE_COLS = "chunk_key, doc_id, seq, unit_type, track, business, title, text, context_prefix, meta";

/** 공유 층: ① 기관 공통 ② 공통지표(사업에 속하지 않는 조각)·사업 미지정(①②는 모든 과제 같음 — 앞에 둠) ③ 이 사업 공통(이 사업 지표에 관한 공통지표 조각 포함) */
export type LayerId = "institution" | "common" | "business";
export const LAYER_ORDER: LayerId[] = ["institution", "common", "business"];

/** 공통지표 평가단위 */
export const COMMON_KPI_UNIT = "BZ-4";
/** 붙임2 유관기관 사례는 지침 09·14대로 B+·B0 사업만(KCA 행 제외) */
const PEER_GRADES = new Set(["B+", "B0"]);
/** 층 안 순서(문서) — 여기 없는 문서는 뒤에 doc_id 순. 층 안에서는 문서 → 적재 순서(seq)로 고정 */
export const DOC_ORDER = ["plan-2607", "goal30-2605", "ceo24-2605", "ax26-2605", "peer25-biz", "att3-2604", "mid25-biz", "pool25-biz", "rpt25-biz"];

/** 묶음을 어느 요청에 붙이는지 — card = 과제원장 AI(작성지원·질문·코멘트)·과제 매칭·크기 보호의 기본, report = 경평 초안(구성안·집필·블록 고치기) */
export type BundlePurpose = "card" | "report";
/** 조각이 어느 공유 층인지(범위 밖이면 null). 과제 목록 행은 과제 고유라 층에 넣지 않음 */
export function layerOf(c: BundleChunk, unit: string, purpose: BundlePurpose = "card"): LayerId | null {
  if (c.meta?.search_only === true) return null; // 화면 검색에만 나오는 일반 문서(5단계 「검색 전용」) — AI 근거·매칭·닮은 순에 안 넣음
  if (c.meta?.usage === REPORT_METHOD_USAGE) return purpose === "report" ? "institution" : null; // 경평 초안 작성 방법론 — 경평 초안에서만, 사업과 상관없이 모든 과제에 같은 글
  if (!trackSpecOfUnit(unit).knowledgeTracks.includes(c.track) || c.unit_type === "task_list_row") return null; // 이 평가단위 트랙의 조각만(주요사업 과제에는 경영관리 트랙이 범위 밖)
  if (c.unit_type === "peer_case" && (c.meta?.kca || !PEER_GRADES.has(String(c.meta?.grade ?? "")))) return null;
  if (c.business === COMMON_KPI_UNIT) {
    // 공통지표 조각은 지표가 속한 주요사업을 알면 그 사업의 ③에만 넣고(다른 사업 지표의 조각은 이 과제와 무관해 뺌), 모르면(총평·편람 등) 모든 과제 ②에 둠
    const owner = commonKpiOwner(c);
    return owner === null ? "common" : owner === unit ? "business" : null;
  }
  if (c.business == null && c.track === "가점") return "common";
  if (c.business == null) return "institution";
  return c.business === unit ? "business" : null;
}

const docRank = (id: string) => {
  const i = DOC_ORDER.indexOf(id);
  return i < 0 ? DOC_ORDER.length : i;
};

/** 조각 → 근거(글은 자르지 않음) */
export function chunkRef(c: BundleChunk): KnowledgeRef {
  return { key: c.chunk_key, title: c.title, unitType: c.unit_type, text: String(c.text ?? ""), where: whereWithNote(c), ...(c.unit_type === "peer_case" ? { meta: c.meta ?? {} } : {}) };
}

export interface KnowledgeLayer {
  id: LayerId;
  refs: KnowledgeRef[];
}

/** 카드별 목록표 재료 — 거르지 않고 관계·순서만 알림 */
export interface BundleList {
  /** 이 과제 해당: 과제 연결(자동·확정 — 확정 전 초안도 씀, D5) 중 공유 층에 있는 조각 */
  relevant: string[];
  /** 관리계획 과제 목록의 이 과제 행(task_map.plan_task_key) — 과제 고유 */
  taskRow: KnowledgeRef | null;
  /** 이 과제와 닮은 순 — 붙임2 사례(B+·B0) */
  peers: string[];
  /** 이 과제와 닮은 순 — 이 사업 2025 경영실적보고서 절 */
  prior: string[];
  /** 이 과제와 닮은 순 — 실사 질의·요청·평가위원 의견·지적·전년 절·Pool·AX 중 앞 SIMILAR_MAX건(글자 겹침으로 요청 때 계산 — 미리 분석하지 않음) */
  similar: string[];
}

/** 「닮은 순」 전체 목록에 싣는 건수 — 정답 조각의 88%가 상위 30건 안(55장 실측, 2026-09-30 `scripts/eval/rank-recall.ts`) */
export const SIMILAR_MAX = 30;

export interface KnowledgeBundle {
  unit: string;
  layers: KnowledgeLayer[];
  list: BundleList;
}

/** 묶음 중 이 과제에 연결된 조각(목록표 「이 과제 해당」 — 자동·확정) — 경평 초안 숫자 근거(lib/reports/section.ts draftEvidence) */
export function relevantRefs(b: KnowledgeBundle): KnowledgeRef[] {
  const rel = new Set(b.list.relevant);
  return b.layers.flatMap((l) => l.refs).filter((r) => rel.has(r.key));
}

/**
 * 규칙 범위 묶음 만들기. chunks = 적재된 조각 전부(순서 무관), linked = 이 카드에 연결된 조각 키, taskRowKey = task_map.plan_task_key.
 * 공유 층은 unit(주요사업)과 조각만으로 정해져 카드가 달라도 같음
 */
export function buildBundle(chunks: BundleChunk[], card: { evalUnitId: string; knowledgeUnit?: string; data: LooseJson }, linked: string[] = [], taskRowKey: string | null = null, purpose: BundlePurpose = "card"): KnowledgeBundle {
  // ③ 이 평가단위 공통을 읽는 단위 — 주요사업은 카드의 평가단위(사업) 그대로, 경영관리는 카드 묶음(MG-G…)이 아니라 카드가 속한 지표(MG-n)를 호출하는 쪽이 knowledgeUnit으로 넘김
  const unit = card.knowledgeUnit ?? card.evalUnitId;
  const byLayer = new Map<LayerId, BundleChunk[]>(LAYER_ORDER.map((id) => [id, []]));
  for (const c of chunks) {
    const id = layerOf(c, unit, purpose);
    if (id) byLayer.get(id)!.push(c);
  }
  const layers = LAYER_ORDER.map((id) => ({
    id,
    refs: byLayer
      .get(id)!
      .sort((a, b) => docRank(a.doc_id) - docRank(b.doc_id) || a.doc_id.localeCompare(b.doc_id) || a.seq - b.seq || a.chunk_key.localeCompare(b.chunk_key))
      .map(chunkRef),
  }));
  const inLayers = new Set(layers.flatMap((l) => l.refs.map((r) => r.key)));
  const all = layers.flatMap((l) => l.refs);
  const row = taskRowKey ? chunks.find((c) => c.chunk_key === taskRowKey && c.unit_type === "task_list_row") : undefined;
  const similar = (unitType: string) =>
    rankSimilar(
      card.data,
      all.filter((r) => r.unitType === unitType).map((r) => ({ key: r.key, head: r.title, text: r.text })),
    ).map((x) => x.key);
  // 대응표 대상 종류 전체를 한 줄로 견줌 — 사전 분석 없이 카드 글과 조각 글만으로 요청 때마다 계산(순서·강조용, 거르지 않음)
  const scoped = all.filter((r) => SCOPE_UNIT_TYPES.includes(r.unitType));
  return {
    unit,
    layers,
    list: {
      relevant: [...new Set(linked)].filter((k) => inLayers.has(k)),
      taskRow: row ? chunkRef(row) : null,
      peers: similar("peer_case"),
      prior: similar("report_section"),
      similar: rankSimilar(card.data, scoped.map((r) => ({ key: r.key, head: r.title, text: r.text }))).slice(0, SIMILAR_MAX).map((x) => x.key),
    },
  };
}

/** 인용 대조에 쓰는 근거 전부(공유 층 + 과제 목록 행) */
export function bundleRefs(b: KnowledgeBundle): KnowledgeRef[] {
  return [...b.layers.flatMap((l) => l.refs), ...(b.list.taskRow ? [b.list.taskRow] : [])];
}

// ---------------------------------------------------------------------------
// 프롬프트 글(문구는 resources/prompts/_shared/knowledge.md — 기능마다 request.md의 kb.* 절로 끼움)

export { KB_SECTIONS } from "./kb-sections.ts";

const unitName = (unit: string) => {
  const b = BUSINESSES.find((x) => x.id === unit);
  if (b) return `주요사업${unit.replace(/^BZ-/, "")} ${b.name2026}`;
  const m = MGMT_INDICATORS.find((x) => x.id === unit);
  return m ? `경영관리 지표${m.no} ${m.name}` : unit;
};

/**
 * 요청 앞에 따로 붙이는 공유 층 글 두 덩이: [①기관 공통 + ②공통지표·사업 미지정(모든 과제 같음), ③이 사업 공통(같은 사업 같음)].
 * API는 덩이마다 캐시 표지를 둡니다. 카드에 따라 달라지는 것은 넣지 않음(목록표는 listText)
 */
export function sharedTexts(p: PromptSet, b: KnowledgeBundle): string[] {
  const blocks = layerBlocks(b.layers);
  const text = (l: KnowledgeLayer) => (l.refs.length ? `${fillFrom(p, "request", `kb.${l.id}`, { count: l.refs.length, business: unitName(b.unit) })}\n${blocks[l.id]}` : "");
  const [institution, common, business] = LAYER_ORDER.map((id) => b.layers.find((l) => l.id === id) ?? { id, refs: [] });
  return [[text(institution), text(common)].filter(Boolean).join("\n\n"), text(business)].filter(Boolean);
}

/** 층마다 모델이 읽는 근거 글(같은 글을 덜 반복하는 정리 — lib/knowledge/compact.ts). 중복 조각은 같은 덩이와 앞 덩이의 조각만 가리킴 */
export function layerBlocks(layers: KnowledgeLayer[]): Record<LayerId, string> {
  const refs = (id: LayerId) => layers.find((l) => l.id === id)?.refs ?? [];
  const first = [...refs("institution"), ...refs("common")];
  return {
    institution: refs("institution").length ? sharedBlock(refs("institution"), { tag: "A", pool: first }) : "",
    common: refs("common").length ? sharedBlock(refs("common"), { tag: "B", pool: first }) : "",
    business: refs("business").length ? sharedBlock(refs("business"), { tag: "C", pool: [...first, ...refs("business")] }) : "",
  };
}

/** 요청 글에 넣는 이 과제 기준 목록(이 과제 해당·닮은 순·과제 목록 행) */
export function listText(p: PromptSet, b: KnowledgeBundle): string {
  const ids = (xs: string[]) => (xs.length ? xs.join(", ") : fillFrom(p, "request", "kb.none"));
  const out = [fillFrom(p, "request", "kb.list", { relevant: ids(b.list.relevant), peers: ids(b.list.peers), prior: ids(b.list.prior), similar: ids(b.list.similar), similarMax: SIMILAR_MAX })];
  if (b.list.taskRow) out.push(fillFrom(p, "request", "kb.taskRow"), knowledgeBlock([b.list.taskRow]));
  return out.join("\n");
}
