// 일반 문서 올리기의 읽기 코어(참고자료 5단계 「적재 통일」, docs/reference-materials.md §4.1): 파일 바이트 → kordoc → 범용 조각기 → 검산·크기 보호 → 문서 행·조각.
// 화면 업로드(서버 액션)와 CLI(`pnpm knowledge:add`)가 같은 이 함수를 부른다 — 입출력은 읽기(kordoc)뿐, DB·저장소는 안 만짐(쓰기는 save.ts).
// 원칙: 읽기·검산·크기 보호 어느 하나라도 실패하면 ok:false로 돌려주고 호출자는 아무것도 저장하지 않는다(조용히 자르지 않고 멈춰 알림).

import { createHash } from "node:crypto";
import { blocksToChunks, parse } from "kordoc";
import type { BundleChunk } from "./bundle.ts";
import { GENERIC_MAX_CHARS, type GenericResult, genericChunks } from "./generic.ts";
import { SHARED_CHARS_LIMIT, type SharedSizeRow, overLimitMessage, sharedSizeReport } from "./guard.ts";
import { loadKordocChunks } from "./source.ts";
import type { Check, KnowledgeChunk } from "./types.ts";
import { UPLOAD_SCOPES, type UploadScope, precheckUpload, scopeTags, UPLOAD_EXTS, UPLOAD_MAX_BYTES, UPLOAD_WARN_BYTES, isUploadScope, safeStorageName } from "./upload-scope.ts";

/** 범용 조각기 판 — 바뀌면 같은 원본도 다시 읽음 */
export const GENERIC_PARSER_VERSION = "generic-1";
export interface UploadInput {
  docId: string;
  fileName: string;
  storagePath: string | null;
  bytes: Uint8Array;
  title: string;
  edition?: string;
  issuer?: string;
  basisYear: number;
  scope: UploadScope;
  /** 지금 DB의 공통 지식 조각(크기 보호 계산용 — loadBundleChunks) */
  existing: BundleChunk[];
  /** 지금 DB의 문서 id → sha256(같은 파일 두 번 적재 방지) */
  existingShas: Map<string, string | null>;
  uploadedBy?: string | null;
}

export interface UploadOutcome {
  ok: boolean;
  /** 사람이 읽을 문장(실패 사유 또는 경고 요약) */
  message?: string;
  duplicateOf?: string;
  document?: Record<string, unknown>;
  chunks?: KnowledgeChunk[];
  checks: Check[];
  guard: SharedSizeRow[];
  stats?: GenericResult["stats"];
  warnings: string[];
}

/** kordoc 읽기 — 시험에서 바꿔 끼울 수 있게 분리 */
export interface UploadDeps {
  read: (bytes: Uint8Array) => Promise<{ success: true; chunks: unknown } | { success: false; reason: string }>;
}

export const kordocDeps: UploadDeps = {
  async read(bytes) {
    try {
      const res = await parse(Buffer.from(bytes), { images: false });
      if (!res.success) return { success: false, reason: res.code ?? "형식 오류" };
      return { success: true, chunks: blocksToChunks(res.blocks) };
    } catch {
      return { success: false, reason: "손상되었거나 암호가 걸린 파일" };
    }
  },
};

const scopeText = (s: UploadScope) => UPLOAD_SCOPES.find((x) => x.value === s)!.label;

/** 파일 하나 읽기 → 조각·검산·크기 보호. ok:false면 저장하지 않음 */
export async function ingestUploadedFile(input: UploadInput, deps: UploadDeps = kordocDeps): Promise<UploadOutcome> {
  const fail = (message: string, extra: Partial<UploadOutcome> = {}): UploadOutcome => ({ ok: false, message, checks: [], guard: [], warnings: [], ...extra });
  const pre = precheckUpload(input.fileName, input.bytes.byteLength);
  if (pre) return fail(pre);
  if (!input.title.trim()) return fail("문서 제목을 적어 주세요.");

  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  for (const [id, sha] of input.existingShas) if (sha === sha256) return fail(`이미 올린 파일입니다(문서 ${id}). 같은 파일을 두 번 적재하면 AI 요청이 그만큼 커집니다.`, { duplicateOf: id });

  const read = await deps.read(input.bytes);
  if (!read.success) return fail(`파일을 읽지 못했습니다(${read.reason}). 손상되었거나 암호가 걸려 있는지 확인해 주세요.`);

  const tags = scopeTags(input.scope);
  const result = genericChunks(loadKordocChunks(read.chunks), { docId: input.docId, docTitle: input.title.trim(), ...tags });
  const warnings = result.checks.filter((c) => !c.ok && c.level === "warn").map((c) => `${c.name}: ${String(c.actual)}`);
  if (input.bytes.byteLength > UPLOAD_WARN_BYTES) warnings.push(`큰 파일(${Math.round(input.bytes.byteLength / 1024 / 1024)}MB) — 서버에서 읽는 시간은 재지 않았습니다. 실패하면 pnpm knowledge:add로 올려 주세요.`);

  const errors = result.checks.filter((c) => !c.ok && c.level === "error");
  if (errors.length) {
    const why = errors.map((c) => `${c.name}${c.note ? `(${c.note})` : ""} — 실제 ${String(c.actual)}`).join(" · ");
    return fail(`검산에서 멈췄습니다: ${why}`, { checks: result.checks, stats: result.stats, warnings });
  }

  // 크기 보호: 이 범위로 올리면 사업별 공유 층이 상한을 넘는가(검색 전용은 AI 근거에 안 들어가 늘지 않음)
  const guard = sharedSizeReport(input.existing, result.chunks as unknown as BundleChunk[]);
  const over = overLimitMessage(guard);
  if (over && !tags.searchOnly) return fail(over, { checks: result.checks, guard, stats: result.stats, warnings });

  const document: Record<string, unknown> = {
    doc_id: input.docId,
    title: input.title.trim(),
    file_name: input.fileName,
    storage_path: input.storagePath,
    edition: input.edition?.trim() || null,
    issuer: input.issuer?.trim() || null,
    basis_year: input.basisYear,
    tracks: [tags.track],
    scope: `일반 문서(범용 조각기) — ${scopeText(input.scope)}`,
    status: "ingest",
    sha256,
    parser_version: GENERIC_PARSER_VERSION,
    chunk_count: result.chunks.length,
    unit_counts: { generic_section: result.chunks.length },
    checks: result.checks,
    ...(input.uploadedBy ? { uploaded_by: input.uploadedBy } : {}),
  };
  return { ok: true, document, chunks: result.chunks, checks: result.checks, guard, stats: result.stats, warnings };
}

// 화면·CLI·시험이 한 곳에서 가져오도록 순수 상수도 다시 내보냄
export { GENERIC_MAX_CHARS, SHARED_CHARS_LIMIT, UPLOAD_EXTS, UPLOAD_MAX_BYTES, UPLOAD_SCOPES, UPLOAD_WARN_BYTES, isUploadScope, precheckUpload, safeStorageName, scopeTags };
export type { UploadScope };
