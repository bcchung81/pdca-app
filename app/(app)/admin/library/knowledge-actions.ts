"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { loadBundleChunks } from "../../../../lib/ai/context.ts";
import { requireAtLeast } from "../../../../lib/auth/dal.ts";
import { attachDocImages } from "../../../../lib/knowledge/extract-images.ts";
import type { SharedSizeRow } from "../../../../lib/knowledge/guard.ts";
import { changedMatchingDocs, deleteDocument, documentShas, registerMatching, removeDocumentFiles, saveDocumentsAndChunks, uploadDocumentImages } from "../../../../lib/knowledge/save.ts";
import type { Check } from "../../../../lib/knowledge/types.ts";
import { ingestUploadedFile, isUploadScope, precheckUpload, safeStorageName } from "../../../../lib/knowledge/upload.ts";
import { kickPrep } from "../../../../lib/prep/enqueue.ts";
import { createClient } from "../../../../lib/supabase/server.ts";

/**
 * 일반 문서 올리기(참고자료 5단계 「적재 통일」) — 관리 › 공통 자료·틀. 전용 파서가 있는 문서 8개와 붙임2는 여기서 안 다룸.
 * 흐름: ① startKnowledgeUpload = 서명 업로드 주소 ② 브라우저가 저장소(knowledge 버킷)에 바로 올림(함수 본문 한도 4.5MB와 무관) ③ finishKnowledgeUpload =
 * 저장소에서 내려받아 읽기·조각·검산·크기 보호(lib/knowledge/upload.ts) → 통과하면 저장(lib/knowledge/save.ts) + 과제 매칭 작업 등록. 실패하면 아무것도 안 남기고 저장소 파일도 지움.
 * 쓰기는 로그인 사용자 권한(RLS: 공통 지식·버킷 쓰기는 성과관리팀·관리자)으로 하고 이 액션은 관리자만.
 */

export type KnowledgeUploadResult = {
  ok: boolean;
  message: string;
  docId?: string;
  warnings: string[];
  guard: SharedSizeRow[];
  checks: Check[];
  stats?: { chunks: number; chars: number; byPage: boolean; splitDepth: number | null };
  matching?: { queued: number; skipped: number; message?: string };
};

const PATH_RE = /^(up-[0-9a-f]{8})\/source(\.[a-z0-9]{1,5})?$/;

export async function startKnowledgeUpload(fileName: string, bytes: number): Promise<{ ok: true; path: string; token: string } | { ok: false; message: string }> {
  const me = await requireAtLeast("admin", "/admin/library");
  if (!me) return { ok: false, message: "관리자만 올릴 수 있습니다." };
  const bad = precheckUpload(String(fileName), Number(bytes));
  if (bad) return { ok: false, message: bad };
  const path = `up-${randomBytes(4).toString("hex")}/${safeStorageName(String(fileName))}`;
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("knowledge").createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: "올릴 주소를 만들지 못했습니다." };
  return { ok: true, path: data.path, token: data.token };
}

export async function finishKnowledgeUpload(input: { path: string; fileName: string; title: string; edition: string; issuer: string; year: number; scope: string }): Promise<KnowledgeUploadResult> {
  const fail = (message: string, extra: Partial<KnowledgeUploadResult> = {}): KnowledgeUploadResult => ({ ok: false, message, warnings: [], guard: [], checks: [], ...extra });
  const me = await requireAtLeast("admin", "/admin/library");
  if (!me) return fail("관리자만 올릴 수 있습니다.");
  const m = PATH_RE.exec(String(input.path));
  if (!m) return fail("올린 파일 경로가 올바르지 않습니다. 다시 올려 주세요.");
  if (!isUploadScope(input.scope)) return fail("올릴 범위를 골라 주세요.");
  const year = Number(input.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return fail("기준연도를 확인해 주세요.");
  const docId = m[1];
  const supabase = await createClient();
  const discard = async () => {
    await supabase.storage.from("knowledge").remove([input.path]);
  };

  const dl = await supabase.storage.from("knowledge").download(input.path);
  if (dl.error || !dl.data) return fail("올린 파일을 찾지 못했습니다. 다시 올려 주세요.");
  const bytes = new Uint8Array(await dl.data.arrayBuffer());
  const [existing, shas] = await Promise.all([loadBundleChunks(supabase, "all", { fresh: true }), documentShas(supabase)]);
  const out = await ingestUploadedFile({
    docId,
    fileName: String(input.fileName).slice(0, 300),
    storagePath: `knowledge/${input.path}`,
    bytes,
    title: String(input.title),
    edition: String(input.edition ?? "").slice(0, 100),
    issuer: String(input.issuer ?? "").slice(0, 100),
    basisYear: year,
    scope: input.scope,
    existing,
    existingShas: shas,
    uploadedBy: me.id,
  });
  const report = { warnings: out.warnings, guard: out.guard, checks: out.checks };
  if (!out.ok || !out.document || !out.chunks) {
    await discard();
    return fail(out.message ?? "읽지 못했습니다.", report);
  }

  // 그림: 원본에서 꺼내 조각 쪽 범위에 짝짓고(meta.images) 비공개 버킷에 올림. 못 꺼내거나 못 올려도 글 적재는 계속(안내만)
  const withImages = await attachDocImages(bytes, String(input.fileName), out.chunks);
  let chunks = withImages.chunks;
  let imageCount = withImages.images.length;
  try {
    await uploadDocumentImages(supabase, docId, withImages.images);
  } catch (e) {
    console.error("finishKnowledgeUpload images", (e as Error).message);
    chunks = out.chunks; // 올리지 못한 그림을 조각이 가리키지 않게
    imageCount = 0;
    report.warnings.push("그림을 올리지 못해 글만 적재했습니다 — 나중에 pnpm knowledge:images로 붙일 수 있습니다.");
  }
  report.warnings.push(...withImages.warnings);

  try {
    await saveDocumentsAndChunks(supabase, [out.document], chunks as unknown as Array<Record<string, unknown>>);
  } catch (e) {
    console.error("finishKnowledgeUpload save", (e as Error).message);
    await deleteDocument(supabase, docId).catch(() => {}); // 조각·대응표는 연쇄 삭제
    await removeDocumentFiles(supabase, docId); // 원본과 올린 그림
    return fail("문서를 저장하지 못했습니다. 저장 중이던 것은 모두 되돌렸으니 다시 올려 주세요.", report);
  }
  const reg = await registerMatching(supabase, changedMatchingDocs(shas, [out.document], chunks), chunks, { requestedBy: me.id });
  if (reg.queued > 0) kickPrep();
  revalidatePath("/admin/library");
  revalidatePath("/knowledge");
  return {
    ok: true,
    docId,
    message: `「${String(out.document.title)}」을 적재했습니다 — 조각 ${chunks.length}개${imageCount ? ` · 그림 ${imageCount}장` : ""}.`,
    ...report,
    stats: { chunks: chunks.length, chars: out.stats?.chars ?? 0, byPage: out.stats?.byPage ?? false, splitDepth: out.stats?.splitDepth ?? null },
    matching: { queued: reg.queued, skipped: reg.skipped, message: reg.message },
  };
}

/** 화면에서 올린 일반 문서 지우기(문서 id가 up-…인 것만 — 전용 파서 문서·붙임2는 여기서 못 지움). 조각과 과제 대응표 행(확정 포함)도 함께 지워짐 */
export async function removeKnowledgeDocument(docId: string): Promise<{ ok: boolean; message: string }> {
  const me = await requireAtLeast("admin", "/admin/library");
  if (!me) return { ok: false, message: "관리자만 지울 수 있습니다." };
  if (!/^up-[0-9a-f]{8}$/.test(String(docId))) return { ok: false, message: "화면에서 올린 일반 문서만 지울 수 있습니다." };
  const supabase = await createClient();
  try {
    await deleteDocument(supabase, docId);
  } catch {
    return { ok: false, message: "지우지 못했습니다." };
  }
  const cleaned = await removeDocumentFiles(supabase, docId);
  revalidatePath("/admin/library");
  revalidatePath("/knowledge");
  return { ok: true, message: cleaned ? "문서와 조각을 지웠습니다." : "문서와 조각은 지웠지만 저장소 파일은 지우지 못했습니다(대시보드에서 확인)." };
}
