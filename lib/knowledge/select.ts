// 공통 지식 선별 방식(실험, 기본 꺼짐 — 지식공급 하이브리드 선별 계획 §4.1·6단계). 순수 함수.
// 통째로 넣기 묶음(buildBundle)을 받아 기준류(rule)는 공통 규칙 문서로, 사례류(critique·survey·prior·case)는 이 카드에 고른 원문 + 제목 목록으로 바꿉니다.
// 작성 방법론·실적 근거·기타(method·evidence·other)는 원래 층에 원문 그대로 둡니다(요구사항 R1 「빠짐없이」의 안전장치 — chunk-role.ts).
// 인용·숫자 대조는 선별 전 원문 전부(select.all)로 합니다(bundle.ts bundleRefs·relevantRefs).

import { type BundleChunk, type BundlePurpose, type KnowledgeBundle, layerOf } from "./bundle.ts";
import { type ChunkRole, DIGEST_ROLES, SELECTABLE_ROLES, chunkRole } from "./chunk-role.ts";

/** 선별 방식을 켜는 환경변수 — 쉼표 목록 "card,report"(비면 모두 통째로 넣기) */
export const SELECT_ENV_KEY = "KNOWLEDGE_SELECT";

const PURPOSES: readonly BundlePurpose[] = ["card", "report"];

/** 환경변수 값 → 선별 방식으로 할 용도. 비거나 모르는 값은 무시 */
export function selectPurposes(env: string | undefined): Set<BundlePurpose> {
  const out = new Set<BundlePurpose>();
  for (const raw of (env ?? "").split(",")) {
    const v = raw.trim().toLowerCase();
    const hit = PURPOSES.find((p) => p === v);
    if (hit) out.add(hit);
  }
  return out;
}

/** 한 카드의 선별 결과 — keys = 고른 사례류 조각 키(순서 = 순위), digest = 공통 규칙 문서 글(track = 트랙 공통 ①②, unit = 평가단위 ③) */
export interface CardSelection {
  keys: string[];
  digest: { track: string; unit: string };
}

const isDigest = (r: ChunkRole | undefined) => r !== undefined && DIGEST_ROLES.includes(r);
const isSelectable = (r: ChunkRole | undefined) => r !== undefined && SELECTABLE_ROLES.includes(r);

/**
 * 규칙 문서가 빠진 기준류를 대신할 수 있는지 — 이 평가단위 층에 기준류가 있는데 그 자리 규칙 문서가 비면 false(조용히 반쪽 선별하지 않고 통째로 넣기로 둠).
 * ①② 기준류는 트랙 공통 글, ③ 기준류는 평가단위 글이 있어야 함
 */
export function digestCovers(chunks: BundleChunk[], unit: string, purpose: BundlePurpose, sel: CardSelection): boolean {
  let shared = false;
  let own = false;
  for (const c of chunks) {
    if (!isDigest(chunkRole(c))) continue;
    const layer = layerOf(c, unit, purpose);
    if (layer === "business") own = true;
    else if (layer) shared = true;
  }
  return (!shared || sel.digest.track.trim() !== "") && (!own || sel.digest.unit.trim() !== "");
}

/** 조각 키 → 성격(묶음에 든 조각만 있으면 됨) */
export function rolesOf(chunks: BundleChunk[]): Map<string, ChunkRole> {
  return new Map(chunks.map((c) => [c.chunk_key, chunkRole(c)]));
}

/**
 * 통째로 넣기 묶음 → 선별 방식 묶음. 층에서 기준류·사례류를 빼고(나머지는 그대로), 사례류는 (sel.keys ∪ 과제 연결)에 든 것만 원문으로 고름 —
 * 과제 연결(자동·확정)은 늘 넣음. 순서 = sel.keys 순서, 그 뒤 연결 중 남은 것. 목록표 키는 요청에 원문이 든 조각만 남김(모델이 못 받은 키를 가리키지 않게)
 */
export function applySelection(b: KnowledgeBundle, sel: CardSelection, roles: Map<string, ChunkRole>): KnowledgeBundle {
  const all = b.layers.flatMap((l) => l.refs);
  const selectable = new Map(all.filter((r) => isSelectable(roles.get(r.key))).map((r) => [r.key, r]));
  const order = [...new Set([...sel.keys, ...b.list.relevant])].filter((k) => selectable.has(k));
  const picked = order.map((k) => selectable.get(k)!);
  const pickedKeys = new Set(order);
  const unpicked = [...selectable.values()].filter((r) => !pickedKeys.has(r.key)).map((r) => ({ key: r.key, title: r.title, unitType: r.unitType }));
  const layers = b.layers.map((l) => ({ id: l.id, refs: l.refs.filter((r) => !isDigest(roles.get(r.key)) && !isSelectable(roles.get(r.key))) }));
  const inRequest = new Set([...layers.flatMap((l) => l.refs.map((r) => r.key)), ...order]);
  const keep = (xs: string[]) => xs.filter((k) => inRequest.has(k));
  return {
    unit: b.unit,
    layers,
    list: { relevant: keep(b.list.relevant), taskRow: b.list.taskRow, peers: keep(b.list.peers), prior: keep(b.list.prior), similar: keep(b.list.similar) },
    select: { picked, unpicked, all, relevant: b.list.relevant, digest: sel.digest },
  };
}
