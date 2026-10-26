// 공통 지식 선별 방식(실험, 기본 꺼짐 — 지식공급 하이브리드 선별 계획 §4.1·6단계). 순수 함수.
// 통째로 넣기 묶음(buildBundle)을 받아 기준류(rule)는 공통 규칙 문서로, 사례류(critique·survey·prior·case)는 이 카드에 고른 원문 + 제목 목록으로 바꿉니다.
// 작성 방법론·실적 근거·기타(method·evidence·other)는 원래 층에 원문 그대로 둡니다(요구사항 R1 「빠짐없이」의 안전장치 — chunk-role.ts).
// 인용·숫자 대조는 선별 전 원문 전부(select.all)로 합니다(bundle.ts bundleRefs·relevantRefs).

import { type BundleChunk, type BundlePurpose, type KnowledgeBundle, layerOf } from "./bundle.ts";
import { type ChunkRole, DIGEST_ROLES, SELECTABLE_ROLES, chunkRole } from "./chunk-role.ts";
import { chunkHash } from "./rules-digest.ts";

/** 선별 방식을 켜는 환경변수 — 쉼표 목록, 용도(card·report) 또는 card 용도 안의 기능(writer·chat·comment). 비면 모두 통째로 넣기 */
export const SELECT_ENV_KEY = "KNOWLEDGE_SELECT";

const PURPOSES: readonly BundlePurpose[] = ["card", "report"];

/** card 용도 안의 기능 — 작성지원(요청 종류 넷·보완 점검)·질문·리뷰어 코멘트. 문자열 유니온(열거형 아님) */
export type SelectFeature = "writer" | "chat" | "comment";
export const SELECT_FEATURES: readonly SelectFeature[] = ["writer", "chat", "comment"];

/** 쉼표 목록에서 고를 수 있는 값만(소문자·앞뒤 공백 무시) */
function pick<T extends string>(env: string | undefined, allowed: readonly T[]): Set<T> {
  const out = new Set<T>();
  for (const raw of (env ?? "").split(",")) {
    const v = raw.trim().toLowerCase();
    const hit = allowed.find((p) => p === v);
    if (hit) out.add(hit);
  }
  return out;
}

/** 환경변수 값 → 선별 방식으로 할 용도. 비거나 모르는 값은 무시 */
export const selectPurposes = (env: string | undefined): Set<BundlePurpose> => pick(env, PURPOSES);

/** 환경변수 값 → 선별 방식으로 할 card 용도 기능. 비거나 모르는 값은 무시 */
export const selectFeatures = (env: string | undefined): Set<SelectFeature> => pick(env, SELECT_FEATURES);

/** 이 요청을 선별 방식으로 할지 — 용도가 켜졌거나, card 용도이고 그 기능이 켜졌으면. 기능을 모르면(안 넘김) 용도로만 판정(하위 호환) */
export function selectOn(env: string | undefined, purpose: BundlePurpose, feature?: SelectFeature): boolean {
  if (selectPurposes(env).has(purpose)) return true;
  return purpose === "card" && feature !== undefined && selectFeatures(env).has(feature);
}

/**
 * 선별 방식을 켤 트랙(쉼표 목록, 예: 주요사업). 비면 모든 트랙(실험 하위 호환). DB 출처(lib/ai/context.ts dbSelection)에만 씀 —
 * 다른 트랙에 규칙 문서를 올려도 그 트랙이 저절로 선별 방식이 되지 않게(꽂은 실험 출처는 그대로)
 */
export const SELECT_TRACKS_ENV_KEY = "KNOWLEDGE_SELECT_TRACKS";

/** 이 트랙이 선별 방식 대상인지 — 목록이 비면 모든 트랙 */
export function selectTrackOn(env: string | undefined, track: string): boolean {
  const list = (env ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return !list.length || list.includes(track);
}

/** DB 선별 결과(card_knowledge_select)에서 대응표 rejected를 뺀 뒤 이보다 적으면 통째로 넣기 — 주요사업 59장 Jev 선별 실측 하위 10% 경계(1~4건만 고른 카드는 근거가 거의 사라짐) */
export const SELECT_MIN_KEYS = 5;

/**
 * 규칙 문서 조각이 지금 원문과 맞는지 — 조각마다 meta.sources(원문 조각 key·글 해시, rules-digest.ts chunkHash)가 모두 지금 조각과 같아야 함.
 * sources 기록이 없거나, 원문 조각이 사라졌거나, 해시가 다르면 낡음(false). chunks = 이 트랙 조각 전부
 */
export function digestFresh(digests: BundleChunk[], chunks: BundleChunk[]): boolean {
  const now = new Map(chunks.map((c) => [c.chunk_key, c]));
  return digests.every((d) => {
    const sources = d.meta?.sources;
    if (!Array.isArray(sources)) return false;
    return sources.every((s: { key?: unknown; hash?: unknown } | null) => {
      const c = now.get(String(s?.key ?? ""));
      return c !== undefined && chunkHash(c) === s?.hash;
    });
  });
}

/**
 * 규칙 문서(한 범위의 조각들)가 그 범위의 지금 입력과 같은지 — 모든 조각의 meta.sources key 합집합이 지금 범위(scope = digestChunks 결과)의 key 집합과 같고 해시도 같아야 함.
 * 새 기준류 조각이 범위에 들어왔거나 빠졌거나 바뀌었으면 낡음(false). digests가 비면 이 범위 규칙 문서가 없는 것이라 판단하지 않음(true — 빈 자리는 digestCovers가 막음).
 * sources가 빈 목록이어도 범위가 비어 있지 않으면 낡음
 */
export function digestScopeFresh(digests: BundleChunk[], scope: BundleChunk[]): boolean {
  if (!digests.length) return true;
  const recorded = new Map<string, unknown>();
  for (const d of digests) {
    const sources = d.meta?.sources;
    if (!Array.isArray(sources)) return false;
    for (const s of sources as ({ key?: unknown; hash?: unknown } | null)[]) recorded.set(String(s?.key ?? ""), s?.hash);
  }
  if (recorded.size !== scope.length) return false;
  return scope.every((c) => recorded.has(c.chunk_key) && recorded.get(c.chunk_key) === chunkHash(c));
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
