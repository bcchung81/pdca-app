// 올리는 문서가 요청 크기를 넘기지 않게 막는 크기 보호(참고자료 5단계, docs/reference-materials.md §4.1·§7). 순수 함수.
// 공통 지식은 규칙 범위 전부를 모든 요청에 넣으므로(자르지 않음) 문서 하나가 모든 과제의 요청을 키운다 — 요청 때 BudgetError로 멈추기보다 올릴 때 막는다.
// 재는 것은 실제 요청 앞에 붙는 글(조각 봉투·위치 약칭 포함 — layerBlocks)이고, 트랙마다 공통 지식 단위(주요사업 사업 BZ-1~3·경영관리 지표 MG-1~14)별 자기 공유 층(①②③) 합계를 본다.

import { type BundleChunk, type BundlePurpose, LAYER_ORDER, chunkRef, layerBlocks, layerOf } from "./bundle.ts";
import { BIZ_TRACK, DEFAULT_TRACK, TRACK_SPECS } from "../tracks/index.ts";
import { SHARED_CHARS_LIMIT } from "./limits.ts";

export { SHARED_CHARS_LIMIT };
/** 크기를 보는 주요사업 평가단위(트랙별 목록은 `TrackSpec.sharedUnits`) */
export const SHARED_UNITS = BIZ_TRACK.sharedUnits;

/** 이 사업 요청 앞에 붙는 공유 층(①②③) 글자 수 — 과제원장 AI와 경평 초안 중 더 큰 쪽(경평 초안에는 작성 방법론 자료가 더 들어감) */
export function sharedChars(chunks: BundleChunk[], unit: string): number {
  const size = (purpose: BundlePurpose) => {
    const layers = LAYER_ORDER.map((id) => ({ id, refs: chunks.filter((c) => layerOf(c, unit, purpose) === id).map(chunkRef) }));
    return Object.values(layerBlocks(layers)).reduce((n, text) => n + text.length, 0);
  };
  return Math.max(size("card"), size("report"));
}

export interface SharedSizeRow {
  /** 공통 지식 단위(주요사업 사업 BZ-1~3, 경영관리 지표 MG-1~14) */
  unit: string;
  /** 단위가 속한 트랙 */
  track: string;
  /** 올리기 전 */
  before: number;
  /** 올린 뒤 */
  after: number;
  limit: number;
  /** 올린 뒤 남는 여유(음수면 넘음) */
  room: number;
  over: boolean;
}

/**
 * 새 조각을 더했을 때 트랙·단위별 공유 층 크기. existing에 같은 문서 조각이 이미 있으면 새 조각으로 바꿔서 잼.
 * 주요사업은 늘 보고하고(예전과 같음), 다른 트랙은 이번에 더하는 조각이 그 트랙의 요청에 닿을 때만(그 트랙 조각이거나 두 트랙 공통인 가점) 보고한다 —
 * 그래서 한 트랙의 자료를 올려도 다른 트랙의 한도를 먹지 않고, 다른 트랙 자료가 많아도 이 트랙 올리기가 막히지 않는다(existing에는 모든 트랙의 조각을 넘길 것).
 */
export function sharedSizeReport(existing: BundleChunk[], added: BundleChunk[], limit = SHARED_CHARS_LIMIT): SharedSizeRow[] {
  const docs = new Set(added.map((c) => c.doc_id));
  const base = existing.filter((c) => !docs.has(c.doc_id));
  return Object.values(TRACK_SPECS)
    .filter((spec) => spec.id === DEFAULT_TRACK.id || added.some((c) => spec.knowledgeTracks.includes(c.track)))
    .flatMap((spec) =>
      spec.sharedUnits.map((unit) => {
        const before = sharedChars(existing, unit);
        const after = sharedChars([...base, ...added], unit);
        return { unit, track: spec.id, before, after, limit, room: limit - after, over: after > limit };
      }),
    );
}

/** 넘는 사업이 있으면 사람이 읽을 문장, 없으면 null */
export function overLimitMessage(rows: SharedSizeRow[]): string | null {
  const over = rows.filter((r) => r.over);
  if (!over.length) return null;
  const fmt = (n: number) => `${Math.round(n / 1000).toLocaleString("ko-KR")}천 자`;
  return `이 범위로 올리면 요청 앞에 붙는 공통 지식이 상한(${fmt(SHARED_CHARS_LIMIT)})을 넘습니다 — ${over.map((r) => `${r.unit} ${fmt(r.after)}`).join(" · ")}. 「검색 전용」으로 올리거나 범위를 줄여 주세요.`;
}
