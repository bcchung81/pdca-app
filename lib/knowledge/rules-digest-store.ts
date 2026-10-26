// 공통 규칙 문서를 운영 knowledge_chunks에 올릴 행 만들기(순수). 쓰는 일은 scripts/knowledge/rules-digest.ts(--write --yes).
// 모양(앱의 선별 방식이 읽음): 문서 doc_id = rules-biz(경영관리는 rules-mg), 조각 unit_type = rules_digest, 트랙 공통은 business = null·평가단위는 'BZ-1'…,
// meta = { usage: "rules_digest", sources: [{ key, hash }], promptVersion, model, generatedAt, reviewedAt?, checkSummary? }.
// 검색에는 안 나오게 searchable = false, 층에는 안 들어가게 layerOf가 rules_digest를 null로 돌림(bundle.ts).

import { createHash } from "node:crypto";
import type { TrackId } from "../tracks/index.ts";
import { RULES_DIGEST_UNIT } from "./bundle.ts";

export const RULES_DIGEST_USAGE = "rules_digest";

/** 트랙 → 규칙 문서의 문서 id */
export const RULES_DOC_ID: Record<TrackId, string> = { 주요사업: "rules-biz", 경영관리: "rules-mg" };

/** 규칙 문서 한 단위(rules/<id>.json + .md) 중 올리는 데 쓰는 칸 */
export interface StoredDigest {
  id: string;
  title: string;
  track: TrackId;
  /** 트랙 공통이면 null, 평가단위(BZ-1…)면 그 id */
  business: string | null;
  md: string;
  inputs: Array<{ key: string; hash: string }>;
  promptVersion: string;
  model: string;
  generatedAt: string;
}

export interface StoreExtras {
  /** 교차 검증 건수 요약(단위마다) */
  checkSummary?: Record<string, unknown>;
  reviewedAt?: string;
}

export const chunkKeyOf = (docId: string, id: string) => `${docId}/${id}`;

/** 조각 행(knowledge_chunks 열 그대로) */
export function digestChunkRow(d: StoredDigest, seq: number, extras: StoreExtras = {}): Record<string, unknown> {
  const docId = RULES_DOC_ID[d.track];
  return {
    chunk_key: chunkKeyOf(docId, d.id),
    doc_id: docId,
    seq,
    unit_type: RULES_DIGEST_UNIT,
    track: d.track,
    business: d.business,
    eval_item: null,
    measure: null,
    q_type: [],
    title: d.title,
    context_prefix: d.title,
    blocks: [d.md],
    text: d.md,
    search_text: d.md,
    searchable: false,
    dept_resp: [],
    dept_coop: [],
    meta: {
      usage: RULES_DIGEST_USAGE,
      sources: d.inputs.map((x) => ({ key: x.key, hash: x.hash })),
      promptVersion: d.promptVersion,
      model: d.model,
      generatedAt: d.generatedAt,
      ...(extras.reviewedAt ? { reviewedAt: extras.reviewedAt } : {}),
      ...(extras.checkSummary ? { checkSummary: extras.checkSummary } : {}),
    },
  };
}

/** 문서 행(knowledge_documents 열 그대로). sha256은 조각 글 전체의 해시라 글이 바뀌면 바뀜 */
export function digestDocumentRow(track: TrackId, chunks: Array<Record<string, unknown>>): Record<string, unknown> {
  const docId = RULES_DOC_ID[track];
  const sha256 = createHash("sha256").update(JSON.stringify(chunks.map((c) => [c.chunk_key, c.text]))).digest("hex");
  return {
    doc_id: docId,
    title: track === "주요사업" ? "공통 규칙 문서 — 주요사업" : "공통 규칙 문서 — 경영관리",
    file_name: `${docId}.md`,
    storage_path: null,
    tracks: [track],
    scope: "공통 규칙 문서(기준류 원문을 AI가 요약한 근거 메모 — 사실·숫자의 근거가 아님)",
    status: "ingest",
    sha256,
    parser_version: `rules-digest@${String((chunks[0]?.meta as { promptVersion?: string } | undefined)?.promptVersion ?? "?")}`,
    chunk_count: chunks.length,
    unit_counts: { [RULES_DIGEST_UNIT]: chunks.length },
    checks: [],
  };
}
