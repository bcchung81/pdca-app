// 공통 지식 문서를 DB에 쓰는 공유 함수(참고자료 5단계 「적재 통일」, docs/reference-materials.md §4.1).
// 시드(`pnpm db:seed` — 서비스 키), 화면 업로드·붙임2(로그인 사용자 권한), CLI(`pnpm knowledge:add`)가 모두 이 규칙으로 쓴다:
//  문서 업서트 → (조각 넣기 전 훅: 그림 올리기 등) → 조각 업서트 → 이번에 없는 옛 조각은 prune일 때만 삭제(그 조각의 대응표 행도 연쇄 삭제) →
//  새로 생기거나 판(sha256)이 바뀐 문서는 활성 카드에 그 문서만 다시 매칭하는 작업 등록(사람이 확정·뺀 대응은 다시 매칭해도 안 덮임).
// supabase 클라이언트를 인자로 받는 입출력 함수라 server-only를 안 걸었다(스크립트에서도 씀). 문서 사이 작업(지적 연결·과제 대응표)은 여기 없다 — 시드에만 있음.

import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueWith } from "../prep/enqueue-core.ts";
import { mergeQueuedJob } from "../prep/merge-queued.ts";
import { SCOPE_UNIT_TYPES } from "../prep/scope.ts";
import { trackSpecOfUnit } from "../tracks/index.ts";
import { clearChunkCache } from "./chunk-cache.ts";
import { knowledgeImagePath } from "./images.ts";
import { REPORT_METHOD_USAGE } from "./usage.ts";
import type { NewJob } from "../prep/types.ts";

type Row = Record<string, unknown>;

const BATCH = 100;

function must(label: string, res: { error: { message: string } | null }): void {
  if (res.error) throw new Error(`${label}: ${res.error.message}`);
}

/** 문서 id → 지금 저장된 sha256(새 문서는 없음) — 판이 바뀐 문서를 알아내려고 쓰기 전에 읽어 둠 */
export async function documentShas(db: SupabaseClient): Promise<Map<string, string | null>> {
  const { data, error } = await db.from("knowledge_documents").select("doc_id, sha256");
  if (error) throw new Error(`documents sha: ${error.message}`);
  return new Map((data ?? []).map((d) => [String(d.doc_id), (d.sha256 as string | null) ?? null]));
}

export interface SaveOptions {
  /** 이번 적재에 없는 옛 조각 삭제(그 조각의 대응표 행도 연쇄 삭제). 없으면 남기고 건수만 알림 */
  prune?: boolean;
  /** 문서를 넣은 뒤 조각을 넣기 전에 부르는 훅(그림 올리기 등) */
  beforeChunks?: () => Promise<void>;
  log?: (message: string) => void;
}

export interface SaveReport {
  documents: number;
  chunks: number;
  /** 문서 id → 이번 적재에 없는 옛 조각 수 */
  stale: Record<string, number>;
  pruned: number;
}

async function upsertBatches(db: SupabaseClient, table: string, list: Row[], onConflict: string): Promise<void> {
  for (let i = 0; i < list.length; i += BATCH) must(`${table} upsert`, await db.from(table).upsert(list.slice(i, i + BATCH), { onConflict }));
}

/** 문서·조각 쓰기(위 규칙). 실패하면 던진다 — 화면·CLI는 deleteDocument로 되돌림 */
export async function saveDocumentsAndChunks(db: SupabaseClient, documents: Row[], chunks: Row[], opts: SaveOptions = {}): Promise<SaveReport> {
  try {
    return await writeDocumentsAndChunks(db, documents, chunks, opts);
  } finally {
    clearChunkCache(); // 이 서버의 조각 캐시(5분)를 비움 — 실패로 일부만 썼어도(개선 계획 P2-2)
  }
}

async function writeDocumentsAndChunks(db: SupabaseClient, documents: Row[], chunks: Row[], opts: SaveOptions): Promise<SaveReport> {
  const log = opts.log ?? (() => {});
  await upsertBatches(db, "knowledge_documents", documents, "doc_id");
  log(`knowledge_documents ${documents.length}`);
  await opts.beforeChunks?.();
  await upsertBatches(db, "knowledge_chunks", chunks, "chunk_key");
  log(`knowledge_chunks ${chunks.length}`);

  // 이번 적재에 없는 옛 조각
  const fresh = new Set(chunks.map((c) => String(c.chunk_key)));
  const stale: Record<string, number> = {};
  let pruned = 0;
  for (const doc of documents) {
    const { data, error } = await db.from("knowledge_chunks").select("chunk_key").eq("doc_id", doc.doc_id as string);
    if (error) throw new Error(`chunks keys: ${error.message}`);
    const old = (data ?? []).map((r) => String(r.chunk_key)).filter((k) => !fresh.has(k));
    if (!old.length) continue;
    if (!opts.prune) {
      stale[String(doc.doc_id)] = old.length;
      log(`${doc.doc_id}: 옛 조각 ${old.length}개 남음(prune으로 삭제)`);
      continue;
    }
    for (let i = 0; i < old.length; i += BATCH) must("prune", await db.from("knowledge_chunks").delete().in("chunk_key", old.slice(i, i + BATCH)));
    pruned += old.length;
    log(`${doc.doc_id}: 옛 조각 ${old.length}개 삭제`);
  }
  return { documents: documents.length, chunks: chunks.length, stale, pruned };
}

type ChunkLike = { doc_id?: unknown; unit_type?: unknown; business?: unknown; track?: unknown; meta?: unknown };

/** 과제 매칭 대상 조각: 대응표 대상 유형이고 검색 전용(meta.search_only)·경평 초안 작성 방법론(meta.usage)이 아닌 것 — 둘 다 과제원장 쪽 매칭 후보에서 빠지므로(layerOf) 작업을 만들어도 헛일 */
const isMatchable = (c: ChunkLike) => {
  const meta = c.meta as { search_only?: unknown; usage?: unknown } | null | undefined;
  return SCOPE_UNIT_TYPES.includes(String(c.unit_type)) && meta?.search_only !== true && meta?.usage !== REPORT_METHOD_USAGE;
};

/** 매칭 대상 조각이 있고, 새 문서이거나 판(sha256)이 바뀐 문서 id */
export function changedMatchingDocs(before: Map<string, string | null>, documents: Row[], chunks: ChunkLike[]): string[] {
  const scopeDocs = new Set(chunks.filter(isMatchable).map((c) => String(c.doc_id)));
  return documents.map((d) => ({ id: String(d.doc_id), sha: (d.sha256 as string | null) ?? null })).filter((d) => scopeDocs.has(d.id) && before.get(d.id) !== d.sha).map((d) => d.id);
}

/**
 * 조각이 닿는 카드인가 — 같은 트랙의 카드만(조각의 트랙이 카드 트랙의 공통 지식 트랙에 들어야 함, 가점은 두 트랙 모두).
 * 주요사업: 기관 공통·공통지표·가점·사업 미지정이면 그 트랙의 모든 카드, 사업이 정해졌으면 그 사업의 카드만.
 * 경영관리: 지표(MG-n)를 정한 조각도 카드 쪽 지표를 아직 모르므로(카드는 묶음 단위) 그 트랙의 모든 카드에 닿는 것으로 봄 — 매칭 작업이 조금 더 만들어질 뿐 다른 트랙에는 안 번짐
 */
function reaches(c: ChunkLike, card: { eval_unit_id: string }): boolean {
  const spec = trackSpecOfUnit(card.eval_unit_id);
  if (!spec.knowledgeTracks.includes(String(c.track))) return false;
  if (spec.id !== "주요사업" || c.business == null || c.business === "BZ-4" || c.track === "가점") return true;
  return String(c.business) === card.eval_unit_id;
}

/**
 * 과제마다 다시 매칭할 문서 목록 — 문서의 조각이 닿는 카드만(`reaches` — 트랙이 같고, 주요사업은 사업까지 같거나 기관 공통·공통지표·가점·사업 미지정).
 * 같은 과제의 대기 작업은 하나뿐이라 문서 목록은 한 작업의 payload에 모음
 */
export function planMatchingJobs(cards: Array<{ id: string; eval_unit_id: string }>, docIds: string[], chunks: ChunkLike[]): NewJob[] {
  const own = new Map(docIds.map((id) => [id, chunks.filter((c) => String(c.doc_id) === id && isMatchable(c))]));
  const jobs: NewJob[] = [];
  for (const card of cards) {
    const docs = docIds.filter((id) => own.get(id)!.some((c) => reaches(c, card)));
    if (docs.length) jobs.push({ kind: "match_knowledge", target: card.id, payload: { docIds: docs } });
  }
  return jobs;
}

export interface MatchingReport {
  queued: number;
  skipped: number;
  /** 이미 대기 중인 작업에 이번 문서 목록을 합친 건수(서비스 키 경로만) */
  merged?: number;
  docs: string[];
}

/**
 * 바뀐 문서의 과제 매칭 작업 등록(등록만 — 처리는 자동 처리 정책·`pnpm prep run --ai`). 실패해도 적재는 끝난 뒤라 던지지 않고 message를 돌려줌.
 * requestedBy: 사용자 권한(RLS)으로 등록할 때 본인 id(RLS가 강제), 서비스 키(시드·CLI)는 비움
 */
export async function registerMatching(
  db: SupabaseClient,
  docIds: string[],
  chunks: ChunkLike[],
  opts: { requestedBy?: string } = {},
): Promise<MatchingReport & { message?: string }> {
  if (!docIds.length) return { queued: 0, skipped: 0, docs: [] };
  try {
    const { data, error } = await db.from("cards").select("id, eval_unit_id").eq("status", "active");
    if (error) throw new Error(error.message);
    const jobs = planMatchingJobs((data ?? []) as Array<{ id: string; eval_unit_id: string }>, docIds, chunks);
    // 서비스 키(시드·CLI)는 이미 대기 중인 같은 과제 작업에 이번 문서 목록을 합침, 사용자 권한(RLS)은 prep_jobs를 못 고쳐 건너뛰기만
    const { queued, skipped, merged } = await enqueueWith(
      async (job) => {
        const { error: e } = await db.from("prep_jobs").insert({ kind: job.kind, target: job.target, payload: job.payload ?? {}, ...(opts.requestedBy ? { requested_by: opts.requestedBy } : {}) });
        return { error: e };
      },
      jobs,
      opts.requestedBy ? undefined : mergeQueuedJob(db),
    );
    return { queued, skipped, ...(merged ? { merged } : {}), docs: docIds };
  } catch (e) {
    // 새 표가 아직 없으면(pnpm db:push 전) 나중에 pnpm prep enqueue --match로 등록
    return { queued: 0, skipped: 0, docs: docIds, message: (e as Error).message };
  }
}

/** 문서 행 삭제 — 조각과 그 조각의 과제 대응표 행은 연쇄 삭제(on delete cascade). 저장소 파일은 removeDocumentFiles */
export async function deleteDocument(db: SupabaseClient, docId: string): Promise<void> {
  must("delete document", await db.from("knowledge_documents").delete().eq("doc_id", docId));
  clearChunkCache();
}

/** 문서의 그림을 비공개 버킷 knowledge/<doc_id>/images/<이름>에 올림(같은 이름은 덮어씀). 하나라도 못 올리면 던짐 — 호출자가 문서를 저장하지 않고 되돌림 */
export async function uploadDocumentImages(db: SupabaseClient, docId: string, images: Array<{ file: string; mime: string; data: Uint8Array }>): Promise<number> {
  for (const img of images) {
    const { error } = await db.storage.from("knowledge").upload(knowledgeImagePath(docId, img.file), img.data, { upsert: true, contentType: img.mime });
    if (error) throw new Error(`그림 올리기 실패(${img.file}): ${error.message}`);
  }
  return images.length;
}

/** 저장소(knowledge 버킷)의 그 문서 파일 삭제 — 폴더 <doc_id>/ 아래 파일과 그림. 못 지워도 던지지 않고 false */
export async function removeDocumentFiles(db: SupabaseClient, docId: string): Promise<boolean> {
  try {
    const bucket = db.storage.from("knowledge");
    const paths: string[] = [];
    for (const dir of [docId, `${docId}/images`]) {
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await bucket.list(dir, { limit: 1000, offset });
        if (error || !data?.length) break;
        for (const o of data) if (o.id) paths.push(`${dir}/${o.name}`);
        if (data.length < 1000) break;
      }
    }
    if (paths.length) {
      const { error } = await bucket.remove(paths);
      if (error) return false;
    }
    return true;
  } catch {
    return false;
  }
}
